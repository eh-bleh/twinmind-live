import { useState, useRef, useEffect, useCallback } from 'react';
import { Send } from 'lucide-react';

function ChatMessage({ message }) {
  return (
    <div className={`chat-message ${message.role}`}>
      <div className="chat-bubble">{message.content}</div>
      <div className="chat-meta">{message.timestamp}</div>
    </div>
  );
}

export function ChatColumn({ messages, isResponding, onSend }) {
  const [input, setInput] = useState('');
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text || isResponding) return;
    setInput('');
    onSend(text);
  }, [input, isResponding, onSend]);

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="col" style={{ display: 'flex', flexDirection: 'column' }}>
      <div className="col-header">
        <span className="col-title">Chat</span>
        {isResponding && <div className="status-dot loading" />}
      </div>

      <div className="chat-messages">
        {messages.length === 0 && (
          <div className="empty-state" style={{ flex: 1 }}>
            <div className="empty-state-icon">💬</div>
            <div className="empty-state-text">
              Click a suggestion or<br />
              type a question below.
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <ChatMessage key={msg.id} message={msg} />
        ))}

        {/* Streaming indicator */}
        {isResponding && (
          <div className="chat-message assistant">
            <div className="chat-bubble" style={{ color: 'var(--text-muted)' }}>
              <span className="typing-dots">···</span>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <div className="chat-input-area">
        <textarea
          ref={inputRef}
          className="chat-input"
          placeholder="Ask anything about the conversation..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKey}
          rows={1}
          disabled={isResponding}
        />
        <button
          className="btn btn-icon btn-accent"
          onClick={handleSend}
          disabled={!input.trim() || isResponding}
        >
          <Send size={13} />
        </button>
      </div>
    </div>
  );
}
