"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import ReactMarkdown, { Components } from "react-markdown";
import remarkGfm from "remark-gfm";

// --- Types ---

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
}

// --- Storage helpers ---

const STORAGE_KEY = "broncobot-conversations";
const ACTIVE_KEY = "broncobot-active-tab";

function loadConversations(): Conversation[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveConversations(convos: Conversation[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(convos));
}

function loadActiveTab(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ACTIVE_KEY);
}

function saveActiveTab(id: string) {
  localStorage.setItem(ACTIVE_KEY, id);
}

function createId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function getTitle(messages: Message[]): string {
  const first = messages.find((m) => m.role === "user");
  if (!first) return "New Chat";
  const text = first.content.trim();
  return text.length > 40 ? text.slice(0, 40) + "..." : text;
}

// --- Categories ---

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
    description: "Majors, degree programs, and course listings across all colleges",
    icon: "📚",
    questions: [
      "What courses are required for a CS degree?",
      "What majors does the College of Engineering offer?",
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

// --- Component ---

export default function ChatPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const initialized = useRef(false);

  // Load from localStorage on mount
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const saved = loadConversations();
    const savedActive = loadActiveTab();

    if (saved.length === 0) {
      const first: Conversation = {
        id: createId(),
        title: "New Chat",
        messages: [],
        createdAt: Date.now(),
      };
      setConversations([first]);
      setActiveId(first.id);
      saveConversations([first]);
      saveActiveTab(first.id);
    } else {
      setConversations(saved);
      const active = savedActive && saved.find((c) => c.id === savedActive)
        ? savedActive
        : saved[0].id;
      setActiveId(active);
    }
  }, []);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversations, activeId]);

  const activeConvo = conversations.find((c) => c.id === activeId);
  const messages = activeConvo?.messages || [];

  // Update a conversation's messages and persist
  const updateMessages = useCallback(
    (convoId: string, newMessages: Message[]) => {
      setConversations((prev) => {
        const updated = prev.map((c) =>
          c.id === convoId
            ? { ...c, messages: newMessages, title: getTitle(newMessages) }
            : c
        );
        saveConversations(updated);
        return updated;
      });
    },
    []
  );

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || loading || !activeId) return;

      const userMessage: Message = { role: "user", content: text.trim() };
      const newMessages = [...messages, userMessage];
      updateMessages(activeId, newMessages);
      setInput("");
      setLoading(true);

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: newMessages }),
        });

        const data = await res.json();
        const assistantContent = data.error
          ? `Error: ${data.error}`
          : data.response;

        updateMessages(activeId, [
          ...newMessages,
          { role: "assistant", content: assistantContent },
        ]);
      } catch {
        updateMessages(activeId, [
          ...newMessages,
          { role: "assistant", content: "Sorry, something went wrong. Please try again." },
        ]);
      } finally {
        setLoading(false);
      }
    },
    [messages, loading, activeId, updateMessages]
  );

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }

  function newChat() {
    const convo: Conversation = {
      id: createId(),
      title: "New Chat",
      messages: [],
      createdAt: Date.now(),
    };
    const updated = [convo, ...conversations];
    setConversations(updated);
    setActiveId(convo.id);
    saveConversations(updated);
    saveActiveTab(convo.id);
    setSidebarOpen(false);
  }

  function switchTab(id: string) {
    setActiveId(id);
    saveActiveTab(id);
    setSidebarOpen(false);
  }

  function deleteChat(id: string) {
    const remaining = conversations.filter((c) => c.id !== id);
    if (remaining.length === 0) {
      newChat();
      return;
    }
    setConversations(remaining);
    saveConversations(remaining);
    if (activeId === id) {
      setActiveId(remaining[0].id);
      saveActiveTab(remaining[0].id);
    }
  }

  function startRename(id: string, currentTitle: string) {
    setEditingId(id);
    setEditingTitle(currentTitle);
    setTimeout(() => renameInputRef.current?.focus(), 0);
  }

  function commitRename() {
    if (!editingId) return;
    const trimmed = editingTitle.trim();
    if (trimmed) {
      setConversations((prev) => {
        const updated = prev.map((c) =>
          c.id === editingId ? { ...c, title: trimmed } : c
        );
        saveConversations(updated);
        return updated;
      });
    }
    setEditingId(null);
    setEditingTitle("");
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
              sendMessage(`Tell me more about: ${linkText || href}`);
            }}
            className="inline text-[#1E4D2B] font-semibold underline underline-offset-2 decoration-[#C4A747] decoration-2 hover:bg-[#1E4D2B] hover:text-white hover:decoration-transparent rounded px-0.5 transition-colors cursor-pointer"
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
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside
        className={`${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        } fixed inset-y-0 left-0 z-30 w-72 bg-[#163D22] text-white flex flex-col transition-transform duration-200 lg:translate-x-0 lg:static lg:z-auto`}
      >
        {/* Sidebar header */}
        <div className="p-4 border-b border-[#1E4D2B] flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <div className="w-8 h-8 bg-[#C4A747] rounded-full flex items-center justify-center text-sm font-bold text-[#1E4D2B]">
              B
            </div>
            <span className="font-bold">BroncoBot</span>
          </Link>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden text-green-300 hover:text-white"
          >
            ✕
          </button>
        </div>

        {/* New chat button */}
        <div className="p-3">
          <button
            onClick={newChat}
            className="w-full px-4 py-2 border border-green-600 rounded-lg text-sm font-medium hover:bg-[#1E4D2B] transition-colors flex items-center gap-2"
          >
            <span>+</span> New Chat
          </button>
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto px-3 pb-3">
          {conversations.map((c) => (
            <div
              key={c.id}
              className={`group flex items-center gap-1 px-3 py-2 rounded-lg mb-1 cursor-pointer text-sm transition-colors ${
                c.id === activeId
                  ? "bg-[#1E4D2B] text-white"
                  : "text-green-300 hover:bg-[#1E4D2B]/50 hover:text-white"
              }`}
              onClick={() => editingId !== c.id && switchTab(c.id)}
              onDoubleClick={() => startRename(c.id, c.title)}
            >
              {editingId === c.id ? (
                <input
                  ref={renameInputRef}
                  value={editingTitle}
                  onChange={(e) => setEditingTitle(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitRename();
                    if (e.key === "Escape") { setEditingId(null); setEditingTitle(""); }
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="flex-1 bg-[#0d2a16] text-white text-sm px-1 py-0.5 rounded outline-none border border-green-600 min-w-0"
                />
              ) : (
                <span className="flex-1 truncate">{c.title}</span>
              )}
              {editingId !== c.id && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    startRename(c.id, c.title);
                  }}
                  className="opacity-0 group-hover:opacity-100 text-green-400 hover:text-white transition-all text-xs"
                  title="Rename chat"
                >
                  ✎
                </button>
              )}
              {editingId !== c.id && conversations.length > 1 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteChat(c.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 text-green-400 hover:text-red-400 transition-all text-xs"
                  title="Delete chat"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Back to home */}
        <div className="p-3 border-t border-[#1E4D2B]">
          <Link
            href="/"
            className="block text-center text-sm text-green-300 hover:text-white transition-colors"
          >
            ← Back to Home
          </Link>
        </div>
      </aside>

      {/* Sidebar overlay on mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="bg-[#1E4D2B] text-white px-4 py-3 shadow-md flex items-center gap-3 lg:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-xl"
          >
            ☰
          </button>
          <div className="flex-1 truncate">
            <span className="font-semibold text-sm">{activeConvo?.title || "New Chat"}</span>
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
                  I can help you find information about Cal Poly Pomona. Choose a
                  category or type your question below.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-w-3xl mx-auto mb-6">
                  {CATEGORIES.map((cat) => (
                    <div
                      key={cat.title}
                      className="bg-white border border-gray-200 rounded-xl p-4 text-left shadow-sm hover:shadow-md transition-shadow"
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-lg">{cat.icon}</span>
                        <h3 className="font-semibold text-gray-800 text-sm">
                          {cat.title}
                        </h3>
                      </div>
                      <p className="text-xs text-gray-500 mb-3">
                        {cat.description}
                      </p>
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
            Powered by AI with tool-calling. Answers are sourced from official
            Cal Poly Pomona website content.
          </p>
        </div>
      </div>
    </div>
  );
}
