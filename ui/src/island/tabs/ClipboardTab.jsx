import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { apiFetch } from '../../api';

export default function ClipboardTab({
  clipboardContent,
  actionChips,
  onActionClick,
}) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [copiedIndex, setCopiedIndex] = useState(null);

  // Fetch on tab open only, NOT on an interval
  useEffect(() => {
    let isMounted = true;

    const fetchHistory = async () => {
      try {
        const response = await apiFetch('/api/clipboard/history?limit=20');
        if (response.ok) {
          const data = await response.json();
          if (isMounted) {
            setHistory(data.history || []);
            setError(null);
          }
        } else {
          throw new Error(`HTTP ${response.status}`);
        }
      } catch (err) {
        if (isMounted) {
          setError('Failed to fetch clipboard history');
          setHistory([]);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchHistory();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleCopy = async (content, index) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 1500);
    } catch {
      // Ignore clipboard write failure
    }
  };

  return (
    <div className="w-full h-full flex flex-col min-h-0 justify-between">
      {/* Current Clipboard Action Chips */}
      {clipboardContent && actionChips && actionChips.length > 0 && (
        <div className="pb-2.5 mb-2 border-b border-white/10 shrink-0">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] text-[#9aa3ad] uppercase font-mono tracking-wider">
              Current Clipboard ({clipboardContent.category})
            </span>
          </div>
          <div className="flex items-center space-x-1.5 overflow-x-auto">
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
        </div>
      )}

      {/* History List or Status States */}
      <div className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-1">
        {loading && (
          <div className="h-full flex items-center justify-center text-xs text-[#9aa3ad]">
            <motion.span layout="position">Loading clipboard history...</motion.span>
          </div>
        )}

        {!loading && error && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-[#ff6b6b] text-xs text-center">
            <motion.span layout="position">{error}</motion.span>
          </div>
        )}

        {!loading && !error && history.length === 0 && (
          <div className="h-full flex items-center justify-center text-xs text-[#9aa3ad]">
            <motion.span layout="position">No clipboard history found</motion.span>
          </div>
        )}

        {!loading &&
          !error &&
          history.map((item, idx) => (
            <div
              key={idx}
              className="p-2.5 rounded-xl bg-white/5 border border-white/5 flex items-center justify-between space-x-3"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center space-x-2 mb-1">
                  {/* Category text label chip */}
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-white/10 border border-white/10 text-[#e8ecef]">
                    <motion.span layout="position">{item.category || 'TEXT'}</motion.span>
                  </span>
                  <span className="text-[10px] text-[#9aa3ad]">
                    {item.timestamp ? new Date(item.timestamp * 1000).toLocaleTimeString() : ''}
                  </span>
                </div>
                <p className="text-xs text-[#e8ecef] truncate select-text">
                  {item.content}
                </p>
              </div>

              {/* Copy per row */}
              <button
                type="button"
                onClick={() => handleCopy(item.content, idx)}
                className="min-h-[44px] px-3 rounded-lg text-xs font-medium text-[#9aa3ad] hover:text-[#e8ecef] hover:bg-white/5 transition-colors cursor-pointer flex items-center shrink-0"
              >
                <motion.span layout="position">
                  {copiedIndex === idx ? 'Copied' : 'Copy'}
                </motion.span>
              </button>
            </div>
          ))}
      </div>
    </div>
  );
}
