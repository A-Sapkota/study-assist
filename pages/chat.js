import { useState } from "react";

export default function ChatPage() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!input.trim()) return;

    const userMessage = input.trim();
    setInput("");

    // Add user message to chat
    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          question: userMessage,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        // Add AI response to chat
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: data.answer,
            sources: data.sources || [],
            chunksUsed: data.chunksUsed,
          },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            role: "error",
            content: `Error: ${data.error || "Failed to get answer"}`,
          },
        ]);
      }
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          role: "error",
          content: `Error: ${error.message}`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        maxWidth: "800px",
        margin: "0 auto",
        padding: "20px",
        fontFamily: "system-ui, sans-serif",
        height: "100vh",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div style={{ marginBottom: "20px" }}>
        <h1 style={{ margin: "0 0 10px 0" }}>Study Assistant Chat</h1>
        <p style={{ color: "#666", margin: 0 }}>
          Ask questions about your uploaded course materials
        </p>
      </div>

      {/* Chat Messages */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          border: "1px solid #ddd",
          borderRadius: "8px",
          padding: "20px",
          marginBottom: "20px",
          backgroundColor: "#f9f9f9",
        }}
      >
        {messages.length === 0 && (
          <div
            style={{ textAlign: "center", color: "#999", marginTop: "50px" }}
          >
            <p>No messages yet. Ask a question about your course materials!</p>
            <p style={{ fontSize: "14px" }}>
              Example: "What is the Pythagorean theorem?"
            </p>
          </div>
        )}

        {messages.map((msg, index) => (
          <div
            key={index}
            style={{
              marginBottom: "20px",
              padding: "15px",
              borderRadius: "8px",
              backgroundColor:
                msg.role === "user"
                  ? "#e3f2fd"
                  : msg.role === "error"
                    ? "#ffebee"
                    : "#fff",
              border: `1px solid ${
                msg.role === "user"
                  ? "#90caf9"
                  : msg.role === "error"
                    ? "#ef9a9a"
                    : "#e0e0e0"
              }`,
            }}
          >
            <div
              style={{
                fontWeight: "bold",
                marginBottom: "8px",
                color:
                  msg.role === "user"
                    ? "#1976d2"
                    : msg.role === "error"
                      ? "#c62828"
                      : "#2e7d32",
              }}
            >
              {msg.role === "user"
                ? "You"
                : msg.role === "error"
                  ? "Error"
                  : "AI Assistant"}
            </div>
            <div style={{ whiteSpace: "pre-wrap" }}>{msg.content}</div>
            {msg.sources && msg.sources.length > 0 && (
              <div
                style={{
                  marginTop: "10px",
                  paddingTop: "10px",
                  borderTop: "1px solid #ddd",
                  fontSize: "14px",
                  color: "#666",
                }}
              >
                <strong>Sources:</strong> {msg.sources.join(", ")}
                {msg.chunksUsed && ` (${msg.chunksUsed} chunks used)`}
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div
            style={{
              padding: "15px",
              borderRadius: "8px",
              backgroundColor: "#fff",
              border: "1px solid #e0e0e0",
              color: "#666",
            }}
          >
            <div
              style={{
                fontWeight: "bold",
                marginBottom: "8px",
                color: "#2e7d32",
              }}
            >
              AI Assistant
            </div>
            Thinking...
          </div>
        )}
      </div>

      {/* Input Form */}
      <form onSubmit={handleSubmit} style={{ display: "flex", gap: "10px" }}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask a question about your course materials..."
          disabled={loading}
          style={{
            flex: 1,
            padding: "12px",
            border: "2px solid #ddd",
            borderRadius: "8px",
            fontSize: "16px",
          }}
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          style={{
            padding: "12px 24px",
            backgroundColor: loading || !input.trim() ? "#ccc" : "#0070f3",
            color: "white",
            border: "none",
            borderRadius: "8px",
            fontSize: "16px",
            cursor: loading || !input.trim() ? "not-allowed" : "pointer",
            fontWeight: "bold",
          }}
        >
          {loading ? "Sending..." : "Send"}
        </button>
      </form>
    </div>
  );
}
