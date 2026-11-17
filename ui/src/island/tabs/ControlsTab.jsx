import React from 'react';
import { motion } from 'framer-motion';

export default function ControlsTab({
  voiceRepliesEnabled,
  onToggleVoiceReplies,
  hasLocalVoices,
  onQuitApp,
}) {
  return (
    <div className="w-full h-full flex flex-col min-h-0 justify-between p-2">
      <div className="space-y-4">
        {/* Voice Replies Toggle Row */}
        <div className="min-h-[44px] flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/5">
          <div className="flex flex-col pr-4">
            <motion.span layout="position" className="text-xs font-semibold text-[#e8ecef]">
              Voice replies
            </motion.span>
            {!hasLocalVoices ? (
              <motion.span layout="position" className="text-[11px] text-[#9aa3ad] mt-0.5">
                No local voices available on this system.
              </motion.span>
            ) : (
              <motion.span layout="position" className="text-[11px] text-[#9aa3ad] mt-0.5">
                Speak responses aloud using offline local voice.
              </motion.span>
            )}
          </div>

          <label className="relative inline-flex items-center cursor-pointer min-h-[44px] min-w-[44px] justify-center">
            <input
              type="checkbox"
              checked={voiceRepliesEnabled}
              disabled={!hasLocalVoices}
              onChange={(e) => onToggleVoiceReplies(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-10 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[12px] after:left-[4px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#a3e635] peer-disabled:opacity-40 peer-disabled:cursor-not-allowed"></div>
          </label>
        </div>
      </div>

      {/* Quit Button Row */}
      <div className="pt-4 border-t border-white/10 flex justify-end">
        <button
          type="button"
          onClick={onQuitApp}
          className="min-h-[44px] px-4 rounded-xl bg-red-500/10 border border-red-500/20 text-[#ff6b6b] hover:bg-red-500/20 hover:border-red-500/40 text-xs font-semibold transition-colors cursor-pointer flex items-center justify-center"
        >
          <motion.span layout="position">Quit AURA</motion.span>
        </button>
      </div>
    </div>
  );
}
