import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, Zap, RotateCw, VolumeX, Terminal, X } from 'lucide-react';
import './styles.css';

// Typewriter Effect Component for Neural Stream Output
function TypewriterText({ text, speed = 20 }) {
  const [displayedText, setDisplayedText] = useState('');

  useEffect(() => {
    setDisplayedText('');
    let i = 0;
    const timer = setInterval(() => {
      if (i < text.length) {
        setDisplayedText((prev) => prev + text.charAt(i));
        i++;
      } else {
        clearInterval(timer);
      }
    }, speed);

    return () => clearInterval(timer);
  }, [text, speed]);

  return <span>{displayedText}</span>;
}

// Active EQ Meter Component with Framer Motion random block animations
function AnimatedEQMeter({ isTalking, isThinking, isSpeaking }) {
  const bars = [
    { type: 'green' }, { type: 'green' }, { type: 'green' }, { type: 'green' },
    { type: 'green' }, { type: 'green' }, { type: 'green' }, { type: 'yellow' },
    { type: 'yellow' }, { type: 'yellow' }, { type: 'yellow' }, { type: 'red' },
    { type: 'red' }, { type: 'red' }, { type: 'red' }, { type: 'red' }
  ];

  return (
    <div className="flex items-end gap-1 h-6 w-full">
      {bars.map((bar, i) => {
        const activeProbability = isTalking || isSpeaking ? 0.9 : isThinking ? 0.6 : 0.35;
        const colorClass =
          bar.type === 'green'
            ? 'bg-emerald-400 shadow-[0_0_6px_#34d399]'
            : bar.type === 'yellow'
            ? 'bg-amber-400 shadow-[0_0_6px_#fbbf24]'
            : 'bg-rose-500 shadow-[0_0_6px_#f43f5e]';

        return (
          <motion.div
            key={i}
            className={`flex-1 rounded-sm ${colorClass}`}
            animate={{
              height: ['20%', `${Math.floor(Math.random() * 80 + 20)}%`, '30%'],
              opacity: [0.3, Math.random() < activeProbability ? 1 : 0.2, 0.4]
            }}
            transition={{
              duration: 0.4 + (i % 5) * 0.1,
              repeat: Infinity,
              repeatType: 'mirror',
              ease: 'easeInOut'
            }}
          />
        );
      })}
    </div>
  );
}

export default function App() {
  const [isExpanded, setIsExpanded] = useState(false);

  // Activity States
  const [isTalking, setIsTalking] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [isSpeakingTTS, setIsSpeakingTTS] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  // Neural Chat Feed
  const [messages, setMessages] = useState([
    {
      id: 1,
      sender: 'companion',
      text: 'AI COMPANION ONLINE: 100% Offline Local Neural Core Active. Whisper STT & Llama 3.2 ready.'
    }
  ]);
  const [inputText, setInputText] = useState('');

  const chatEndRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  // Sync IPC state
  useEffect(() => {
    if (window.electronAPI?.getWindowState) {
      window.electronAPI.getWindowState().then((state) => {
        setIsExpanded(state === 'expanded');
      });
    }

    if (window.electronAPI?.onWindowStateChanged) {
      const unsubscribe = window.electronAPI.onWindowStateChanged((state) => {
        setIsExpanded(state === 'expanded');
      });
      return () => {
        if (typeof unsubscribe === 'function') unsubscribe();
      };
    }
  }, []);

  // Handshake Logic: Resize window before expanding, delay resize on collapse
  const handleExpand = async () => {
    if (window.electronAPI?.resizeWindow) {
      await window.electronAPI.resizeWindow(1150, 420);
    }
    setIsExpanded(true);
  };

  const handleCollapse = () => {
    setIsExpanded(false);
    setTimeout(async () => {
      if (window.electronAPI?.resizeWindow) {
        await window.electronAPI.resizeWindow(160, 60);
      }
    }, 400);
  };

  const [selectedVoice, setSelectedVoice] = useState(null);

  // Auto-detect and select offline female voice (Microsoft Zira, Jenny, Samantha, etc.)
  useEffect(() => {
    const updateVoice = () => {
      if ('speechSynthesis' in window) {
        const voices = window.speechSynthesis.getVoices();
        if (voices.length > 0) {
          const femaleVoice = voices.find((v) =>
            /zira|female|jenny|eva|aria|samantha|victoria|karen|susan/i.test(v.name)
          ) || voices.find((v) =>
            v.lang.startsWith('en') && !/david|male|mark|george/i.test(v.name)
          ) || voices[0];

          setSelectedVoice(femaleVoice);
        }
      }
    };

    updateVoice();
    if ('speechSynthesis' in window) {
      window.speechSynthesis.onvoiceschanged = updateVoice;
    }
  }, []);

  // Auto-scroll chat
  useEffect(() => {
    if (isExpanded) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isThinking, isExpanded]);

  // Spoken TTS (Uses offline female voice)
  const speakText = (text) => {
    if (isMuted) return;
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const clean = text.replace(/[\*\_#\`]/g, '');
      const utterance = new SpeechSynthesisUtterance(clean);
      if (selectedVoice) {
        utterance.voice = selectedVoice;
      }
      utterance.rate = 1.02;
      utterance.pitch = 1.08; // Clear, pleasant female tone

      utterance.onstart = () => setIsSpeakingTTS(true);
      utterance.onend = () => setIsSpeakingTTS(false);
      utterance.onerror = () => setIsSpeakingTTS(false);

      window.speechSynthesis.speak(utterance);
    }
  };

  // Handle Send LLM Chat (Local Ollama API)
  const handleSend = async (customPrompt) => {
    const prompt = customPrompt || inputText;
    if (!prompt.trim() || isThinking) return;

    const userMsg = { id: Date.now(), sender: 'user', text: prompt };
    setMessages((prev) => [...prev, userMsg]);
    if (!customPrompt) setInputText('');

    setIsThinking(true);

    try {
      const res = await fetch('http://localhost:8000/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt })
      });

      if (res.ok) {
        const data = await res.json();
        setIsThinking(false);
        setMessages((prev) => [...prev, { id: Date.now() + 1, sender: 'companion', text: data.response }]);
        speakText(data.response);
      } else {
        throw new Error('API Error');
      }
    } catch {
      setIsThinking(false);
      setIsTalking(false);
      setIsSpeakingTTS(false);
      const fallback = '[ALERT] Local backend offline. Ensure Ollama service is active on port 11435.';
      setMessages((prev) => [...prev, { id: Date.now() + 2, sender: 'companion', text: fallback }]);
      speakText('Local backend warning.');
    }
  };

  // 100% Offline Voice Recording with Local Faster-Whisper Pipeline
  const toggleVoice = async () => {
    if (isTalking) {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
      setIsTalking(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
        stream.getTracks().forEach((track) => track.stop());

        setIsThinking(true);
        try {
          const formData = new FormData();
          formData.append('file', audioBlob, 'mic.wav');

          const res = await fetch('http://localhost:8000/api/stt', {
            method: 'POST',
            body: formData
          });

          if (res.ok) {
            const data = await res.json();
            setIsThinking(false);
            if (data.transcript && data.transcript.trim() && !data.transcript.includes('[Inaudible')) {
              handleSend(data.transcript);
            }
          } else {
            setIsThinking(false);
          }
        } catch (err) {
          setIsThinking(false);
          console.error("Local Whisper STT Error:", err);
        }
      };

      mediaRecorder.start();
      setIsTalking(true);
    } catch (err) {
      console.warn("Direct microphone recording fallback:", err);
      handleSend('Give me a diagnostic status update.');
    }
  };

  return (
    <div className="w-full h-full flex items-center justify-center bg-transparent select-none p-2 overflow-hidden">
      <AnimatePresence mode="wait">
        {!isExpanded ? (
          /* Upgraded "Docked" State (140x40 inside 160x60) */
          <motion.div
            key="docked-pill"
            layoutId="dynamic-island"
            onClick={handleExpand}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ type: 'spring', stiffness: 350, damping: 25 }}
            className="w-[140px] h-[40px] rounded-full bg-[#0d1117]/90 backdrop-blur-md border border-teal-500/30 shadow-lg shadow-teal-500/10 cursor-pointer flex items-center justify-center gap-2.5 px-3 hover:border-teal-400/60 hover:shadow-teal-500/20 transition-all select-none group"
            title="Click to expand AI Companion"
          >
            {/* Tactical Telemetry Circular Gauge */}
            <div className="relative w-4 h-4 flex items-center justify-center">
              <motion.div
                animate={{ opacity: [0.4, 1, 0.4], scale: [0.9, 1.15, 0.9] }}
                transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]"
              />
              <svg viewBox="0 0 36 36" className="absolute inset-0 w-full h-full transform -rotate-90">
                <circle cx="18" cy="18" r="14" fill="none" stroke="#1f2937" strokeWidth="3" />
                <circle
                  cx="18" cy="18" r="14" fill="none" stroke="#2dd4bf" strokeWidth="3"
                  strokeDasharray="88" strokeDashoffset="28" strokeLinecap="round"
                />
              </svg>
            </div>

            <span className="font-sans font-semibold text-xs text-slate-200 tracking-wide group-hover:text-teal-300 transition-colors">
              {isTalking ? 'Listening...' : isThinking ? 'Thinking...' : isSpeakingTTS ? 'Speaking...' : 'AI Ready'}
            </span>
          </motion.div>
        ) : (
          /* Expanded Landscape Dashboard (1113px × 385px) */
          <motion.div
            key="expanded-dashboard"
            layoutId="dynamic-island"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 350, damping: 25 }}
            className="w-[1113px] h-[385px] bg-[#0d1117]/95 backdrop-blur-xl border border-teal-500/20 rounded-2xl shadow-2xl overflow-hidden text-slate-100 font-sans flex flex-col justify-between select-none"
          >
            {/* Header */}
            <header className="h-[42px] px-5 py-2 flex items-center justify-between border-b border-teal-500/10 bg-[#161b22]/50 flex-shrink-0">
              <div className="flex items-center gap-3">
                <span className="text-teal-400 font-mono font-bold tracking-wider text-sm flex items-center gap-2">
                  <span className="text-teal-400">◆</span> AI COMPANION
                </span>
                <span className="bg-teal-500/10 border border-teal-500/30 text-teal-300 text-[10px] px-2 py-0.5 rounded-full font-mono font-semibold">
                  LLM 1B (OFFLINE)
                </span>
              </div>

              <div className="flex items-center gap-3">
                <span className="bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs px-2.5 py-0.5 rounded-md font-mono font-semibold tracking-wide">
                  {isThinking ? 'COMPUTING' : isTalking ? 'LISTENING (WHISPER)' : isSpeakingTTS ? 'TRANSMITTING' : 'STEADY'}
                </span>
                <button
                  onClick={handleCollapse}
                  className="w-6 h-6 rounded-full bg-[#21262d] hover:bg-rose-500/80 hover:text-white text-slate-400 flex items-center justify-center transition-all cursor-pointer"
                  title="Close Dashboard"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </header>

            {/* 3-Column Grid */}
            <main className="grid grid-cols-12 gap-4 p-4 flex-1 min-h-0">
              {/* Column 1 */}
              <section className="col-span-3 flex flex-col gap-3">
                <div className="bg-[#161b22]/80 border border-teal-500/10 rounded-xl p-3.5 flex flex-col gap-2.5">
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-sm text-slate-100 flex items-baseline gap-1">
                      51 <small className="text-xs font-normal text-slate-400">dB</small>
                    </span>
                    <span className="text-[10px] font-mono font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded">
                      ACTIVE
                    </span>
                  </div>
                  <AnimatedEQMeter isTalking={isTalking} isThinking={isThinking} isSpeaking={isSpeakingTTS} />
                </div>

                <div className="bg-[#161b22]/80 border border-teal-500/10 rounded-xl p-3.5 flex items-center gap-4 flex-1">
                  <div className="relative w-16 h-16 flex-shrink-0 flex items-center justify-center">
                    <svg viewBox="0 0 80 80" className="w-full h-full transform -rotate-90">
                      <circle cx="40" cy="40" r="32" fill="none" stroke="#1f2937" strokeWidth="6" />
                      <circle
                        cx="40" cy="40" r="32" fill="none" stroke="#38bdf8" strokeWidth="6"
                        strokeDasharray="201" strokeDashoffset={201 - 201 * 0.66}
                        strokeLinecap="round" className="shadow-[0_0_10px_#38bdf8]"
                      />
                      <circle cx="40" cy="40" r="22" fill="none" stroke="#1f2937" strokeWidth="6" />
                      <circle
                        cx="40" cy="40" r="22" fill="none" stroke="#ec4899" strokeWidth="6"
                        strokeDasharray="138" strokeDashoffset={138 - 138 * 0.76}
                        strokeLinecap="round" className="shadow-[0_0_10px_#ec4899]"
                      />
                    </svg>
                  </div>

                  <div className="flex flex-col gap-2 font-mono">
                    <div className="text-[11px] font-bold text-slate-100 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_6px_#38bdf8]" />
                      1.32 <small className="text-[9px] text-slate-400">OF 2.0 GB</small>
                    </div>
                    <div className="text-[11px] font-bold text-slate-100 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-pink-500 shadow-[0_0_6px_#ec4899]" />
                      46 <small className="text-[9px] text-slate-400">TOK/SEC</small>
                    </div>
                  </div>
                </div>
              </section>

              {/* Column 2 */}
              <section className="col-span-3 grid grid-cols-2 gap-2.5">
                <button
                  onClick={toggleVoice}
                  className={`bg-[#161b22] border rounded-xl p-3 flex flex-col items-center justify-center gap-2 cursor-pointer transition-all shadow-md ${
                    isTalking
                      ? 'border-pink-500 bg-pink-500/10 text-pink-400 shadow-[0_0_12px_rgba(236,72,153,0.3)] animate-pulse'
                      : 'border-teal-500/10 hover:border-teal-500/40 hover:bg-[#1f242d] text-slate-200'
                  }`}
                  title={isTalking ? 'Click to stop recording & transcribe with Whisper' : 'Click to start voice recording'}
                >
                  <Mic className={`w-5 h-5 ${isTalking ? 'text-pink-400 scale-110' : 'text-teal-400'}`} />
                  <span className="font-mono font-bold text-[11px] text-center">
                    {isTalking ? 'STOP (REC)' : 'RECON (VOICE)'}
                  </span>
                </button>

                <button
                  onClick={() => handleSend()}
                  className="bg-[#161b22] border border-teal-500/10 hover:border-amber-500/50 hover:bg-[#1f242d] text-slate-200 rounded-xl p-3 flex flex-col items-center justify-center gap-2 cursor-pointer transition-all shadow-md active:scale-95 group"
                >
                  <Zap className="w-5 h-5 text-amber-400 group-hover:scale-110 transition-transform" />
                  <span className="font-mono font-bold text-[11px] text-center">ENGAGE</span>
                </button>

                <button
                  onClick={() => handleSend('Regenerate system response.')}
                  className="bg-[#161b22] border border-teal-500/10 hover:border-teal-400/50 hover:bg-[#1f242d] text-slate-200 rounded-xl p-3 flex flex-col items-center justify-center gap-2 cursor-pointer transition-all shadow-md active:scale-95 group"
                >
                  <RotateCw className="w-5 h-5 text-teal-400 group-hover:rotate-45 transition-transform" />
                  <span className="font-mono font-bold text-[11px] text-center">REGEN</span>
                </button>

                <button
                  onClick={() => setIsMuted(!isMuted)}
                  className={`bg-[#161b22] border rounded-xl p-3 flex flex-col items-center justify-center gap-2 cursor-pointer transition-all shadow-md ${
                    isMuted
                      ? 'border-rose-500 bg-rose-500/10 text-rose-400 shadow-[0_0_12px_rgba(244,63,94,0.3)]'
                      : 'border-teal-500/10 hover:border-teal-500/40 hover:bg-[#1f242d] text-slate-200'
                  }`}
                >
                  <VolumeX className="w-5 h-5 text-rose-400" />
                  <span className="font-mono font-bold text-[11px] text-center">
                    {isMuted ? 'MUTED' : 'MUTE'}
                  </span>
                </button>
              </section>

              {/* Column 3 */}
              <section className="col-span-6 bg-[#161b22]/70 border border-teal-500/10 rounded-xl p-3.5 flex flex-col justify-between flex-1 min-h-0 relative overflow-hidden bg-hud-grid">
                <div className="flex items-center justify-between border-b border-teal-500/10 pb-2 flex-shrink-0">
                  <span className="font-mono text-xs font-bold text-teal-400 tracking-wider flex items-center gap-1.5">
                    <Terminal className="w-3.5 h-3.5" /> RIGEL NEURAL STREAM
                  </span>
                  <span className="font-mono text-[10px] text-slate-500">ø13_49</span>
                </div>

                <div className="flex-1 overflow-y-auto py-2.5 my-1 flex flex-col gap-2 font-mono text-xs pr-1">
                  {messages.map((m, idx) => (
                    <div
                      key={m.id}
                      className={`p-2.5 rounded-lg border leading-relaxed ${
                        m.sender === 'user'
                          ? 'bg-[#1e232a] border-amber-500/30 text-amber-100 self-end max-w-[85%]'
                          : 'bg-[#0d1117] border-teal-500/30 text-slate-200 self-start max-w-[95%]'
                      }`}
                    >
                      <div className="text-[10px] font-bold mb-1 flex items-center gap-1">
                        {m.sender === 'user' ? (
                          <span className="text-amber-400">► USER</span>
                        ) : (
                          <span className="text-teal-400">❖ COMPANION</span>
                        )}
                      </div>
                      {idx === messages.length - 1 && m.sender === 'companion' ? (
                        <TypewriterText text={m.text} speed={20} />
                      ) : (
                        <span>{m.text}</span>
                      )}
                    </div>
                  ))}
                  {isThinking && (
                    <div className="p-2.5 rounded-lg border bg-[#0d1117] border-teal-500/30 text-teal-300 self-start">
                      <div className="text-[10px] font-bold mb-1 text-teal-400">❖ COMPANION</div>
                      <span className="animate-pulse">⚡ Processing offline neural output...</span>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSend();
                  }}
                  className="border-b border-teal-500/30 focus-within:border-teal-400 bg-transparent text-xs font-mono text-slate-100 flex items-center gap-2 px-1 py-1.5 flex-shrink-0 transition-colors"
                >
                  <span className="text-teal-400 font-bold text-sm">►</span>
                  <input
                    type="text"
                    className="w-full bg-transparent border-none outline-none text-slate-100 placeholder:text-slate-600 font-mono text-xs"
                    placeholder="Ask your AI companion..."
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                  />
                  <button
                    type="submit"
                    className="text-teal-400 hover:text-teal-300 font-bold text-xs px-2 py-0.5 rounded transition-colors cursor-pointer"
                  >
                    SEND
                  </button>
                </form>
              </section>
            </main>

            {/* Footer */}
            <footer className="h-[32px] px-6 flex items-center justify-between border-t border-teal-500/10 bg-[#161b22]/30 text-[11px] font-mono text-slate-400 opacity-80 flex-shrink-0">
              <div>
                CYCLES <span className="text-teal-400 font-semibold">13,607</span>
              </div>
              <div>
                SPECTRUM <span className="text-teal-400 font-semibold">136 AQI</span>
              </div>
              <div>
                STATUS <span className="text-teal-400 font-semibold">POTENT</span>
              </div>
            </footer>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
