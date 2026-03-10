"""
VoC Chat Agent Tools
Provides specialized tools for the multi-tool ReAct agent:
  - sql_analytics: structured queries for counts, trends, aggregations
  - synthesize_reviews: qualitative analysis of raw review text content
  - semantic_search: vector similarity search for conceptual queries
"""

import json
import logging
from sqlalchemy import text
from langchain_core.tools import StructuredTool

logger = logging.getLogger(__name__)


def make_sql_analytics_tool(readonly_engine, portfolio_id: int):
    """Creates a SQL analytics tool bound to a specific portfolio and RLS context."""

    def sql_analytics(query: str) -> str:
        """Execute a read-only PostgreSQL SELECT query against portfolio data."""
        clean_query = query.replace("```sql", "").replace("```", "").strip()

        # Guard against write operations
        forbidden_keywords = ["INSERT", "UPDATE", "DELETE", "DROP", "CREATE", "ALTER", "TRUNCATE", "GRANT", "REVOKE"]
        upper_query = clean_query.upper()
        for kw in forbidden_keywords:
            if kw in upper_query:
                return f"Error: {kw} operations are not permitted. Only SELECT queries are allowed."

        try:
            with readonly_engine.connect() as conn:
                conn.execute(text(f"SET LOCAL app.current_portfolio_id = '{portfolio_id}';"))
                result = conn.execute(text(clean_query))
                rows = result.fetchall()

                if not rows:
                    return "Query returned no results."

                columns = list(result.keys())
                output_lines = [f"Results ({len(rows)} rows):"]
                for row in rows[:200]:
                    output_lines.append(str(dict(zip(columns, row))))
                return "\n".join(output_lines)

        except Exception as e:
            logger.error(f"sql_analytics error: {e}")
            return f"SQL error: {e}"

    return StructuredTool.from_function(
        func=sql_analytics,
        name="sql_analytics",
        description="""Execute a PostgreSQL SELECT query to retrieve statistics, counts, trends, and aggregations from the portfolio's review data.

Use this for: review counts by company/platform/rating, sentiment distribution percentages, date-based trends, top-rated companies, dimension breakdown by sentiment.

Tables available:
- reviews: id, brand, text, rating, date, platform, sentiment, emotion, confidence, topics (JSON), source_user, analyzed_at
- companies: id, company_name, website, is_main, portfolio_id
- dimensions: id, name, description, keywords (JSON), portfolio_id

Key rules:
- Do NOT add WHERE portfolio_id = X — Row Level Security restricts data automatically
- reviews.company_id is often NULL; join to companies via: reviews.brand ILIKE companies.company_name
- Group by reviews.brand directly, not company_id
- To filter topics JSON: use topics::jsonb @> '[{"dimension": "Performance", "mentioned": true}]'
- For full-text search in review text: use text ILIKE '%keyword%'""",
    )


def make_synthesize_reviews_tool(readonly_engine, portfolio_id: int, llm):
    """Creates a text synthesis tool that reads review content and extracts qualitative insights."""

    def synthesize_reviews(input_json: str) -> str:
        """Fetch a sample of reviews matching filter criteria, then synthesize qualitative insights from the actual text."""
        try:
            params = json.loads(input_json)
        except (json.JSONDecodeError, ValueError):
            params = {
                "analysis_question": input_json,
                "filter_conditions": "1=1",
                "sample_size": 100,
            }

        filter_conditions = params.get("filter_conditions", "1=1") or "1=1"
        analysis_question = params.get("analysis_question", "Summarize the key themes in these reviews")
        sample_size = min(int(params.get("sample_size", 150)), 200)

        # Fetch review sample with stratified ordering (by brand + random within)
        sql = f"""
            SELECT text, rating, brand, platform, sentiment, emotion
            FROM reviews
            WHERE ({filter_conditions})
              AND text IS NOT NULL
              AND TRIM(text) != ''
            ORDER BY RANDOM()
            LIMIT {sample_size}
        """

        try:
            with readonly_engine.connect() as conn:
                conn.execute(text(f"SET LOCAL app.current_portfolio_id = '{portfolio_id}';"))
                result = conn.execute(text(sql))
                rows = result.fetchall()
        except Exception as e:
            logger.error(f"synthesize_reviews SQL error: {e}")
            return f"Error fetching reviews for analysis: {e}"

        if not rows:
            return "No reviews found matching the specified filter criteria."

        # Format reviews for LLM analysis
        review_lines = []
        for row in rows:
            d = dict(zip(["text", "rating", "brand", "platform", "sentiment", "emotion"], row))
            line = f"[{d['brand']} | {d['platform']} | Rating:{d['rating']} | {d['sentiment']}] {d['text']}"
            review_lines.append(line)

        reviews_block = "\n---\n".join(review_lines)

        synthesis_prompt = f"""You are a senior VoC (Voice of Customer) analyst with expertise in customer feedback analysis.

Analyze the following {len(rows)} customer reviews and answer this specific question:
{analysis_question}

For each theme or insight you identify, provide:
- A clear, descriptive theme name
- Estimated percentage of reviews that mention it
- 1-2 verbatim example quotes (use exact words from the reviews)
- Sentiment direction (mostly positive / mostly negative / mixed)

Be specific and evidence-based. If sample size is small (< 20 reviews), note that findings may not be representative.

CUSTOMER REVIEWS:
{reviews_block}"""

        try:
            response = llm.invoke(synthesis_prompt)
            return f"Qualitative analysis of {len(rows)} reviews:\n\n{response.content}"
        except Exception as e:
            logger.error(f"synthesize_reviews LLM error: {e}")
            return f"Error synthesizing insights from reviews: {e}"

    return StructuredTool.from_function(
        func=synthesize_reviews,
        name="synthesize_reviews",
        description="""Fetch a sample of customer reviews matching SQL filter conditions, then use AI to analyze the actual text content and extract qualitative insights.

Use this for: top complaints, most requested features, common pain points, praise themes, what customers say about a specific topic, sentiment drivers, emerging issues.

Input MUST be a valid JSON string with these fields:
- "filter_conditions": SQL WHERE clause fragment without the WHERE keyword (e.g., "sentiment = 'Negative' AND date >= CURRENT_DATE - INTERVAL '30 days'")
- "analysis_question": specific question to answer from the review texts (e.g., "What are the top 5 complaint themes and what percentage of reviews mention each?")
- "sample_size": number of reviews to analyze, between 50 and 200 (default: 150)

Examples:
- Top complaints last month: {"filter_conditions": "sentiment = 'Negative' AND date >= CURRENT_DATE - INTERVAL '30 days'", "analysis_question": "What are the top complaints customers have?", "sample_size": 150}
- Feature requests: {"filter_conditions": "1=1", "analysis_question": "What features or improvements are customers requesting?", "sample_size": 150}
- Specific company issues: {"filter_conditions": "brand ILIKE 'CompanyName' AND sentiment = 'Negative'", "analysis_question": "What specific problems do customers have with this company?", "sample_size": 100}

Do NOT add portfolio_id to filter_conditions — it is applied automatically by Row Level Security.""",
    )


def make_semantic_search_tool(readonly_engine, portfolio_id: int, api_key: str):
    """Creates a semantic similarity search tool using pgvector embeddings.
    Returns None if pgvector is not available."""
    try:
        from openai import OpenAI
        client = OpenAI(api_key=api_key)

        def semantic_search(
            query: str,
            brand_filter: str = "",
            platform_filter: str = "",
            date_from: str = "",
            date_to: str = "",
        ) -> str:
            """Find reviews semantically similar to a concept or topic using vector embeddings."""
            try:
                # Generate embedding for the query
                embedding_response = client.embeddings.create(
                    model="text-embedding-3-small",
                    input=query,
                )
                query_embedding = embedding_response.data[0].embedding

                # Format as pgvector literal
                vector_literal = "[" + ",".join(str(x) for x in query_embedding) + "]"

                extra_clauses = []
                active_filters = []

                if brand_filter and brand_filter.strip():
                    safe_brand = brand_filter.strip().replace("'", "''")
                    extra_clauses.append(f"AND brand ILIKE '%{safe_brand}%'")
                    active_filters.append(f"brand='{brand_filter}'")

                if platform_filter and platform_filter.strip():
                    safe_platform = platform_filter.strip().replace("'", "''")
                    extra_clauses.append(f"AND platform ILIKE '%{safe_platform}%'")
                    active_filters.append(f"platform='{platform_filter}'")

                if date_from and date_from.strip():
                    extra_clauses.append(f"AND date >= '{date_from.strip()}'::date")
                    active_filters.append(f"from={date_from}")

                if date_to and date_to.strip():
                    extra_clauses.append(f"AND date <= '{date_to.strip()}'::date")
                    active_filters.append(f"to={date_to}")

                filter_sql = "\n                      ".join(extra_clauses)

                sql = f"""
                    SELECT text, brand, platform, rating, sentiment, emotion,
                           1 - (embedding <=> '{vector_literal}'::vector) AS similarity
                    FROM reviews
                    WHERE embedding IS NOT NULL
                      AND text IS NOT NULL
                      AND TRIM(text) != ''
                      {filter_sql}
                    ORDER BY embedding <=> '{vector_literal}'::vector
                    LIMIT 20
                """

                with readonly_engine.connect() as conn:
                    conn.execute(text(f"SET LOCAL app.current_portfolio_id = '{portfolio_id}';"))
                    result = conn.execute(text(sql))
                    rows = result.fetchall()

                if not rows:
                    filter_note = f" ({', '.join(active_filters)})" if active_filters else ""
                    return f"No semantically similar reviews found{filter_note}. Reviews may not have been embedded yet or no reviews match the filters."

                label = f"Top {len(rows)} reviews most similar to: '{query}'"
                if active_filters:
                    label += f" (filters: {', '.join(active_filters)})"
                output_lines = [label + "\n"]
                for row in rows:
                    d = dict(zip(["text", "brand", "platform", "rating", "sentiment", "emotion", "similarity"], row))
                    similarity_pct = round(float(d["similarity"]) * 100, 1)
                    output_lines.append(
                        f"[{d['brand']} | {d['platform']} | Rating:{d['rating']} | {d['sentiment']} | Similarity:{similarity_pct}%]\n{d['text']}\n"
                    )
                return "\n---\n".join(output_lines)

            except Exception as e:
                logger.error(f"semantic_search error: {e}")
                return f"Semantic search error: {e}"

        return StructuredTool.from_function(
            func=semantic_search,
            name="semantic_search",
            description="""Find customer reviews semantically similar to a concept, topic, or phrase using AI vector embeddings.

Use this for: finding reviews about a specific topic even without exact keyword matches, discovering reviews that discuss a concept indirectly, finding examples of a particular type of feedback.

Parameters:
- query (required): natural language description of what you're looking for
- brand_filter (optional): company/brand name to restrict results to (e.g. "Invygo", "eZhire"). Always set this when the user asks about a specific company.
- platform_filter (optional): restrict to a specific platform. Values: "App Store", "Google Play", "Google Maps", "Trustpilot". Use when the user mentions a platform.
- date_from (optional): start date in YYYY-MM-DD format (e.g. "2024-01-01"). Use when the user mentions a time period.
- date_to (optional): end date in YYYY-MM-DD format (e.g. "2024-12-31"). Use when the user mentions a time period.

Examples:
- query="app crashes on startup", brand_filter="Invygo"
- query="payment processing difficulties", brand_filter="eZhire", platform_filter="Google Play"
- query="delivery delays", brand_filter="Invygo", date_from="2024-01-01", date_to="2024-06-30"
- query="customer support response time" (no filters = all companies, all platforms, all time)

Returns the 20 most similar reviews with a similarity score. Use synthesize_reviews on top of these results for deeper analysis.""",
        )

    except Exception as e:
        logger.warning(f"semantic_search tool unavailable: {e}")
        return None
