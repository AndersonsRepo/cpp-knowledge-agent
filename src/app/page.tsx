"use client";

import Link from "next/link";
import { useState, useRef, useEffect, useCallback } from "react";
import ReactMarkdown, { Components } from "react-markdown";
import remarkGfm from "remark-gfm";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const CATEGORIES = [
  {
    title: "Campus Knowledge",
    description: "Admissions, dining, housing, campus services, and student life",
    icon: "🏛",
    questions: [
      "What are the admission requirements for freshmen?",
      "What dining options are available on campus?",
    ],
  },
  {
    title: "Faculty Directory",
    description: "Professor contact info, office hours, and office locations",
    icon: "👤",
    questions: [
      "What are Dr. El Naga's office hours?",
      "Who are the Computer Science faculty?",
    ],
  },
  {
    title: "Academic Programs",
    description: "Majors, course descriptions, prerequisites, and degree requirements",
    icon: "📚",
    questions: [
      "What courses are required for a CS degree?",
      "What are the prerequisites for CHM 1210?",
    ],
  },
  {
    title: "Financial Aid",
    description: "Scholarships, grants, eligibility, and application deadlines",
    icon: "💰",
    questions: [
      "What engineering scholarships are available?",
      "How do I apply for financial aid at CPP?",
    ],
  },
  {
    title: "Official Resources",
    description: "Direct links to official CPP pages, forms, and documents",
    icon: "🔗",
    questions: [
      "Link me to the housing application page",
      "Where can I find the graduation requirements?",
    ],
  },
];

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const getSessionId = useCallback(() => {
    const key = "broncobot-session-id";
    const existing = window.sessionStorage.getItem(key);
    if (existing) return existing;

    const nextId = window.crypto.randomUUID();
    window.sessionStorage.setItem(key, nextId);
    return nextId;
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || loading) return;

      const userMessage: Message = { role: "user", content: text.trim() };
      const newMessages = [...messages, userMessage];
      setMessages(newMessages);
      setInput("");
      setLoading(true);

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: newMessages, sessionId: getSessionId() }),
        });

        const data = await res.json();

        if (data.error) {
          setMessages([...newMessages, { role: "assistant", content: data.error }]);
        } else {
          setMessages([...newMessages, { role: "assistant", content: data.response }]);
        }
      } catch {
        setMessages([
          ...newMessages,
          {
            role: "assistant",
            content:
              "I’m having trouble with that right now. Try another campus question.",
          },
        ]);
      } finally {
        setLoading(false);
      }
    },
    [getSessionId, loading, messages]
  );

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }

  const markdownComponents: Components = {
    a: ({ href, children }) => {
      const isFullUrl = href && (href.startsWith("http://") || href.startsWith("https://"));

      if (isFullUrl) {
        return (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#1E4D2B] font-semibold underline underline-offset-2 decoration-[#C4A747] decoration-2 hover:bg-[#1E4D2B] hover:text-white hover:decoration-transparent rounded px-0.5 transition-colors"
          >
            {children} ↗
          </a>
        );
      }

      const isCppRelativeLink = href && href.startsWith("/");
      if (isCppRelativeLink) {
        const linkText = typeof children === "string" ? children : String(children);
        return (
          <button
            onClick={(e) => {
              e.preventDefault();
              const topic = linkText || href || "";
              sendMessage(`Tell me more about: ${topic}`);
            }}
            className="inline text-[#1E4D2B] font-semibold underline underline-offset-2 decoration-[#C4A747] decoration-2 hover:bg-[#1E4D2B] hover:text-white hover:decoration-transparent rounded px-0.5 transition-colors cursor-pointer"
            title={`Ask about: ${href}`}
          >
            {children}
          </button>
        );
      }

      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[#1E4D2B] font-semibold underline underline-offset-2 decoration-[#C4A747] decoration-2 hover:bg-[#1E4D2B] hover:text-white hover:decoration-transparent rounded px-0.5 transition-colors"
        >
          {children}
        </a>
      );
    },
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-[#1E4D2B] text-white px-6 py-4 shadow-md">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#C4A747] rounded-full flex items-center justify-center text-xl font-bold">
              B
            </div>
            <div>
              <h1 className="text-xl font-bold">BroncoBot</h1>
              <p className="text-sm text-green-200">Your Cal Poly Pomona Campus Assistant</p>
            </div>
          </div>
          <Link
            href="/analytics"
            className="rounded-xl border border-green-200 px-3 py-2 text-sm font-medium text-green-50 transition-colors hover:bg-white hover:text-[#1E4D2B]"
          >
            View Analytics
          </Link>
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-4xl mx-auto space-y-4">
          {messages.length === 0 && (
            <div className="text-center py-8">
              <div className="w-20 h-20 bg-[#1E4D2B] rounded-full flex items-center justify-center text-3xl font-bold text-[#C4A747] mx-auto mb-4">
                B
              </div>
              <h2 className="text-2xl font-bold text-gray-800 mb-2">
                Welcome to BroncoBot
              </h2>
              <p className="text-gray-500 mb-8 max-w-lg mx-auto">
                I can help you find information about Cal Poly Pomona. Choose a category or type your question below.
              </p>

              {/* Category cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-w-3xl mx-auto mb-6">
                {CATEGORIES.map((cat) => (
                  <div
                    key={cat.title}
                    className="bg-white border border-gray-200 rounded-xl p-4 text-left shadow-sm hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-lg">{cat.icon}</span>
                      <h3 className="font-semibold text-gray-800 text-sm">{cat.title}</h3>
                    </div>
                    <p className="text-xs text-gray-500 mb-3">{cat.description}</p>
                    <div className="flex flex-col gap-1.5">
                      {cat.questions.map((q) => (
                        <button
                          key={q}
                          onClick={() => sendMessage(q)}
                          className="text-xs text-left px-3 py-1.5 bg-gray-50 border border-gray-100 rounded-lg text-gray-600 hover:bg-[#1E4D2B] hover:text-white hover:border-[#1E4D2B] transition-colors"
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                  msg.role === "user"
                    ? "bg-[#1E4D2B] text-white"
                    : "bg-white border border-gray-200 text-gray-800 shadow-sm"
                }`}
              >
                {msg.role === "assistant" ? (
                  <div className="prose prose-sm max-w-none prose-table:border-collapse prose-th:border prose-th:border-gray-300 prose-th:bg-gray-50 prose-th:px-3 prose-th:py-1 prose-td:border prose-td:border-gray-300 prose-td:px-3 prose-td:py-1">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={markdownComponents}
                    >
                      {msg.content}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                )}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="bg-white border border-gray-200 rounded-2xl px-4 py-3 shadow-sm">
                <div className="flex gap-1">
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                  <span
                    className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                    style={{ animationDelay: "0.1s" }}
                  />
                  <span
                    className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                    style={{ animationDelay: "0.2s" }}
                  />
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input */}
      <div className="border-t bg-white px-4 py-4">
        <div className="max-w-4xl mx-auto flex gap-3">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about Cal Poly Pomona..."
            rows={1}
            className="flex-1 resize-none rounded-xl border border-gray-300 px-4 py-3 text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#1E4D2B] focus:border-transparent placeholder:text-gray-400"
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={loading || !input.trim()}
            className="px-6 py-3 bg-[#1E4D2B] text-white rounded-xl font-medium hover:bg-[#163D22] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Send
          </button>
        </div>
        <p className="text-center text-xs text-gray-400 mt-2">
          Powered by AI with tool-calling. Answers are sourced from official Cal Poly Pomona website content.
        </p>
      </div>
    </div>
  );
}
