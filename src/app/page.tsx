"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import ReactMarkdown, { Components } from "react-markdown";
import remarkGfm from "remark-gfm";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const STARTER_QUESTIONS = [
  "What are the admission requirements for freshmen?",
  "How do I apply for financial aid at CPP?",
  "What dining options are available on campus?",
  "How do I change my major at Cal Poly Pomona?",
  "Where is the student health center located?",
];

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

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
          body: JSON.stringify({ messages: newMessages }),
        });

        const data = await res.json();

        if (data.error) {
          setMessages([...newMessages, { role: "assistant", content: `Error: ${data.error}` }]);
        } else {
          setMessages([...newMessages, { role: "assistant", content: data.response }]);
        }
      } catch {
        setMessages([
          ...newMessages,
          { role: "assistant", content: "Sorry, something went wrong. Please try again." },
        ]);
      } finally {
        setLoading(false);
      }
    },
    [messages, loading]
  );

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }

  // Custom link renderer — CPP links stay in-app, external links open in new tab
  const markdownComponents: Components = {
    a: ({ href, children }) => {
      const isCppLink =
        href &&
        (href.includes("cpp.edu") ||
          href.startsWith("/") ||
          href.startsWith("http://www.cpp.edu") ||
          href.startsWith("https://www.cpp.edu"));

      if (isCppLink) {
        return (
          <button
            onClick={(e) => {
              e.preventDefault();
              // Extract a readable topic from the URL or link text
              const linkText = typeof children === "string" ? children : String(children);
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

      // External links open in new tab
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
    },
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-[#1E4D2B] text-white px-6 py-4 shadow-md">
        <div className="max-w-4xl mx-auto flex items-center gap-3">
          <div className="w-10 h-10 bg-[#C4A747] rounded-full flex items-center justify-center text-xl font-bold">
            B
          </div>
          <div>
            <h1 className="text-xl font-bold">CPP Campus Knowledge Agent</h1>
            <p className="text-sm text-green-200">Ask anything about Cal Poly Pomona</p>
          </div>
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-4xl mx-auto space-y-4">
          {messages.length === 0 && (
            <div className="text-center py-12">
              <div className="w-20 h-20 bg-[#1E4D2B] rounded-full flex items-center justify-center text-3xl font-bold text-[#C4A747] mx-auto mb-4">
                B
              </div>
              <h2 className="text-2xl font-bold text-gray-800 mb-2">
                Welcome to CPP Campus Knowledge Agent
              </h2>
              <p className="text-gray-500 mb-8 max-w-md mx-auto">
                I can help you find information about admissions, financial aid, academics, campus
                services, and more at Cal Poly Pomona.
              </p>
              <div className="flex flex-wrap gap-2 justify-center max-w-2xl mx-auto">
                {STARTER_QUESTIONS.map((q) => (
                  <button
                    key={q}
                    onClick={() => sendMessage(q)}
                    className="px-4 py-2 bg-white border border-gray-200 rounded-full text-sm text-gray-700 hover:bg-[#1E4D2B] hover:text-white hover:border-[#1E4D2B] transition-colors shadow-sm"
                  >
                    {q}
                  </button>
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
          Powered by AI. Answers are based on official Cal Poly Pomona website content.
        </p>
      </div>
    </div>
  );
}
