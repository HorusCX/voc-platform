"use client";

import { useState, useRef, useEffect } from "react";
import { usePortfolio } from "@/contexts/PortfolioContext";
import { VoCService } from "@/lib/api";
import { AppLayout } from "@/components/layout/AppLayout";
import {
    Send, Bot, User as UserIcon, Loader2, Sparkles, Database, MessageSquare, Plus, Trash2
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type Message = {
    id: string;
    role: "user" | "ai";
    content: string;
    timestamp: Date;
};

type Conversation = {
    id: number;
    title: string;
    updated_at: string;
    created_at: string;
};

export default function ChatPage() {
    const { currentPortfolio } = usePortfolio();
    const selectedPortfolioId = currentPortfolio?.id;

    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [selectedConversationId, setSelectedConversationId] = useState<number | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);

    const [inputValue, setInputValue] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [isFetchingHistory, setIsFetchingHistory] = useState(false);

    // Auto-scroll to bottom of messages
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    // Fetch conversations when portfolio changes
    useEffect(() => {
        if (!selectedPortfolioId) {
            setConversations([]);
            setSelectedConversationId(null);
            setMessages([]);
            return;
        }

        const fetchConversations = async () => {
            try {
                const data = await VoCService.getConversations(selectedPortfolioId);
                setConversations(data);

                // If there are conversations, select the first one
                if (data.length > 0) {
                    setSelectedConversationId(data[0].id);
                } else {
                    setSelectedConversationId(null);
                    setMessages([{
                        id: "welcome",
                        role: "ai",
                        content: "Hello! I am your VoC Intelligence AI assistant. I have access to analyze all the companies, dimensions, and reviews in this portfolio. What would you like to know?",
                        timestamp: new Date()
                    }]);
                }
            } catch (error) {
                console.error("Error fetching conversations:", error);
            }
        };

        fetchConversations();
    }, [selectedPortfolioId]);

    // Fetch messages when selected conversation changes
    useEffect(() => {
        if (!selectedConversationId) {
            if (selectedPortfolioId && conversations.length === 0) {
                setMessages([{
                    id: "welcome",
                    role: "ai",
                    content: "Hello! I am your VoC Intelligence AI assistant. I have access to analyze all the companies, dimensions, and reviews in this portfolio. What would you like to know?",
                    timestamp: new Date()
                }]);
            }
            return;
        }

        const fetchMessages = async () => {
            setIsFetchingHistory(true);
            try {
                const data = await VoCService.getConversationMessages(selectedConversationId);
                const loadedMessages = data.map(msg => ({
                    id: msg.id.toString(),
                    role: msg.role,
                    content: msg.content,
                    timestamp: new Date(msg.created_at)
                }));
                // Ensure messages are sorted by date (the backend already does this, but just in case)
                loadedMessages.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
                setMessages(loadedMessages);
            } catch (error) {
                console.error("Error fetching messages:", error);
                setMessages([]);
            } finally {
                setIsFetchingHistory(false);
            }
        };

        fetchMessages();
    }, [selectedConversationId, selectedPortfolioId, conversations.length]);


    const handleNewChat = () => {
        setSelectedConversationId(null);
        setMessages([{
            id: "welcome",
            role: "ai",
            content: "Hello! I am your VoC Intelligence AI assistant. I have access to analyze all the companies, dimensions, and reviews in this portfolio. What would you like to know?",
            timestamp: new Date()
        }]);
    };

    const handleDeleteConversation = async (conversationId: number, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!confirm("Are you sure you want to delete this conversation?")) return;

        try {
            await VoCService.deleteConversation(conversationId);
            const updatedConversations = conversations.filter(c => c.id !== conversationId);
            setConversations(updatedConversations);

            if (selectedConversationId === conversationId) {
                if (updatedConversations.length > 0) {
                    setSelectedConversationId(updatedConversations[0].id);
                } else {
                    handleNewChat();
                }
            }
        } catch (error) {
            console.error("Error deleting conversation:", error);
            alert("Failed to delete conversation");
        }
    };


    const handleSendMessage = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();

        const messageText = inputValue.trim();
        if (!messageText || isLoading || !selectedPortfolioId) return;

        // Add user message to UI immediately
        const userMsg: Message = {
            id: Date.now().toString(),
            role: "user",
            content: messageText,
            timestamp: new Date()
        };

        // If it's a new chat, temporarily hide the welcome message
        if (!selectedConversationId && messages.length === 1 && messages[0].id === 'welcome') {
            setMessages([userMsg]);
        } else {
            setMessages(prev => [...prev, userMsg]);
        }

        setInputValue("");
        setIsLoading(true);

        try {
            // Send the optional conversation_id
            const data = await VoCService.sendChatMessage(selectedPortfolioId, messageText, selectedConversationId || undefined);

            // Add AI response to UI
            const aiMsg: Message = {
                id: (Date.now() + 1).toString(),
                role: "ai",
                content: data.response,
                timestamp: new Date()
            };

            setMessages(prev => [...prev, aiMsg]);

            // If it was a new conversation, update the ID and refresh the list to show the new title
            if (!selectedConversationId && data.conversation_id) {
                setSelectedConversationId(data.conversation_id);
                // Refresh list to get the auto-generated title
                const updatedConversations = await VoCService.getConversations(selectedPortfolioId);
                setConversations(updatedConversations);
            }

        } catch (error: unknown) {
            console.error("Chat Error:", error);
            const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
            // Add error message to UI
            const errorMsg: Message = {
                id: (Date.now() + 1).toString(),
                role: "ai",
                content: `Sorry, I encountered an error: ${errorMessage}`,
                timestamp: new Date()
            };
            setMessages(prev => [...prev, errorMsg]);
        } finally {
            setIsLoading(false);
        }
    };

    // Format time
    const formatTime = (date: Date) => {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    };

    return (
        <AppLayout>
            <div className="w-full max-w-[calc(100%-2rem)] ml-4 h-[calc(100vh-8rem)] flex bg-card rounded-xl border border-border overflow-hidden shadow-sm mt-4">

                {/* Sidebar History */}
                <div className="w-64 border-r border-border bg-muted/20 flex flex-col hidden md:flex">
                    <div className="p-4 border-b border-border">
                        <button
                            onClick={handleNewChat}
                            className="w-full flex items-center justify-center gap-2 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 rounded-lg p-2 transition-colors text-sm font-medium"
                        >
                            <Plus className="h-4 w-4" />
                            New Chat
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-2 space-y-1 scrollbar-thin">
                        {conversations.length === 0 ? (
                            <div className="text-center text-muted-foreground text-xs py-4 px-2">
                                No recent conversations
                            </div>
                        ) : (
                            conversations.map(conv => (
                                <div
                                    key={conv.id}
                                    onClick={() => setSelectedConversationId(conv.id)}
                                    className={`
                                        group relative flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors text-sm
                                        ${selectedConversationId === conv.id ? "bg-muted font-medium text-foreground" : "hover:bg-muted/50 text-muted-foreground"}
                                    `}
                                >
                                    <div className="flex items-center gap-2 overflow-hidden w-full">
                                        <MessageSquare className="h-4 w-4 shrink-0 opacity-50" />
                                        <div className="flex flex-col truncate w-full pr-6">
                                            <span className="truncate w-full block">{conv.title}</span>
                                            <span className="text-[10px] opacity-70 mt-0.5">{formatDate(conv.updated_at)}</span>
                                        </div>
                                    </div>
                                    <button
                                        onClick={(e) => handleDeleteConversation(conv.id, e)}
                                        className="absolute right-2 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                                        title="Delete Conversation"
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* Main Chat Area */}
                <div className="flex-1 flex flex-col min-w-0">
                    {/* Header */}
                    <div className="px-6 py-4 border-b border-border bg-muted/30 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="bg-primary/10 p-2 rounded-lg">
                                <Sparkles className="h-5 w-5 text-primary" />
                            </div>
                            <div>
                                <h2 className="font-semibold flex items-center gap-2">
                                    Data Intelligence Chat
                                    <span className="text-xs bg-emerald-500/10 text-emerald-500 px-2 py-0.5 rounded-full border border-emerald-500/20 font-medium tracking-wide">
                                        BETA
                                    </span>
                                </h2>
                                <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
                                    <Database className="h-3 w-3" />
                                    Analyzing Portfolio ID: {selectedPortfolioId || "None"}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Messages Area */}
                    <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 bg-muted/10 relative">
                        {isFetchingHistory ? (
                            <div className="absolute inset-0 flex items-center justify-center bg-background/50 backdrop-blur-sm z-10 transition-all duration-300">
                                <Loader2 className="h-8 w-8 text-primary animate-spin" />
                            </div>
                        ) : messages.map((message) => (
                            <div
                                key={message.id}
                                className={`flex ${message.role === "user" ? "justify-end" : "justify-start"} group cursor-default`}
                            >
                                <div className={`flex gap-3 max-w-[85%] ${message.role === "user" ? "flex-row-reverse" : "flex-row"}`}>

                                    {/* Avatar */}
                                    <div className={`flex-shrink-0 h-8 w-8 rounded-full flex items-center justify-center mt-1 
                                        ${message.role === "user"
                                            ? "bg-primary text-primary-foreground"
                                            : "bg-blue-600/10 border border-blue-600/20 text-blue-600"
                                        }`}
                                    >
                                        {message.role === "user" ? <UserIcon className="h-4 w-4" /> : <Bot className="h-5 w-5" />}
                                    </div>

                                    {/* Bubble */}
                                    <div className="flex flex-col gap-1 w-full min-w-0">
                                        <div className={`
                                            px-4 py-3 rounded-2xl text-[15px] leading-relaxed shadow-sm w-full
                                            ${message.role === "user"
                                                ? "bg-primary text-primary-foreground rounded-tr-sm"
                                                : "bg-card border border-border text-card-foreground rounded-tl-sm prose prose-sm dark:prose-invert max-w-none break-words"
                                            }
                                        `}>
                                            {message.role === "user" ? (
                                                <div className="whitespace-pre-wrap">{message.content}</div>
                                            ) : (
                                                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                                    {message.content}
                                                </ReactMarkdown>
                                            )}
                                        </div>
                                        <span className={`text-[10px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity ${message.role === "user" ? "text-right mr-1" : "text-left ml-1"}`}>
                                            {formatTime(message.timestamp)}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        ))}

                        {/* Loading Indicator */}
                        {isLoading && (
                            <div className="flex justify-start">
                                <div className="flex gap-3 max-w-[85%]">
                                    <div className="flex-shrink-0 h-8 w-8 rounded-full bg-blue-600/10 border border-blue-600/20 text-blue-600 flex items-center justify-center mt-1">
                                        <Bot className="h-5 w-5" />
                                    </div>
                                    <div className="bg-card border border-border rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm flex items-center h-[46px]">
                                        <div className="flex space-x-1.5">
                                            <div className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                                            <div className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                                            <div className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Input Area */}
                    <div className="p-4 bg-card border-t border-border shrink-0">
                        <form
                            onSubmit={handleSendMessage}
                            className="relative flex items-end gap-2 bg-muted/30 border border-border rounded-xl p-2 focus-within:ring-1 focus-within:ring-primary focus-within:border-primary transition-all"
                        >
                            <textarea
                                value={inputValue}
                                onChange={(e) => setInputValue(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        handleSendMessage();
                                    }
                                }}
                                placeholder={selectedPortfolioId ? "Ask about your reviews, sentiments, or dimensions..." : "Select a portfolio to start chatting"}
                                className="w-full max-h-32 min-h-[44px] bg-transparent resize-none outline-none text-sm py-3 px-3 scrollbar-thin overflow-y-auto disabled:opacity-50"
                                rows={1}
                                disabled={isLoading || !selectedPortfolioId || isFetchingHistory}
                            />
                            <div className="pb-1 pr-1">
                                <button
                                    type="submit"
                                    disabled={!inputValue.trim() || isLoading || !selectedPortfolioId || isFetchingHistory}
                                    className="h-10 w-10 bg-primary text-primary-foreground rounded-lg flex items-center justify-center hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                >
                                    {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-4 w-4 ml-0.5" />}
                                </button>
                            </div>
                        </form>
                        <div className="text-center mt-2">
                            <p className="text-[10px] text-muted-foreground">
                                AI Agent has strict read-only access to Portfolio {selectedPortfolioId || "..."} data.
                            </p>
                        </div>
                    </div>
                </div>

            </div>
        </AppLayout>
    );
}
