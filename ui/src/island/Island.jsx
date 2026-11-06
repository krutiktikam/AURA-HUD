import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { useBackendStatus } from '../hooks/useBackendStatus';
import { useChatSocket } from '../hooks/useChatSocket';

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
  const isTransitioningRef = useRef(false);
  const shouldReduceMotion = useReducedMotion();

  const { pillState } = useBackendStatus(isExpanded);
  const { connection, messages, isThinking, send, error } = useChatSocket();

  // Expand: await invoke("set_island_mode", { expanded: true }), then set expanded
  const handleExpand = useCallback(async (tab = 'chat') => {
    if (isTransitioningRef.current || isExpanded) return;
    isTransitioningRef.current = true;
    if (tab) setActiveTab(tab);
    await safeInvoke('set_island_mode', { expanded: true });
    setIsExpanded(true);
  }, [isExpanded]);

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

  // Listen to Tauri "island-toggle" event (Tauri only)
  useEffect(() => {
    const isTauri =
      typeof window !== 'undefined' &&
      (Boolean(window.__TAURI_INTERNALS__) || Boolean(window.__TAURI__));
    if (!isTauri) return;

    let unlisten = null;
    let isMounted = true;

    import('@tauri-apps/api/event')
      .then(({ listen }) => {
        if (!isMounted) return;
        return listen('island-toggle', () => {
          if (!isMounted) return;
          handleToggle();
        });
      })
      .then((un) => {
        if (!isMounted) {
          if (un) un();
        } else {
          unlisten = un;
        }
      })
      .catch(() => {
        // Plain browser fallback
      });

    return () => {
      isMounted = false;
      if (unlisten) unlisten();
    };
  }, [handleToggle]);

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

  const transitionConfig = shouldReduceMotion
    ? { duration: 0 }
    : { type: 'spring', stiffness: 380, damping: 30 };

  const statusColor = STATUS_COLORS[pillState] || STATUS_COLORS.unknown;

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
          backgroundColor: 'rgba(22, 22, 22, 0.92)',
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
          <button
            type="button"
            onClick={() => handleExpand('chat')}
            aria-label={pillState}
            className="w-full h-full flex items-center justify-center px-4 cursor-pointer outline-none bg-transparent hover:bg-white/5 transition-colors"
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
          </button>
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
                  <motion.div layout="position" className="text-xs text-[#9aa3ad]">
                    {activeTab}
                  </motion.div>
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
