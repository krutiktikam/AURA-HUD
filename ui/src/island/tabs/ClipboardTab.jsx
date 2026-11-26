import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { apiFetch } from '../../api';
import { desktopAPI } from '../../ipcBridge';

const CAPTURE_STATUS_NOTES = {
  paused: 'not saved: paused',
  too_large: 'not saved: too large',
  cleared: 'not saved: cleared',
  error: 'not saved: backend unavailable',
};

export default function ClipboardTab({
  clipboardContent,
  actionChips,
  onActionClick,
  captureStatus,
  onCleared,
}) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const [paused, setPaused] = useState(false);
  const [retentionDays, setRetentionDays] = useState(null);
  const [settingsError, setSettingsError] = useState(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [isUpdatingPause, setIsUpdatingPause] = useState(false);

  const fetchHistory = useCallback(async (isActive = () => true) => {
    try {
      const response = await apiFetch('/api/clipboard/history?limit=20');
      if (response.ok) {
        const data = await response.json();
        if (isActive()) {
          setHistory(data.history || []);
          setError(null);
        }
      } else {
        throw new Error(`HTTP ${response.status}`);
      }
    } catch {
      if (isActive()) {
        setError('Failed to fetch clipboard history');
        setHistory([]);
      }
    } finally {
      if (isActive()) {
        setLoading(false);
      }
    }
  }, []);

  // Fetch history and settings on tab open only, NOT on an interval
  useEffect(() => {
    let isMounted = true;
    const isActive = () => isMounted;

    fetchHistory(isActive);

    desktopAPI.getClipboardSettings().then((data) => {
      if (!isMounted) return;
      if (data) {
        setPaused(Boolean(data.paused));
        if (typeof data.retention_days === 'number') {
          setRetentionDays(data.retention_days);
        }
        setSettingsError(null);
      } else {
        setSettingsError('Failed to load settings');
      }
    });

    return () => {
      isMounted = false;
    };
  }, [fetchHistory]);

  const handleCopy = async (content, rowKey) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedId(rowKey);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      // Ignore clipboard write failure
    }
  };

  const handleTogglePause = async () => {
    if (isUpdatingPause) return;
    setIsUpdatingPause(true);
    setSettingsError(null);
    const updated = await desktopAPI.setClipboardPaused(!paused);
    setIsUpdatingPause(false);
    if (updated) {
      setPaused(Boolean(updated.paused));
      if (typeof updated.retention_days === 'number') {
        setRetentionDays(updated.retention_days);
      }
    } else {
      setSettingsError('Failed to update pause setting');
    }
  };

  const handleConfirmClear = async () => {
    if (isClearing) return;
    setIsClearing(true);
    setSettingsError(null);
    const deleted = await desktopAPI.clearClipboardHistory();
    setIsClearing(false);
    setConfirmClear(false);
    if (deleted !== null) {
      await fetchHistory();
      if (onCleared) {
        onCleared();
      }
    } else {
      setSettingsError('Failed to clear clipboard history');
    }
  };

  const statusNote = captureStatus ? CAPTURE_STATUS_NOTES[captureStatus] : null;

  return (
    <div className="w-full h-full flex flex-col min-h-0 justify-between">
      {/* Current Clipboard Action Chips */}
      {clipboardContent && actionChips && actionChips.length > 0 && (
        <div className="pb-2.5 mb-2 border-b border-white/10 shrink-0">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] text-[#9aa3ad] uppercase font-mono tracking-wider">
              Current Clipboard ({clipboardContent.category})
              {statusNote ? ` — ${statusNote}` : ''}
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

      {/* Paused banner */}
      {paused && (
        <div className="mb-2 px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs text-[#f5b942] shrink-0">
          Paused: nothing is being saved.
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
          history.map((item, idx) => {
            const rowKey = item.id ?? idx;
            return (
              <div
                key={rowKey}
                className="p-2.5 rounded-xl bg-white/5 border border-white/5 flex items-center justify-between space-x-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-2 mb-1">
                    {/* Category text label chip */}
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-white/10 border border-white/10 text-[#e8ecef]">
                      <motion.span layout="position">{item.category || 'TEXT'}</motion.span>
                    </span>
                    <span className="text-[10px] text-[#9aa3ad]">
                      {item.timestamp
                        ? new Date(item.timestamp * 1000).toLocaleString([], {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : ''}
                    </span>
                  </div>
                  <p className="text-xs text-[#e8ecef] truncate select-text">
                    {item.content}
                  </p>
                </div>

                {/* Copy per row */}
                <button
                  type="button"
                  onClick={() => handleCopy(item.content, rowKey)}
                  className="min-h-[44px] px-3 rounded-lg text-xs font-medium text-[#9aa3ad] hover:text-[#e8ecef] hover:bg-white/5 transition-colors cursor-pointer flex items-center shrink-0"
                >
                  <motion.span layout="position">
                    {copiedId === rowKey ? 'Copied' : 'Copy'}
                  </motion.span>
                </button>
              </div>
            );
          })}
      </div>

      {/* Privacy controls footer */}
      <div className="shrink-0 pt-2 mt-2 border-t border-white/10">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            role="switch"
            aria-checked={paused}
            aria-label="Pause capture"
            disabled={isUpdatingPause}
            onClick={handleTogglePause}
            className={`min-h-[44px] px-2.5 rounded-lg text-xs font-medium transition-colors cursor-pointer flex items-center space-x-2 shrink-0 ${
              paused
                ? 'bg-white/10 text-[#a3e635]'
                : 'text-[#9aa3ad] hover:text-[#e8ecef] hover:bg-white/5'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full inline-block ${
                paused ? 'bg-[#a3e635]' : 'bg-[#9aa3ad]'
              }`}
            />
            <span>Pause capture</span>
          </button>

          {retentionDays !== null && (
            <span className="text-[11px] text-[#9aa3ad] shrink-0">
              Kept {retentionDays} days
            </span>
          )}

          {!confirmClear ? (
            <button
              type="button"
              onClick={() => {
                setSettingsError(null);
                setConfirmClear(true);
              }}
              className="min-h-[44px] px-3 rounded-lg text-xs font-medium text-[#ff6b6b] hover:bg-red-500/10 transition-colors cursor-pointer shrink-0"
            >
              Clear history
            </button>
          ) : (
            <div className="flex items-center space-x-1.5 shrink-0">
              <span className="text-xs text-[#e8ecef]">Clear all?</span>
              <button
                type="button"
                disabled={isClearing}
                onClick={handleConfirmClear}
                className="min-h-[44px] px-3 rounded-lg text-xs font-semibold bg-[#ff6b6b] text-[#161616] hover:opacity-90 disabled:opacity-50 transition-opacity cursor-pointer"
              >
                Yes
              </button>
              <button
                type="button"
                disabled={isClearing}
                onClick={() => setConfirmClear(false)}
                className="min-h-[44px] px-3 rounded-lg text-xs font-medium text-[#9aa3ad] hover:text-[#e8ecef] hover:bg-white/5 transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </div>
          )}
        </div>

        {settingsError && (
          <p className="text-[11px] text-[#ff6b6b] mt-1">{settingsError}</p>
        )}

        <p className="text-[10px] text-[#9aa3ad] mt-1">
          Saved on this PC only. Contents are never logged.
        </p>
      </div>
    </div>
  );
}
