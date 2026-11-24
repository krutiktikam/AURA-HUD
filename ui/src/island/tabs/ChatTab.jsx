import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';

export default function ChatTab({
  messages,
  isThinking,
  send,
  error,
  clipboardContent,
  actionChips,
  onActionClick,
}) {
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();

    const handleFocus = () => {
      if (!document.activeElement || document.activeElement === document.body) {
        inputRef.current?.focus();
      }
    };

    window.addEventListener('focus', handleFocus);
    return () => {
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isThinking]);

  const handleSubmit = (e) => {
    e?.preventDefault();
    if (!inputText.trim() || isThinking) return;
    send(inputText);
    setInputText('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="w-full h-full flex flex-col min-h-0 justify-between">
      {/* Message List */}
      <div className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-1 mb-2">
        {messages.length === 0 ? (
          <div className="h-full flex items-center justify-center text-xs text-[#9aa3ad]">
            <motion.span layout="position">AURA ready. Ask a question or use clipboard actions.</motion.span>
          </div>
        ) : (
          messages.map((msg) => {
            const isUser = msg.sender === 'user';
            return (
              <div
                key={msg.id}
                className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-xs leading-relaxed break-words ${
                    isUser
                      ? 'bg-white/10 text-[#e8ecef] rounded-br-sm'
                      : 'bg-white/5 border border-white/10 text-[#e8ecef] rounded-bl-sm'
                  }`}
                >
                  <motion.p layout="position">{msg.text}</motion.p>
                </div>
              </div>
            );
          })
        )}

        {isThinking && (
          <div className="flex justify-start">
            <div className="rounded-2xl px-3.5 py-2 text-xs text-[#9aa3ad] bg-white/5 border border-white/5 italic">
              <motion.span layout="position">Thinking...</motion.span>
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-xl px-3 py-2 text-xs text-[#ff6b6b] bg-red-500/10 border border-red-500/20">
            <motion.span layout="position">{error}</motion.span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Action Chips for current clipboard content */}
      {clipboardContent && actionChips && actionChips.length > 0 && (
        <div className="flex items-center space-x-1.5 overflow-x-auto pb-2 shrink-0">
          <span className="text-[10px] text-[#9aa3ad] uppercase font-mono tracking-wider shrink-0">
            {clipboardContent.category}:
          </span>
          {actionChips.map((chip) => (
            <button
              key={chip.id}
              type="button"
              onClick={() => onActionClick(chip)}
              className="min-h-[44px] px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:border-[#a3e635] text-[#e8ecef] hover:text-[#a3e635] text-xs font-medium transition-colors shrink-0 cursor-pointer flex items-center"
            >
              <motion.span layout="position">{chip.label}</motion.span>
            </button>
          ))}
        </div>
      )}

      {/* Input Form (NO MIC BUTTON) */}
      <form onSubmit={handleSubmit} className="flex items-center space-x-2 shrink-0">
        <input
          ref={inputRef}
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          className="min-h-[44px] flex-1 bg-white/5 border border-white/10 rounded-xl px-3.5 py-2 text-xs text-[#e8ecef] placeholder-[#9aa3ad] outline-none focus:border-[#a3e635] transition-colors"
        />
        <button
          type="submit"
          disabled={!inputText.trim() || isThinking}
          className="min-h-[44px] px-4 rounded-xl bg-[#a3e635] hover:bg-[#bef264] disabled:opacity-40 disabled:cursor-not-allowed text-[#161616] font-semibold text-xs transition-colors cursor-pointer flex items-center justify-center shrink-0"
        >
          <motion.span layout="position">Send</motion.span>
        </button>
      </form>
    </div>
  );
}
