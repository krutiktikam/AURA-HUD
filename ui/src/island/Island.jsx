import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { useBackendStatus } from '../hooks/useBackendStatus';
import { useChatSocket } from '../hooks/useChatSocket';
import { categorizeClipboard, getActionsForCategory } from './actions';
import ChatTab from './tabs/ChatTab';
import ClipboardTab from './tabs/ClipboardTab';
import StatsTab from './tabs/StatsTab';
import ControlsTab from './tabs/ControlsTab';

const STATUS_COLORS = {
  ready: '#a3e635',
  degraded: '#f5b942',
  restarting: '#f5b942',
  failed: '#ff6b6b',
  port_in_use: '#ff6b6b',
  down: '#ff6b6b',
  unknown: '#9aa3ad',
};

const safeInvoke = async (cmd, args = {}) => {
  try {
    const isTauri =
      typeof window !== 'undefined' &&
      (Boolean(window.__TAURI_INTERNALS__) || Boolean(window.__TAURI__));
    if (isTauri) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke(cmd, args);
    }
  } catch {
    // In a plain browser, invoke failures are ignored
  }
};

export default function Island() {
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState('chat');
  const [clipboardContent, setClipboardContent] = useState(null);
  const [voiceRepliesEnabled, setVoiceRepliesEnabled] = useState(false);
  const [localVoices, setLocalVoices] = useState([]);

  const isTransitioningRef = useRef(false);
  const shouldReduceMotion = useReducedMotion();

  // Detect and filter speech synthesis voices to localService === true
  useEffect(() => {
    const updateVoices = () => {
      if ('speechSynthesis' in window) {
        const voices = window.speechSynthesis.getVoices();
        const offlineVoices = voices.filter((v) => v.localService === true);
        setLocalVoices(offlineVoices);
      }
    };

    updateVoices();
    if ('speechSynthesis' in window) {
      window.speechSynthesis.addEventListener('voiceschanged', updateVoices);
      return () => {
        window.speechSynthesis.removeEventListener('voiceschanged', updateVoices);
      };
    }
  }, []);

  const handleAiDone = useCallback(
    (fullText) => {
      if (!voiceRepliesEnabled || localVoices.length === 0 || !('speechSynthesis' in window)) {
        return;
      }
      try {
        window.speechSynthesis.cancel();
        const clean = fullText.replace(/[\*\_#\`\[\]]/g, '');
        const utterance = new SpeechSynthesisUtterance(clean);
        utterance.voice = localVoices[0];
        window.speechSynthesis.speak(utterance);
      } catch {
        // Speech synthesis error ignored
      }
    },
    [voiceRepliesEnabled, localVoices]
  );

  const { pillState } = useBackendStatus(isExpanded);
  const { messages, isThinking, send, error } = useChatSocket({
    onAiDone: handleAiDone,
  });

  // Read current clipboard text once on expand
  const refreshClipboard = useCallback(async () => {
    try {
      let text = '';
      const isTauri =
        typeof window !== 'undefined' &&
        (Boolean(window.__TAURI_INTERNALS__) || Boolean(window.__TAURI__));
      if (isTauri) {
        const { invoke } = await import('@tauri-apps/api/core');
        const clip = await invoke('get_clipboard_text');
        if (clip && clip.has_content) {
          text = clip.text;
        }
      } else if (navigator.clipboard?.readText) {
        text = (await navigator.clipboard.readText()).trim();
      }

      if (text && text.trim().length > 0) {
        const category = categorizeClipboard(text);
        setClipboardContent({ text, category });
      } else {
        setClipboardContent(null);
      }
    } catch {
      setClipboardContent(null);
    }
  }, []);

  // Expand: await invoke("set_island_mode", { expanded: true }), then set expanded
  const handleExpand = useCallback(
    async (tab = 'chat') => {
      if (isTransitioningRef.current || isExpanded) return;
      isTransitioningRef.current = true;
      if (tab) setActiveTab(tab);
      await safeInvoke('set_island_mode', { expanded: true });
      setIsExpanded(true);
      refreshClipboard();
    },
    [isExpanded, refreshClipboard]
  );

  // Collapse: set collapsed, and on animation complete invoke("set_island_mode", { expanded: false })
  const handleCollapse = useCallback(() => {
    if (isTransitioningRef.current || !isExpanded) return;
    isTransitioningRef.current = true;
    setIsExpanded(false);
  }, [isExpanded]);

  const handleToggle = useCallback(() => {
    if (isTransitioningRef.current) return;
    if (isExpanded) {
      handleCollapse();
    } else {
      handleExpand('chat');
    }
  }, [isExpanded, handleCollapse, handleExpand]);

  // Listen to Tauri "island-toggle" and "island-blur" events (Tauri only)
  useEffect(() => {
    const isTauri =
      typeof window !== 'undefined' &&
      (Boolean(window.__TAURI_INTERNALS__) || Boolean(window.__TAURI__));
    if (!isTauri) return;

    let unlistenToggle = null;
    let unlistenBlur = null;
    let isMounted = true;

    import('@tauri-apps/api/event')
      .then(async ({ listen }) => {
        if (!isMounted) return;
        const un1 = await listen('island-toggle', () => {
          if (!isMounted) return;
          handleToggle();
        });
        if (!isMounted) {
          if (un1) un1();
          return;
        }
        unlistenToggle = un1;

        const un2 = await listen('island-blur', () => {
          if (!isMounted) return;
          handleCollapse();
        });
        if (!isMounted) {
          if (un2) un2();
          return;
        }
        unlistenBlur = un2;
      })
      .catch(() => {
        // Plain browser fallback
      });

    return () => {
      isMounted = false;
      if (unlistenToggle) unlistenToggle();
      if (unlistenBlur) unlistenBlur();
    };
  }, [handleToggle, handleCollapse]);

  // Esc key collapses
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isExpanded) {
        handleCollapse();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isExpanded, handleCollapse]);

  // Called when Framer Motion width/height animation completes
  const handleAnimationComplete = async () => {
    if (!isExpanded && isTransitioningRef.current) {
      await safeInvoke('set_island_mode', { expanded: false });
      isTransitioningRef.current = false;
    } else if (isExpanded && isTransitioningRef.current) {
      isTransitioningRef.current = false;
    }
  };

  const handleActionChipClick = (chip) => {
    if (!clipboardContent) return;
    const prompt = chip.prompt(clipboardContent.text);
    send(prompt);
    setActiveTab('chat');
  };

  const handleQuitApp = async () => {
    await safeInvoke('quit_app');
  };

  const transitionConfig = shouldReduceMotion
    ? { duration: 0 }
    : { type: 'spring', stiffness: 380, damping: 30 };

  const statusColor = STATUS_COLORS[pillState] || STATUS_COLORS.unknown;
  const actionChips = clipboardContent
    ? getActionsForCategory(clipboardContent.category)
    : [];

  return (
    <div className="w-full h-full flex items-center justify-center bg-transparent select-none p-0 overflow-hidden font-sans">
      <motion.div
        layout
        initial={false}
        animate={{
          width: isExpanded ? 560 : 168,
          height: isExpanded ? 380 : 40,
        }}
        transition={transitionConfig}
        onAnimationComplete={handleAnimationComplete}
        style={{
          borderRadius: isExpanded ? 28 : 20,
          backgroundColor: 'rgba(22, 22, 22, 0.97)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          boxSizing: 'border-box',
          overflow: 'hidden',
          color: '#e8ecef',
        }}
        className="relative flex flex-col shadow-2xl"
      >
        {!isExpanded ? (
          /* ========================================================================= */
          /* COLLAPSED PILL: 168x40 inside 220x64 window                                */
          /* Status dot + "AURA" + aria-label from pill state                          */
          /* ========================================================================= */
          <div
            role="status"
            aria-label={pillState}
            className="w-full h-full flex items-center justify-center px-4 bg-transparent transition-colors"
          >
            <div className="flex items-center space-x-2.5">
              <span
                style={{ backgroundColor: statusColor }}
                className="w-2.5 h-2.5 rounded-full inline-block shrink-0"
              />
              <motion.span
                layout="position"
                className="font-semibold tracking-wider text-xs text-[#e8ecef] select-none"
              >
                AURA
              </motion.span>
            </div>
          </div>
        ) : (
          /* ========================================================================= */
          /* EXPANDED ISLAND: 560x380 inside 600x420 window                            */
          /* Tabs: Chat, Clipboard, Stats, Controls                                    */
          /* ========================================================================= */
          <div className="w-full h-full flex flex-col min-h-0">
            {/* Top Navigation Bar */}
            <div className="flex items-center justify-between px-3 pt-2.5 pb-1 border-b border-white/10 shrink-0">
              <div className="flex items-center space-x-1">
                {['chat', 'clipboard', 'stats', 'controls'].map((tab) => {
                  const isActive = activeTab === tab;
                  const label = tab.charAt(0).toUpperCase() + tab.slice(1);
                  return (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setActiveTab(tab)}
                      className={`min-h-[44px] px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer outline-none transition-colors ${
                        isActive
                          ? 'text-[#a3e635] bg-white/10'
                          : 'text-[#9aa3ad] hover:text-[#e8ecef] hover:bg-white/5'
                      }`}
                    >
                      <motion.span layout="position">{label}</motion.span>
                    </button>
                  );
                })}
              </div>

              {/* Status pill & collapse toggle */}
              <div className="flex items-center space-x-2">
                <span
                  style={{ backgroundColor: statusColor }}
                  title={`Status: ${pillState}`}
                  className="w-2 h-2 rounded-full inline-block"
                />
                <button
                  type="button"
                  onClick={handleCollapse}
                  aria-label="Collapse"
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-[#9aa3ad] hover:text-[#e8ecef] hover:bg-white/5 cursor-pointer text-xs"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Tab Body */}
            <div className="flex-1 min-h-0 overflow-hidden flex flex-col p-3">
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeTab}
                  initial={shouldReduceMotion ? false : { opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={shouldReduceMotion ? undefined : { opacity: 0, y: -6 }}
                  transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.15 }}
                  className="w-full h-full flex flex-col min-h-0"
                >
                  {activeTab === 'chat' && (
                    <ChatTab
                      messages={messages}
                      isThinking={isThinking}
                      send={send}
                      error={error}
                      clipboardContent={clipboardContent}
                      actionChips={actionChips}
                      onActionClick={handleActionChipClick}
                    />
                  )}
                  {activeTab === 'clipboard' && (
                    <ClipboardTab
                      clipboardContent={clipboardContent}
                      actionChips={actionChips}
                      onActionClick={handleActionChipClick}
                    />
                  )}
                  {activeTab === 'stats' && <StatsTab />}
                  {activeTab === 'controls' && (
                    <ControlsTab
                      voiceRepliesEnabled={voiceRepliesEnabled}
                      onToggleVoiceReplies={setVoiceRepliesEnabled}
                      hasLocalVoices={localVoices.length > 0}
                      onQuitApp={handleQuitApp}
                    />
                  )}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
