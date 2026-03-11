"""
VoC Chat Agent — Multi-Tool ReAct Agent
Replaces the single-pass SQL chain with a proper tool-calling agent that can:
  1. Run structured SQL queries (sql_analytics)
  2. Synthesize qualitative insights from review text (synthesize_reviews)
  3. Perform semantic similarity search (semantic_search, if pgvector available)
  4. Maintain conversation context (history passed per request)
"""

import os
import logging
import queue
from typing import Any, Dict, List, Optional

from sqlalchemy import create_engine, event
from langchain_openai import ChatOpenAI
from langchain.agents import create_tool_calling_agent, AgentExecutor
from langchain_core.callbacks import BaseCallbackHandler
from langchain_core.agents import AgentAction, AgentFinish
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.messages import HumanMessage, AIMessage

from services.chat_tools import (
    make_sql_analytics_tool,
    make_synthesize_reviews_tool,
    make_semantic_search_tool,
)

logger = logging.getLogger(__name__)


# ── Streaming Callback Handler ────────────────────────────────────────────────

class ChatStreamingCallback(BaseCallbackHandler):
    """
    Thread-safe LangChain callback that pushes SSE events into a queue.
    The queue is drained by the async SSE generator in the FastAPI endpoint.
    """

    def __init__(self, event_queue: queue.Queue):
        super().__init__()
        self._q = event_queue
        self.tokens_emitted = 0

    def _emit(self, event: dict) -> None:
        self._q.put(event)

    def on_tool_start(self, serialized: Dict[str, Any], input_str: str, **kwargs: Any) -> None:
        """Fires when any tool starts — works with create_tool_calling_agent."""
        tool_name = serialized.get("name", kwargs.get("name", "unknown"))
        self._emit({
            "type": "tool_call",
            "tool": tool_name,
            "input": input_str[:500],
        })

    def on_agent_action(self, action: AgentAction, **kwargs: Any) -> None:
        """Fires for older ReAct-style agents (fallback, may not fire for tool-calling agents)."""
        self._emit({
            "type": "tool_call",
            "tool": action.tool,
            "input": str(action.tool_input)[:500],
        })

    def on_tool_end(self, output: str, **kwargs: Any) -> None:
        """Fires when a tool returns its result."""
        summary = output[:600] + "…" if len(output) > 600 else output
        self._emit({
            "type": "tool_result",
            "content": summary,
        })

    def on_llm_new_token(self, token: str, **kwargs: Any) -> None:
        """Fires for each LLM token (requires streaming=True on the LLM)."""
        if token:
            self._emit({"type": "token", "content": token})
            self.tokens_emitted += 1

    def on_agent_finish(self, finish: AgentFinish, **kwargs: Any) -> None:
        """Fires when the agent completes reasoning."""
        if finish.log and finish.log.strip():
            self._emit({"type": "thinking", "content": finish.log.strip()})

    def on_llm_error(self, error: Exception, **kwargs: Any) -> None:
        self._emit({"type": "error", "content": str(error)})


# ── Read-Only Database Engine ────────────────────────────────────────────────

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL environment variable is required")

try:
    parts = DATABASE_URL.split("@")
    protocol = parts[0].split("://")[0]
    host_and_db = parts[1]
    READONLY_URL = f"{protocol}://voc_readonly:voc_readonly_pwd_321$@{host_and_db}"
except Exception as e:
    logger.error(f"Failed to parse DATABASE_URL to build READONLY_URL: {e}")
    READONLY_URL = DATABASE_URL

readonly_engine = create_engine(
    READONLY_URL,
    pool_size=5,
    max_overflow=10,
    pool_timeout=30,
    pool_recycle=1800,
    pool_pre_ping=True,
)

# ── VoC System Prompt ────────────────────────────────────────────────────────

VOC_SYSTEM_PROMPT = """You are a senior Voice of Customer (VoC) analyst for the VoC Intelligence platform.
You help users understand their customer feedback across multiple companies and review platforms (App Store, Google Play, Google Maps, Trustpilot).

You have access to these analysis tools:
- sql_analytics: for structured data — counts, percentages, trends, rankings, date comparisons, platform and brand breakdowns
- synthesize_reviews: for qualitative insights — what customers actually say, complaint themes, feature requests, pain points, praise, sentiment drivers
- semantic_search: for concept-based discovery — finding reviews about a topic even without exact keyword matches (only available if embeddings exist)

## When to use each tool:

Use sql_analytics when the question asks for:
  "How many...", "What percentage...", "Which company has more...", "Trend over time...", "Average rating...", "Top 5 by count..."

Use synthesize_reviews when the question asks for:
  "What are customers saying about...", "Top complaints...", "Most requested features...", "Why do users leave negative reviews...", "What do users praise..."

Use semantic_search when the question asks for:
  "Find reviews about [specific topic]...", "Show me reviews mentioning [concept]..."

For complex questions, use MULTIPLE tools:
  Example: "What are the top complaints and how many reviews mention them?"
  → First use synthesize_reviews to identify themes, then sql_analytics to quantify each theme

## Scope — what you will and will not answer

You ONLY answer questions directly related to:
- Customer reviews, ratings, and feedback in this portfolio
- Sentiment, dimensions, themes, and trends derived from those reviews
- Comparisons between companies, platforms, or time periods within this data
- The VoC platform itself (how to interpret results, what a metric means)

If a user asks anything outside this scope (general knowledge, current events,
coding help, personal advice, or any topic unrelated to the portfolio's customer
feedback), respond with exactly:
"I can only help with questions about your customer reviews and VoC data.
Please ask me something about the feedback in this portfolio."

Do NOT attempt to answer, rephrase, or partially answer out-of-scope questions.

## Analyst guidelines:
- Always mention how many reviews were analyzed
- Flag low sample sizes (< 20 reviews) as potentially not representative
- Be specific: include themes with percentages AND verbatim example quotes
- For company comparisons, be objective and back claims with data
- When you cannot answer something, say so clearly and explain why
- Respond in the same language the user writes in
- Brand name resolution: users may give partial brand names (e.g. "Sixt" instead of "Sixt Saudi Arabia"). Always use wildcard ILIKE ('%name%') when matching brand/company names, and prefer filtering via the companies table JOIN (JOIN companies c ON reviews.company_id = c.id WHERE c.company_name ILIKE '%partial%') for accurate results

## Response formatting:
- Use `###` headers for each brand/company name when covering multiple brands (e.g. `### Calo`)
- Always leave a blank line between each brand section
- Use bullet points (`-`) for properties within a section
- Never run multiple brand sections together without vertical whitespace

Row Level Security is active — all data is automatically restricted to the current portfolio. Never add portfolio_id filters manually."""


# ── Main Agent Runner ────────────────────────────────────────────────────────

def run_chat_agent(
    portfolio_id: int,
    user_message: str,
    conversation_history: Optional[List[dict]] = None,
) -> str:
    """
    Run the VoC multi-tool agent for a given portfolio and user message.

    Args:
        portfolio_id: Portfolio to analyze (enforced by RLS)
        user_message: The user's current question
        conversation_history: List of prior turns, each a dict with 'role' ('user'|'ai') and 'content'
    Returns:
        AI response as a string
    """
    openai_key = os.getenv("OPENAI_API_KEY")
    if not openai_key:
        return "Error: OPENAI_API_KEY is not configured."

    logger.info(f"🤖 VoC Agent started for portfolio {portfolio_id}: {user_message[:60]}...")

    # Inject RLS context for all connections checked out of pool during this request
    def set_rls(dbapi_connection, _connection_record, _connection_proxy):
        cursor = dbapi_connection.cursor()
        cursor.execute(f"SET app.current_portfolio_id = '{portfolio_id}';")
        cursor.close()

    event.listen(readonly_engine, "checkout", set_rls)

    try:
        llm = ChatOpenAI(model="gpt-4o", temperature=0, api_key=openai_key)

        # Build tool list — semantic search only if pgvector is available
        tools = [
            make_sql_analytics_tool(readonly_engine, portfolio_id),
            make_synthesize_reviews_tool(readonly_engine, portfolio_id, llm),
        ]
        semantic_tool = make_semantic_search_tool(readonly_engine, portfolio_id, openai_key)
        if semantic_tool:
            tools.append(semantic_tool)

        # Build prompt with system context + conversation history placeholder
        prompt = ChatPromptTemplate.from_messages([
            ("system", VOC_SYSTEM_PROMPT),
            MessagesPlaceholder("chat_history"),
            ("human", "{input}"),
            MessagesPlaceholder("agent_scratchpad"),
        ])

        agent = create_tool_calling_agent(llm, tools, prompt)
        executor = AgentExecutor(
            agent=agent,
            tools=tools,
            max_iterations=6,
            verbose=True,
            handle_parsing_errors=True,
            return_intermediate_steps=False,
        )

        # Convert stored history dicts to LangChain message objects
        history_messages = []
        if conversation_history:
            for msg in conversation_history:
                if msg.get("role") == "user":
                    history_messages.append(HumanMessage(content=msg["content"]))
                elif msg.get("role") == "ai":
                    history_messages.append(AIMessage(content=msg["content"]))

        result = executor.invoke({
            "input": user_message,
            "chat_history": history_messages,
        })

        return result.get("output", "I was unable to generate a response. Please try rephrasing your question.")

    except Exception as e:
        logger.error(f"❌ VoC Agent error: {e}", exc_info=True)
        return f"Sorry, I encountered an error while processing your request: {e}"

    finally:
        # Always remove the RLS listener so it doesn't bleed into other portfolio requests
        event.remove(readonly_engine, "checkout", set_rls)


def run_chat_agent_streaming(
    portfolio_id: int,
    user_message: str,
    event_queue: queue.Queue,
    conversation_history: Optional[List[dict]] = None,
) -> Optional[str]:
    """
    Streaming variant of run_chat_agent.
    Runs synchronously (called from a thread).
    Pushes SSE events into event_queue as the agent works.
    Returns the final output string for DB persistence.
    """
    openai_key = os.getenv("OPENAI_API_KEY")
    if not openai_key:
        event_queue.put({"type": "error", "content": "OPENAI_API_KEY is not configured."})
        event_queue.put(None)
        return None

    logger.info(f"🤖 VoC Streaming Agent started for portfolio {portfolio_id}: {user_message[:60]}...")

    callback = ChatStreamingCallback(event_queue)

    def set_rls(dbapi_connection: Any, _connection_record: Any, _connection_proxy: Any) -> None:
        cursor = dbapi_connection.cursor()
        cursor.execute(f"SET app.current_portfolio_id = '{portfolio_id}';")
        cursor.close()

    event.listen(readonly_engine, "checkout", set_rls)

    try:
        # streaming=True enables on_llm_new_token callbacks for token-by-token output
        llm = ChatOpenAI(
            model="gpt-4o",
            temperature=0,
            api_key=openai_key,
            streaming=True,
        )

        tools = [
            make_sql_analytics_tool(readonly_engine, portfolio_id),
            make_synthesize_reviews_tool(readonly_engine, portfolio_id, llm),
        ]
        semantic_tool = make_semantic_search_tool(readonly_engine, portfolio_id, openai_key)
        if semantic_tool:
            tools.append(semantic_tool)

        prompt = ChatPromptTemplate.from_messages([
            ("system", VOC_SYSTEM_PROMPT),
            MessagesPlaceholder("chat_history"),
            ("human", "{input}"),
            MessagesPlaceholder("agent_scratchpad"),
        ])

        agent = create_tool_calling_agent(llm, tools, prompt)
        executor = AgentExecutor(
            agent=agent,
            tools=tools,
            max_iterations=6,
            verbose=False,
            handle_parsing_errors=True,
            return_intermediate_steps=False,
            callbacks=[callback],
        )

        history_messages: List[Any] = []
        if conversation_history:
            for msg in conversation_history:
                if msg.get("role") == "user":
                    history_messages.append(HumanMessage(content=msg["content"]))
                elif msg.get("role") == "ai":
                    history_messages.append(AIMessage(content=msg["content"]))

        result = executor.invoke({
            "input": user_message,
            "chat_history": history_messages,
        })

        output = result.get("output", "I was unable to generate a response. Please try rephrasing your question.")

        # create_tool_calling_agent often doesn't stream the final answer token-by-token.
        # If no tokens arrived via on_llm_new_token, emit the full output as a single
        # token event so the frontend always receives the response content.
        if callback.tokens_emitted == 0 and output:
            event_queue.put({"type": "token", "content": output})

        return output

    except Exception as e:
        logger.error(f"❌ VoC Streaming Agent error: {e}", exc_info=True)
        event_queue.put({"type": "error", "content": str(e)})
        return None

    finally:
        event.remove(readonly_engine, "checkout", set_rls)
