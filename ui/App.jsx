import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Mic,
  Zap,
  RotateCw,
  VolumeX,
  Terminal,
  X,
  Brain,
  Edit3,
  Trash2,
  Check,
  Copy,
  Code,
  Sparkles,
  Maximize2,
  Minimize2,
  FileText,
  FileCode,
  CheckCheck,
  Compass,
  Layers,
  ArrowRight
} from 'lucide-react';
import { desktopAPI } from './src/ipcBridge';
import './src/styles.css';

// Typewriter Effect Component
function TypewriterText({ text, speed = 15 }) {
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

// Active EQ Meter Component
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

// Classify clipboard content
function categorizeClipboard(text) {
  if (!text) return 'text';
  const s = text.trim();
  if (s.startsWith('http://') || s.startsWith('https://')) return 'url';
  if ((s.startsWith('{') && s.endsWith('}')) || (s.startsWith('[') && s.endsWith(']'))) return 'json';
  const codeKeywords = ['def ', 'const ', 'let ', 'var ', 'function ', 'class ', 'import ', 'return ', '=>', 'SELECT ', 'fn '];
  if (codeKeywords.some((k) => s.includes(k)) || (s.includes('\n') && (s.includes('{') || s.includes(';')))) return 'code';
  return 'text';
}

export default function App() {
  // viewMode: 'wheel' (GTA halo ring) | 'card' (Liquid stream card) | 'dashboard' (Full 1113px HUD)
  const [viewMode, setViewMode] = useState('wheel');
  const [companionName, setCompanionName] = useState('AURA');
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('AURA');
  const [isMemoryOpen, setIsMemoryOpen] = useState(false);
  const [memoryList, setMemoryList] = useState([]);
  const [hoveredSector, setHoveredSector] = useState(null);

  // Clipboard State
  const [clipboardText, setClipboardText] = useState('');
  const [clipboardCategory, setClipboardCategory] = useState('text');
  const [copiedResponse, setCopiedResponse] = useState(false);

  // Activity States
  const [isTalking, setIsTalking] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [isSpeakingTTS, setIsSpeakingTTS] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [partialText, setPartialText] = useState('');

  // Neural Chat Feed
  const [messages, setMessages] = useState([
    {
      id: 1,
      sender: 'companion',
      text: 'AURA ACTIVE: GTA Halo Ring + Morphing Liquid Card online. Global hotkey: Ctrl+Shift+A'
    }
  ]);
  const [inputText, setInputText] = useState('');
  const [streamResponse, setStreamResponse] = useState('');
  const [selectedVoice, setSelectedVoice] = useState(null);

  const chatEndRef = useRef(null);
  const wsRef = useRef(null);
  const audioContextRef = useRef(null);
  const scriptProcessorRef = useRef(null);
  const mediaStreamRef = useRef(null);

  const refreshClipboard = async () => {
    try {
      const clip = await desktopAPI.getClipboardText();
      if (clip && clip.has_content) {
        setClipboardText(clip.text);
        const cat = categorizeClipboard(clip.text);
        setClipboardCategory(cat);
        desktopAPI.syncClipboardToBackend(clip.text, cat);
      }
    } catch (e) {
      console.warn('Clipboard fetch error:', e);
    }
  };

  useEffect(() => {
    refreshClipboard();

    fetch('http://localhost:8000/api/companion')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.name) {
          setCompanionName(data.name);
          setNameInput(data.name);
        }
      })
      .catch(() => {});

    const unSummon = desktopAPI.onSummonCursor(() => {
      setViewMode('wheel');
      setStreamResponse('');
      refreshClipboard();
    });

    const unState = desktopAPI.onWindowStateChanged((state) => {
      if (state === 'expanded') {
        setViewMode('dashboard');
      } else {
        setViewMode('wheel');
      }
    });

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setViewMode('wheel');
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      if (typeof unSummon === 'function') unSummon();
      if (typeof unState === 'function') unState();
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  useEffect(() => {
    const updateVoice = () => {
      if ('speechSynthesis' in window) {
        const voices = window.speechSynthesis.getVoices();
        if (voices.length > 0) {
          const femaleVoice =
            voices.find((v) => /zira|female|jenny|eva|aria|samantha|victoria/i.test(v.name)) ||
            voices.find((v) => v.lang.startsWith('en') && !/david|male|mark/i.test(v.name)) ||
            voices[0];
          setSelectedVoice(femaleVoice);
        }
      }
    };
    updateVoice();
    if ('speechSynthesis' in window) {
      window.speechSynthesis.onvoiceschanged = updateVoice;
    }
  }, []);

  useEffect(() => {
    if (viewMode === 'dashboard' && !isMemoryOpen) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isThinking, viewMode, partialText, isMemoryOpen]);

  const handleExpandToDashboard = async () => {
    await desktopAPI.resizeWindow(1150, 420);
    setViewMode('dashboard');
  };

  const handleCollapseToWheel = async () => {
    await desktopAPI.anchorToCursor(420, 420);
    setViewMode('wheel');
    setIsMemoryOpen(false);
  };

  const handleSwitchToCard = () => {
    setViewMode('card');
  };

  const speakText = (text) => {
    if (isMuted || !text) return;
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const clean = text.replace(/[\*\_#\`\[\]]/g, '');
      const utterance = new SpeechSynthesisUtterance(clean);
      if (selectedVoice) utterance.voice = selectedVoice;
      utterance.rate = 1.04;
      utterance.pitch = 1.08;

      utterance.onstart = () => setIsSpeakingTTS(true);
      utterance.onend = () => setIsSpeakingTTS(false);
      utterance.onerror = () => setIsSpeakingTTS(false);

      window.speechSynthesis.speak(utterance);
    }
  };

  const handleSend = async (customPrompt) => {
    const prompt = customPrompt || inputText;
    if (!prompt.trim() || isThinking) return;

    const userMsg = { id: Date.now(), sender: 'user', text: prompt };
    setMessages((prev) => [...prev, userMsg]);
    if (!customPrompt) setInputText('');
    setPartialText('');
    setIsThinking(true);

    if (viewMode === 'wheel') {
      setViewMode('card');
    }

    try {
      const res = await fetch('http://localhost:8000/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt })
      });

      if (res.ok) {
        const data = await res.json();
        setIsThinking(false);
        const reply = data.response || 'Operation complete.';
        setMessages((prev) => [...prev, { id: Date.now() + 1, sender: 'companion', text: reply }]);
        setStreamResponse(reply);
        speakText(reply);
      } else {
        throw new Error('API Error');
      }
    } catch {
      setIsThinking(false);
      setIsTalking(false);
      setIsSpeakingTTS(false);
      const fallback = `[Notice] ${companionName} operating in local standby mode.`;
      setMessages((prev) => [...prev, { id: Date.now() + 2, sender: 'companion', text: fallback }]);
      setStreamResponse(fallback);
      speakText('Local server active.');
    }
  };

  const handleQuickAction = (actionType) => {
    if (!clipboardText.trim()) {
      handleSend('Provide an overview of active capabilities.');
      return;
    }

    let prompt = '';
    if (actionType === 'fix') {
      prompt = `Find bugs, optimize, and fix this snippet cleanly:\n\n${clipboardText}`;
    } else if (actionType === 'explain') {
      prompt = `Explain this snippet succinctly in 2-3 sentences:\n\n${clipboardText}`;
    } else if (actionType === 'summarize') {
      prompt = `Summarize this text in 3 concise bullet points:\n\n${clipboardText}`;
    } else if (actionType === 'format_json') {
      prompt = `Format, validate, and structure this JSON data:\n\n${clipboardText}`;
    } else if (actionType === 'telemetry') {
      prompt = `Show current CPU, RAM, and system telemetry stats.`;
    } else if (actionType === 'history') {
      prompt = `Search recent clipboard memory and list active history items.`;
    }

    if (prompt) {
      handleSend(prompt);
    }
  };

  const toggleVoice = async () => {
    if (isTalking) {
      if (scriptProcessorRef.current) {
        scriptProcessorRef.current.disconnect();
        scriptProcessorRef.current = null;
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop());
        mediaStreamRef.current = null;
      }
      wsRef.current?.close();
      setIsTalking(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true
        }
      });
      mediaStreamRef.current = stream;

      const ws = new WebSocket('ws://localhost:8000/api/stt/live');
      wsRef.current = ws;

      ws.onopen = () => {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
        audioContextRef.current = audioCtx;

        const source = audioCtx.createMediaStreamSource(stream);
        const processor = audioCtx.createScriptProcessor(4096, 1, 1);
        scriptProcessorRef.current = processor;

        processor.onaudioprocess = (e) => {
          if (ws.readyState === WebSocket.OPEN) {
            const inputData = e.inputBuffer.getChannelData(0);
            const pcm16 = new Int16Array(inputData.length);
            for (let i = 0; i < inputData.length; i++) {
              const s = Math.max(-1, Math.min(1, inputData[i]));
              pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
            }
            ws.send(pcm16.buffer);
          }
        };

        source.connect(processor);
        processor.connect(audioCtx.destination);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.event === 'transcription' && data.text) {
            setPartialText(data.text);
            handleSend(data.text);
          } else if (data.event === 'partial' && data.text) {
            setPartialText(data.text);
          }
        } catch (e) {
          console.warn('WS message error:', e);
        }
      };

      setIsTalking(true);
    } catch (err) {
      console.warn('Direct mic fallback:', err);
      handleSend('Give me a diagnostic status update.');
    }
  };

  const loadMemory = async () => {
    try {
      const res = await fetch('http://localhost:8000/api/memory');
      if (res.ok) {
        const data = await res.json();
        setMemoryList(data.history || []);
      }
    } catch {
      setMemoryList([]);
    }
  };

  const handleClearMemory = async () => {
    try {
      await fetch('http://localhost:8000/api/memory/clear', { method: 'POST' });
      setMemoryList([]);
    } catch (e) {
      console.warn('Clear memory error:', e);
    }
  };

  const handleSaveName = async () => {
    if (!nameInput.trim()) return;
    try {
      const res = await fetch('http://localhost:8000/api/companion/rename', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: nameInput.trim() })
      });
      if (res.ok) {
        const data = await res.json();
        setCompanionName(data.name);
        setIsEditingName(false);
      }
    } catch {
      setCompanionName(nameInput.trim());
      setIsEditingName(false);
    }
  };

  const haloSectors = [
    {
      id: 'fix',
      title: 'Fix & Refactor',
      icon: Sparkles,
      color: 'amber',
      x: 0,
      y: -125,
      action: () => handleQuickAction('fix')
    },
    {
      id: 'telemetry',
      title: 'Telemetry Sensors',
      icon: RotateCw,
      color: 'emerald',
      x: 110,
      y: -65,
      action: () => handleQuickAction('telemetry')
    },
    {
      id: 'voice',
      title: isTalking ? 'Stop Streaming' : 'Voice Recon',
      icon: Mic,
      color: 'pink',
      x: 110,
      y: 65,
      action: toggleVoice
    },
    {
      id: 'history',
      title: 'Clipboard Memory',
      icon: Copy,
      color: 'cyan',
      x: 0,
      y: 125,
      action: () => handleQuickAction('history')
    },
    {
      id: 'format_json',
      title: 'Format JSON',
      icon: FileCode,
      color: 'purple',
      x: -110,
      y: 65,
      action: () => handleQuickAction('format_json')
    },
    {
      id: 'explain',
      title: 'Explain & Polish',
      icon: FileText,
      color: 'teal',
      x: -110,
      y: -65,
      action: () => handleQuickAction('explain')
    }
  ];

  return (
    <div className="w-full h-full flex items-center justify-center bg-transparent select-none p-1.5 overflow-hidden font-sans">
      <AnimatePresence mode="wait">
        {viewMode === 'wheel' ? (
          <motion.div
            key="radial-halo-wheel"
            layoutId="aura-core-container"
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.85 }}
            transition={{ type: 'spring', stiffness: 420, damping: 28 }}
            className="relative w-[390px] h-[390px] flex items-center justify-center"
          >
            <div className="absolute inset-4 rounded-full bg-teal-500/5 blur-2xl pointer-events-none" />

            <svg viewBox="0 0 390 390" className="absolute inset-0 w-full h-full pointer-events-none">
              <circle
                cx="195"
                cy="195"
                r="125"
                fill="none"
                stroke="rgba(45, 212, 191, 0.15)"
                strokeWidth="1.5"
                strokeDasharray="4 8"
                className="animate-[spin_60s_linear_infinite]"
              />
              <circle
                cx="195"
                cy="195"
                r="150"
                fill="none"
                stroke="rgba(56, 189, 248, 0.1)"
                strokeWidth="1"
                strokeDasharray="12 12"
                className="animate-[spin_40s_linear_infinite_reverse]"
              />
            </svg>

            <motion.div
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleSwitchToCard}
              className="relative w-[130px] h-[130px] rounded-full bg-[#0d1117]/95 backdrop-blur-2xl border-2 border-teal-400/40 shadow-[0_0_25px_rgba(45,212,191,0.25)] flex flex-col items-center justify-center p-2 text-center cursor-pointer z-10 group"
              title="Click to open prompt card or expand"
            >
              <div className="relative w-5 h-5 flex items-center justify-center mb-1">
                <span className="w-2.5 h-2.5 rounded-full bg-teal-400 shadow-[0_0_10px_#2dd4bf] animate-ping" />
                <span className="absolute w-2 h-2 rounded-full bg-teal-300" />
              </div>
              <span className="font-mono text-xs font-black text-teal-300 tracking-wider">
                {companionName.toUpperCase()}
              </span>
              <span className="text-[9px] font-mono text-slate-400 mt-0.5">
                {hoveredSector ? hoveredSector.title : clipboardCategory.toUpperCase()}
              </span>
              <div className="flex items-center gap-1 mt-1 text-[8px] font-mono text-teal-400/80">
                <span>CLICK CORE</span>
                <ArrowRight className="w-2.5 h-2.5" />
              </div>
            </motion.div>

            {haloSectors.map((sector) => {
              const Icon = sector.icon;
              const isHovered = hoveredSector?.id === sector.id;

              return (
                <motion.button
                  key={sector.id}
                  onClick={sector.action}
                  onMouseEnter={() => setHoveredSector(sector)}
                  onMouseLeave={() => setHoveredSector(null)}
                  whileHover={{ scale: 1.12 }}
                  whileTap={{ scale: 0.9 }}
                  style={{
                    transform: `translate(${sector.x}px, ${sector.y}px)`
                  }}
                  className={`absolute w-14 h-14 rounded-2xl bg-[#161b22]/95 backdrop-blur-xl border flex flex-col items-center justify-center gap-1 cursor-pointer transition-all shadow-xl z-20 ${
                    isHovered
                      ? 'border-teal-400 bg-[#1f2937] shadow-[0_0_16px_rgba(45,212,191,0.4)] text-teal-300'
                      : 'border-teal-500/20 text-slate-300 hover:border-teal-400/60'
                  }`}
                  title={sector.title}
                >
                  <Icon
                    className={`w-5 h-5 ${
                      sector.color === 'amber'
                        ? 'text-amber-400'
                        : sector.color === 'emerald'
                        ? 'text-emerald-400'
                        : sector.color === 'pink'
                        ? 'text-pink-400'
                        : sector.color === 'cyan'
                        ? 'text-cyan-400'
                        : sector.color === 'purple'
                        ? 'text-purple-400'
                        : 'text-teal-400'
                    }`}
                  />
                  <span className="font-mono text-[8px] font-bold tracking-tight text-center leading-tight">
                    {sector.id.toUpperCase()}
                  </span>
                </motion.button>
              );
            })}

            <div className="absolute top-2 right-2 flex items-center gap-1.5 z-30">
              <button
                onClick={handleExpandToDashboard}
                className="w-6 h-6 rounded-lg bg-[#161b22]/90 border border-teal-500/20 hover:bg-teal-500/20 hover:text-teal-300 text-slate-400 flex items-center justify-center transition-all cursor-pointer"
                title="Expand to Full Tactical HUD (Ctrl+Shift+Y)"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => desktopAPI.anchorToCursor(420, 420)}
                className="w-6 h-6 rounded-lg bg-[#161b22]/90 border border-rose-500/20 hover:bg-rose-500/80 hover:text-white text-slate-400 flex items-center justify-center transition-all cursor-pointer"
                title="Dismiss (Esc)"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </motion.div>
        ) : viewMode === 'card' ? (
          <motion.div
            key="liquid-glass-card"
            layoutId="aura-core-container"
            initial={{ opacity: 0, scale: 0.9, y: -6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: -6 }}
            transition={{ type: 'spring', stiffness: 420, damping: 28 }}
            className="w-[390px] h-[340px] bg-[#0d1117]/95 backdrop-blur-2xl border border-teal-500/30 rounded-2xl shadow-2xl overflow-hidden text-slate-100 flex flex-col justify-between p-3.5 relative"
          >
            <div className="flex items-center justify-between border-b border-teal-500/15 pb-2 flex-shrink-0">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setViewMode('wheel')}
                  className="p-1 rounded bg-[#161b22] hover:bg-teal-500/20 text-teal-400 cursor-pointer"
                  title="Back to Radial Halo Wheel"
                >
                  <Compass className="w-3.5 h-3.5" />
                </button>
                <span className="font-mono text-xs font-bold text-teal-300 tracking-wider">
                  {companionName.toUpperCase()} STREAM
                </span>
                <span className="bg-teal-500/10 text-teal-300 text-[9px] px-1.5 py-0.5 rounded border border-teal-500/20 font-mono">
                  {clipboardCategory.toUpperCase()}
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={handleExpandToDashboard}
                  className="w-5 h-5 rounded-md bg-[#161b22] hover:bg-teal-500/20 hover:text-teal-300 text-slate-400 flex items-center justify-center transition-all cursor-pointer"
                  title="Expand to Full HUD"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setViewMode('wheel')}
                  className="w-5 h-5 rounded-md bg-[#161b22] hover:bg-rose-500/80 hover:text-white text-slate-400 flex items-center justify-center transition-all cursor-pointer"
                  title="Dismiss (Esc)"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {clipboardText && (
              <div
                className="bg-[#161b22]/90 border border-teal-500/20 rounded-lg p-2 flex items-start gap-2 cursor-pointer hover:border-teal-400/40 transition-colors flex-shrink-0 my-1"
                onClick={refreshClipboard}
                title="Click to refresh OS clipboard"
              >
                {clipboardCategory === 'code' ? (
                  <FileCode className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0 mt-0.5" />
                ) : (
                  <FileText className="w-3.5 h-3.5 text-teal-400 flex-shrink-0 mt-0.5" />
                )}
                <p className="font-mono text-[11px] text-slate-300 line-clamp-1 break-all flex-1">
                  {clipboardText}
                </p>
                <Copy className="w-3 h-3 text-slate-500 flex-shrink-0 mt-0.5" />
              </div>
            )}

            <div className="bg-[#161b22]/90 border border-teal-500/15 rounded-lg p-2.5 flex-1 overflow-y-auto my-1 text-xs font-mono text-slate-200 leading-relaxed min-h-0 relative">
              {isThinking ? (
                <div className="flex items-center gap-2 text-teal-300">
                  <span className="w-2 h-2 rounded-full bg-teal-400 animate-ping" />
                  <span>Thinking...</span>
                </div>
              ) : streamResponse ? (
                <div>
                  <TypewriterText text={streamResponse} speed={15} />
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(streamResponse);
                      setCopiedResponse(true);
                      setTimeout(() => setCopiedResponse(false), 2000);
                    }}
                    className="absolute top-2 right-2 text-slate-400 hover:text-teal-300 p-1 rounded bg-[#0d1117]/80"
                    title="Copy response"
                  >
                    {copiedResponse ? <CheckCheck className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  </button>
                </div>
              ) : (
                <div className="text-slate-500 text-[11px]">
                  Use the quick actions on the Halo Wheel or enter a prompt below.
                </div>
              )}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSend();
              }}
              className="flex items-center gap-2 bg-[#161b22] border border-teal-500/20 focus-within:border-teal-400 rounded-lg px-2 py-1.5 flex-shrink-0 transition-colors"
            >
              <button
                type="button"
                onClick={toggleVoice}
                className={`p-1 rounded cursor-pointer transition-colors ${
                  isTalking ? 'text-pink-400 animate-pulse bg-pink-500/10' : 'text-slate-400 hover:text-teal-300'
                }`}
                title={isTalking ? 'Stop recording' : 'Stream voice (16kHz PCM)'}
              >
                <Mic className="w-3.5 h-3.5" />
              </button>
              <input
                type="text"
                className="w-full bg-transparent border-none outline-none text-slate-100 placeholder:text-slate-500 font-mono text-xs"
                placeholder="Ask or command..."
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
              />
              <button
                type="submit"
                className="text-teal-400 hover:text-teal-300 font-bold text-xs px-1.5 py-0.5 rounded cursor-pointer"
              >
                <Zap className="w-3.5 h-3.5" />
              </button>
            </form>
          </motion.div>
        ) : (
          <motion.div
            key="spatial-tactical-dashboard"
            layoutId="aura-core-container"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 380, damping: 26 }}
            className="w-[1113px] h-[385px] bg-[#0d1117]/95 backdrop-blur-2xl border border-teal-500/20 rounded-2xl shadow-2xl overflow-hidden text-slate-100 flex flex-col justify-between relative"
          >
            <header className="h-[42px] px-5 py-2 flex items-center justify-between border-b border-teal-500/10 bg-[#161b22]/50 flex-shrink-0">
              <div className="flex items-center gap-3">
                {isEditingName ? (
                  <div className="flex items-center gap-1.5 bg-[#0d1117] border border-teal-400 px-2 py-0.5 rounded">
                    <input
                      type="text"
                      className="bg-transparent text-teal-300 font-mono font-bold text-xs outline-none w-24"
                      value={nameInput}
                      onChange={(e) => setNameInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSaveName()}
                      autoFocus
                    />
                    <button onClick={handleSaveName} className="text-emerald-400 hover:text-emerald-300">
                      <Check className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => setIsEditingName(false)} className="text-rose-400 hover:text-rose-300">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <div
                    className="flex items-center gap-2 group cursor-pointer"
                    onClick={() => setIsEditingName(true)}
                    title="Click to rename companion"
                  >
                    <span className="text-teal-400 font-mono font-bold tracking-wider text-sm flex items-center gap-2">
                      <span className="text-teal-400">◆</span> {companionName.toUpperCase()}
                    </span>
                    <Edit3 className="w-3 h-3 text-slate-500 group-hover:text-teal-400 transition-colors" />
                  </div>
                )}

                <span className="bg-teal-500/10 border border-teal-500/30 text-teal-300 text-[10px] px-2 py-0.5 rounded-full font-mono font-semibold">
                  SPATIAL HUD
                </span>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    const next = !isMemoryOpen;
                    setIsMemoryOpen(next);
                    if (next) loadMemory();
                  }}
                  className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-md font-mono text-xs border transition-all cursor-pointer ${
                    isMemoryOpen
                      ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 shadow-[0_0_8px_rgba(56,189,248,0.3)]'
                      : 'bg-[#161b22] border-teal-500/20 text-slate-400 hover:text-teal-300'
                  }`}
                  title="View / Inspect Working Memory"
                >
                  <Brain className="w-3.5 h-3.5" />
                  <span>MEMORY</span>
                </button>

                <span className="bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs px-2.5 py-0.5 rounded-md font-mono font-semibold tracking-wide">
                  {isThinking ? 'COMPUTING' : isTalking ? 'STREAMING AUDIO' : isSpeakingTTS ? 'TRANSMITTING' : 'STEADY'}
                </span>

                <button
                  onClick={handleCollapseToWheel}
                  className="w-6 h-6 rounded-full bg-[#21262d] hover:bg-teal-500/80 hover:text-white text-slate-400 flex items-center justify-center transition-all cursor-pointer"
                  title="Collapse to Radial Halo Wheel"
                >
                  <Minimize2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </header>

            <main className="grid grid-cols-12 gap-4 p-4 flex-1 min-h-0 relative">
              <AnimatePresence>
                {isMemoryOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="absolute inset-x-4 top-4 bottom-4 bg-[#0d1117]/98 border border-cyan-500/30 rounded-xl p-4 z-20 flex flex-col justify-between shadow-2xl backdrop-blur-2xl font-mono"
                  >
                    <div className="flex items-center justify-between border-b border-teal-500/20 pb-2 flex-shrink-0">
                      <div className="flex items-center gap-2 text-cyan-400 font-bold text-sm">
                        <Brain className="w-4 h-4" /> {companionName}'S ACTIVE WORKING MEMORY
                        <span className="text-xs text-slate-400 font-normal">({memoryList.length} turns)</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={handleClearMemory}
                          className="flex items-center gap-1 text-xs text-rose-400 hover:text-rose-300 border border-rose-500/30 px-2 py-0.5 rounded cursor-pointer transition-colors"
                        >
                          <Trash2 className="w-3 h-3" /> Clear Memory
                        </button>
                        <button onClick={() => setIsMemoryOpen(false)} className="text-slate-400 hover:text-slate-200">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <div className="flex-1 overflow-y-auto my-2 pr-2 flex flex-col gap-2 text-xs">
                      {memoryList.length === 0 ? (
                        <div className="text-slate-500 text-center py-8">Memory buffer is empty.</div>
                      ) : (
                        memoryList.map((item, idx) => (
                          <div
                            key={idx}
                            className={`p-2 rounded border ${
                              item.role === 'user'
                                ? 'bg-[#161b22] border-amber-500/30 text-amber-200'
                                : 'bg-[#131923] border-cyan-500/30 text-slate-200'
                            }`}
                          >
                            <div className="font-bold text-[10px] text-slate-400 mb-0.5">
                              {item.role === 'user' ? '► USER' : `❖ ${companionName.toUpperCase()}`}
                            </div>
                            <div className="whitespace-pre-wrap">{item.content}</div>
                          </div>
                        ))
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

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

              <section className="col-span-3 grid grid-cols-2 gap-2.5">
                <button
                  onClick={toggleVoice}
                  className={`bg-[#161b22] border rounded-xl p-3 flex flex-col items-center justify-center gap-2 cursor-pointer transition-all shadow-md ${
                    isTalking
                      ? 'border-pink-500 bg-pink-500/10 text-pink-400 shadow-[0_0_12px_rgba(236,72,153,0.3)] animate-pulse'
                      : 'border-teal-500/10 hover:border-teal-500/40 hover:bg-[#1f242d] text-slate-200'
                  }`}
                  title={isTalking ? 'Click to stop voice streaming' : 'Click to stream live 16kHz PCM'}
                >
                  <Mic className={`w-5 h-5 ${isTalking ? 'text-pink-400 scale-110' : 'text-teal-400'}`} />
                  <span className="font-mono font-bold text-[11px] text-center">
                    {isTalking ? 'STREAMING' : 'RECON (VOICE)'}
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
                  onClick={() => handleSend('Get system telemetry and status.')}
                  className="bg-[#161b22] border border-teal-500/10 hover:border-teal-400/50 hover:bg-[#1f242d] text-slate-200 rounded-xl p-3 flex flex-col items-center justify-center gap-2 cursor-pointer transition-all shadow-md active:scale-95 group"
                >
                  <RotateCw className="w-5 h-5 text-teal-400 group-hover:rotate-45 transition-transform" />
                  <span className="font-mono font-bold text-[11px] text-center">TELEMETRY</span>
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
                          <span className="text-teal-400">❖ {companionName.toUpperCase()}</span>
                        )}
                      </div>
                      {idx === messages.length - 1 && m.sender === 'companion' ? (
                        <TypewriterText text={m.text} speed={15} />
                      ) : (
                        <span className="whitespace-pre-wrap">{m.text}</span>
                      )}
                    </div>
                  ))}
                  {isThinking && (
                    <div className="p-2.5 rounded-lg border bg-[#0d1117] border-teal-500/30 text-teal-300 self-start">
                      <div className="text-[10px] font-bold mb-1 text-teal-400">❖ {companionName.toUpperCase()}</div>
                      <span className="animate-pulse">⚡ Invoking local agent & sensor tools...</span>
                    </div>
                  )}
                  {partialText && isTalking && (
                    <div className="p-2 rounded-lg border border-pink-500/30 bg-pink-500/10 text-pink-300 text-xs">
                      <span className="font-bold">🎙️ Stream:</span> {partialText}
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
                    placeholder={`Ask ${companionName} or request telemetry...`}
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

            <footer className="h-[32px] px-6 flex items-center justify-between border-t border-teal-500/10 bg-[#161b22]/30 text-[11px] font-mono text-slate-400 opacity-80 flex-shrink-0">
              <div>CYCLES <span className="text-teal-400 font-semibold">13,607</span></div>
              <div>SPECTRUM <span className="text-teal-400 font-semibold">136 AQI</span></div>
              <div>STATUS <span className="text-teal-400 font-semibold">POTENT</span></div>
            </footer>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
