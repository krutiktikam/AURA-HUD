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
  Sliders,
  Settings,
  MessageSquare,
  Activity,
  Heart,
  Users,
  Compass,
  Cpu,
  Layers,
  ArrowRight
} from 'lucide-react';
import { desktopAPI } from './ipcBridge';
import './styles.css';

// Typewriter Text
function TypewriterText({ text, speed = 14 }) {
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
    { type: 'mint' }, { type: 'mint' }, { type: 'mint' }, { type: 'mint' },
    { type: 'mint' }, { type: 'mint' }, { type: 'mint' }, { type: 'cyan' },
    { type: 'cyan' }, { type: 'cyan' }, { type: 'cyan' }, { type: 'pink' },
    { type: 'pink' }, { type: 'pink' }, { type: 'pink' }, { type: 'pink' }
  ];

  return (
    <div className="flex items-end gap-1 h-5 w-full">
      {bars.map((bar, i) => {
        const activeProbability = isTalking || isSpeaking ? 0.9 : isThinking ? 0.6 : 0.3;
        const colorClass =
          bar.type === 'mint'
            ? 'bg-emerald-300 shadow-[0_0_8px_#6ee7b7]'
            : bar.type === 'cyan'
            ? 'bg-cyan-300 shadow-[0_0_8px_#67e8f9]'
            : 'bg-rose-400 shadow-[0_0_8px_#fb7185]';

        return (
          <motion.div
            key={i}
            className={`flex-1 rounded-sm ${colorClass}`}
            animate={{
              height: ['20%', `${Math.floor(Math.random() * 80 + 20)}%`, '30%'],
              opacity: [0.3, Math.random() < activeProbability ? 1 : 0.25, 0.4]
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

// Content Category Classifier
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
  // viewMode: 'wheel' (Mandala Circular Wheel) | 'dashboard' (Spatial Extended HUD)
  const [viewMode, setViewMode] = useState('wheel');
  const [companionName, setCompanionName] = useState('AURA');
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('AURA');
  const [isMemoryOpen, setIsMemoryOpen] = useState(false);
  const [memoryList, setMemoryList] = useState([]);
  const [hoveredNode, setHoveredNode] = useState(null);
  const [activeActionLabel, setActiveActionLabel] = useState('');

  // Clipboard State
  const [clipboardText, setClipboardText] = useState('');
  const [clipboardCategory, setClipboardCategory] = useState('text');
  const [copiedResponse, setCopiedResponse] = useState(false);

  // Audio / Activity States
  const [isTalking, setIsTalking] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [isSpeakingTTS, setIsSpeakingTTS] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [partialText, setPartialText] = useState('');

  // Neural Feed & Dialog
  const [messages, setMessages] = useState([
    {
      id: 1,
      sender: 'companion',
      text: 'AURA MINT GLASS HUD READY: Holographic Halo Wheel online. Press Ctrl+Shift+A anywhere.'
    }
  ]);
  const [inputText, setInputText] = useState('');
  const [coreStatusMessage, setCoreStatusMessage] = useState('SYSTEM STEADY');
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

    // Listen for summon events (Ctrl+Shift+A / Ctrl+Shift+Space)
    const unSummon = desktopAPI.onSummonCursor(() => {
      setViewMode('wheel');
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
        if (viewMode === 'dashboard') {
          handleCollapseToWheel();
        } else {
          desktopAPI.anchorToCursor(620, 580);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      if (typeof unSummon === 'function') unSummon();
      if (typeof unState === 'function') unState();
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [viewMode]);

  // Female voice setup
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

  // Auto-scroll chat in dashboard
  useEffect(() => {
    if (viewMode === 'dashboard' && !isMemoryOpen) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isThinking, viewMode, partialText, isMemoryOpen]);

  const handleExpandToDashboard = async () => {
    await desktopAPI.resizeWindow(1180, 480);
    setViewMode('dashboard');
  };

  const handleCollapseToWheel = async () => {
    await desktopAPI.anchorToCursor(620, 580);
    setViewMode('wheel');
    setIsMemoryOpen(false);
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

  const handleSend = async (customPrompt, actionName = 'TASK') => {
    const prompt = customPrompt || inputText;
    if (!prompt.trim() || isThinking) return;

    setActiveActionLabel(actionName);
    setCoreStatusMessage(`PROCESSING ${actionName.toUpperCase()}`);

    const userMsg = { id: Date.now(), sender: 'user', text: prompt };
    setMessages((prev) => [...prev, userMsg]);
    if (!customPrompt) setInputText('');
    setPartialText('');
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
        const reply = data.response || 'Operation completed successfully.';
        setMessages((prev) => [...prev, { id: Date.now() + 1, sender: 'companion', text: reply }]);
        setStreamResponse(reply);
        setCoreStatusMessage('READY');
        speakText(reply);
      } else {
        throw new Error('API Error');
      }
    } catch {
      setIsThinking(false);
      setIsTalking(false);
      setIsSpeakingTTS(false);
      const fallback = `[Standby] ${companionName} offline core active.`;
      setMessages((prev) => [...prev, { id: Date.now() + 2, sender: 'companion', text: fallback }]);
      setStreamResponse(fallback);
      setCoreStatusMessage('OFFLINE ACTIVE');
      speakText('Local server running.');
    }
  };

  // Quick Action Execution
  const handleNodeAction = (actionId) => {
    if (actionId === 'voice') {
      toggleVoice();
      return;
    }
    if (actionId === 'options') {
      handleExpandToDashboard();
      return;
    }
    if (actionId === 'memory') {
      handleExpandToDashboard();
      setIsMemoryOpen(true);
      loadMemory();
      return;
    }

    if (!clipboardText.trim()) {
      if (actionId === 'telemetry') {
        handleSend('Show current CPU, RAM and hardware stats.', 'TELEMETRY');
      } else {
        handleSend('System status diagnostic report.', 'STATUS');
      }
      return;
    }

    let prompt = '';
    let name = 'ACTION';
    if (actionId === 'refactor') {
      prompt = `Find bugs, optimize performance, and provide the clean refactored code:\n\n${clipboardText}`;
      name = 'REFACTOR';
    } else if (actionId === 'explain') {
      prompt = `Explain this code or text succinctly in 2-3 clear sentences:\n\n${clipboardText}`;
      name = 'EXPLAIN';
    } else if (actionId === 'summarize') {
      prompt = `Summarize this text in 3 concise bullet points:\n\n${clipboardText}`;
      name = 'SUMMARIZE';
    } else if (actionId === 'format_json') {
      prompt = `Format, validate, and structure this JSON data:\n\n${clipboardText}`;
      name = 'FORMAT JSON';
    } else if (actionId === 'telemetry') {
      prompt = `Show current CPU, RAM and hardware telemetry status.`;
      name = 'TELEMETRY';
    } else if (actionId === 'chat') {
      handleExpandToDashboard();
      return;
    }

    if (prompt) {
      handleSend(prompt, name);
    }
  };

  // Raw 16kHz PCM Audio Streaming
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
      setCoreStatusMessage('READY');
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
            handleSend(data.text, 'VOICE QUERY');
          } else if (data.event === 'partial' && data.text) {
            setPartialText(data.text);
          }
        } catch (e) {
          console.warn('WS message error:', e);
        }
      };

      setIsTalking(true);
      setCoreStatusMessage('LISTENING...');
    } catch (err) {
      console.warn('Direct mic fallback:', err);
      handleSend('Give me a diagnostic status update.', 'STATUS');
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

  // 8 Radially positioned nodes matching reference image geometry
  // Left nodes (x < 0, text extends left), Right nodes (x > 0, text extends right)
  const radialNodes = [
    // Top-Left: OPTIONS
    {
      id: 'options',
      label: 'OPTIONS',
      side: 'left',
      icon: Settings,
      angle: 150, // degrees
      x: -190,
      y: -120,
      ringColor: '#a855f7', // purple
      ringClass: 'stroke-purple-400',
      action: () => handleNodeAction('options')
    },
    // Mid-Top-Left: EXPLAIN
    {
      id: 'explain',
      label: 'EXPLAIN',
      side: 'left',
      icon: Activity,
      angle: 175,
      x: -215,
      y: -25,
      ringColor: '#818cf8', // indigo
      ringClass: 'stroke-indigo-400',
      action: () => handleNodeAction('explain')
    },
    // Mid-Bottom-Left: MEMORY
    {
      id: 'memory',
      label: 'MEMORY',
      side: 'left',
      icon: Users,
      angle: 205,
      x: -215,
      y: 75,
      ringColor: '#a855f7', // purple
      ringClass: 'stroke-purple-400',
      action: () => handleNodeAction('memory')
    },
    // Bottom-Left: SENSORS / TELEMETRY
    {
      id: 'telemetry',
      label: 'SENSORS',
      side: 'left',
      icon: Heart,
      angle: 235,
      x: -185,
      y: 165,
      ringColor: '#f43f5e', // rose/pink
      ringClass: 'stroke-rose-400',
      action: () => handleNodeAction('telemetry')
    },

    // Top-Right: FORMAT JSON / CONFIG
    {
      id: 'format_json',
      label: 'SCHEMA',
      side: 'right',
      icon: Sliders,
      angle: 30,
      x: 190,
      y: -120,
      ringColor: '#a855f7', // purple
      ringClass: 'stroke-purple-400',
      action: () => handleNodeAction('format_json')
    },
    // Mid-Top-Right: REFACTOR / CODE FIX
    {
      id: 'refactor',
      label: 'REFACTOR',
      side: 'right',
      icon: MessageSquare,
      angle: 5,
      x: 215,
      y: -25,
      ringColor: '#ec4899', // pink/magenta
      ringClass: 'stroke-pink-400',
      action: () => handleNodeAction('refactor')
    },
    // Mid-Bottom-Right: VOICE CHAT
    {
      id: 'voice',
      label: isTalking ? 'LISTENING' : 'VOICE CHAT',
      side: 'right',
      icon: Mic,
      angle: 335,
      x: 215,
      y: 75,
      ringColor: '#d946ef', // fuchsia
      ringClass: 'stroke-fuchsia-400',
      action: () => handleNodeAction('voice')
    },
    // Bottom-Right: SUMMARIZE
    {
      id: 'summarize',
      label: 'SUMMARIZE',
      side: 'right',
      icon: Layers,
      angle: 305,
      x: 185,
      y: 165,
      ringColor: '#fb923c', // amber/orange
      ringClass: 'stroke-amber-400',
      action: () => handleNodeAction('summarize')
    }
  ];

  // Calculate pointer arrow angle towards hovered node
  const pointerAngle = hoveredNode ? hoveredNode.angle : 30; // default 30 deg towards cyan indicator

  return (
    <div className="w-full h-full flex items-center justify-center bg-transparent select-none p-2 overflow-hidden font-sans">
      <AnimatePresence mode="wait">
        {viewMode === 'wheel' ? (
          /* ========================================================================= */
          /* CIRCULAR MANDALA HALO WHEEL (MATCHING EXACT REFERENCE IMAGE DESIGN)       */
          /* ========================================================================= */
          <motion.div
            key="mint-mandala-wheel"
            layoutId="aura-unified-hud"
            initial={{ opacity: 0, scale: 0.88 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.88 }}
            transition={{ type: 'spring', stiffness: 360, damping: 28 }}
            className="relative w-[600px] h-[540px] flex items-center justify-center"
          >
            {/* Ambient Background Radial Gradient & Star Bloom */}
            <div className="absolute w-[460px] h-[460px] rounded-full bg-gradient-to-tr from-cyan-500/10 via-teal-400/15 to-transparent blur-3xl pointer-events-none" />

            {/* SVG Connecting Ray Lines to Outer Nodes */}
            <svg viewBox="0 0 600 540" className="absolute inset-0 w-full h-full pointer-events-none z-0">
              <defs>
                <linearGradient id="rayGlow" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="rgba(45, 212, 191, 0.4)" />
                  <stop offset="100%" stopColor="rgba(168, 85, 247, 0.2)" />
                </linearGradient>
                <linearGradient id="coreMintGlow" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#2dd4bf" stopOpacity="0.8" />
                  <stop offset="50%" stopColor="#38bdf8" stopOpacity="0.6" />
                  <stop offset="100%" stopColor="#0f172a" stopOpacity="0.95" />
                </linearGradient>
              </defs>

              {/* Central Outer Decorative Diamond / Mandala Ticks Ring */}
              <circle
                cx="300"
                cy="260"
                r="165"
                fill="none"
                stroke="rgba(204, 251, 241, 0.25)"
                strokeWidth="1.2"
                strokeDasharray="2 6"
                className="animate-spin-slow"
              />
              <circle
                cx="300"
                cy="260"
                r="148"
                fill="none"
                stroke="rgba(56, 189, 248, 0.3)"
                strokeWidth="1.5"
                strokeDasharray="6 8"
                className="animate-spin-reverse"
              />

              {/* Radial Leader Rays from Center to 8 Nodes */}
              {radialNodes.map((node) => (
                <line
                  key={`ray-${node.id}`}
                  x1="300"
                  y1="260"
                  x2={300 + node.x}
                  y2={260 + node.y}
                  stroke={hoveredNode?.id === node.id ? 'rgba(45, 212, 191, 0.6)' : 'rgba(204, 251, 241, 0.12)'}
                  strokeWidth={hoveredNode?.id === node.id ? '1.5' : '1'}
                  strokeDasharray={hoveredNode?.id === node.id ? 'none' : '3 4'}
                  className="transition-all duration-300"
                />
              ))}
            </svg>

            {/* ===================================================================== */}
            {/* CENTRAL ANIMATED MANDALA REACTOR CORE (NOT A RECTANGULAR BOX)         */}
            {/* ===================================================================== */}
            <div className="relative w-[240px] h-[240px] flex items-center justify-center z-10">
              {/* Outer Luminous Glowing Turquoise / Mint Halo Sphere */}
              <motion.div
                animate={{
                  scale: isTalking || isSpeakingTTS ? [1, 1.05, 1] : isThinking ? [1, 1.03, 1] : [1, 1.015, 1],
                  filter:
                    isTalking || isSpeakingTTS
                      ? 'drop-shadow(0 0 40px rgba(45,212,191,0.9)) drop-shadow(0 0 70px rgba(56,189,248,0.7))'
                      : isThinking
                      ? 'drop-shadow(0 0 30px rgba(251,191,36,0.8))'
                      : 'drop-shadow(0 0 25px rgba(45,212,191,0.5)) drop-shadow(0 0 50px rgba(56,189,248,0.3))'
                }}
                transition={{
                  duration: isTalking ? 1.2 : 3,
                  repeat: Infinity,
                  ease: 'easeInOut'
                }}
                className="absolute inset-0 rounded-full bg-gradient-to-br from-[#2dd4bf] via-[#0284c7] to-[#0f172a] p-[4px] shadow-2xl"
              >
                {/* Inner Dark Frosted Concentric Disc */}
                <div className="w-full h-full rounded-full bg-[#0a1118]/90 backdrop-blur-2xl flex items-center justify-center relative overflow-hidden border border-teal-200/30">
                  {/* Concentric Circuit / Labyrinth Texture SVG */}
                  <svg viewBox="0 0 240 240" className="absolute inset-0 w-full h-full opacity-40">
                    <circle cx="120" cy="120" r="95" fill="none" stroke="rgba(204,251,241,0.3)" strokeWidth="1" strokeDasharray="3 3" />
                    <circle cx="120" cy="120" r="80" fill="none" stroke="rgba(56,189,248,0.25)" strokeWidth="1" strokeDasharray="8 6" />
                    <circle cx="120" cy="120" r="65" fill="none" stroke="rgba(45,212,191,0.35)" strokeWidth="1.2" strokeDasharray="4 4" />
                    <circle cx="120" cy="120" r="50" fill="none" stroke="rgba(204,251,241,0.4)" strokeWidth="1" />
                  </svg>

                  {/* Concentric Geometric Mandala Diamonds */}
                  <div className="absolute inset-4 rounded-full border border-teal-300/20 animate-spin-slow opacity-60" />
                  <div className="absolute inset-8 rounded-full border border-cyan-400/25 animate-spin-reverse opacity-70" />

                  {/* Center Inner Compass Reticle with Cyan Pointer Needle */}
                  <motion.div
                    animate={{ rotate: pointerAngle }}
                    transition={{ type: 'spring', stiffness: 220, damping: 20 }}
                    className="relative w-[76px] h-[76px] rounded-full border-2 border-teal-300/60 shadow-[0_0_15px_#2dd4bf] flex items-center justify-center bg-[#0d1720]/80 z-20"
                  >
                    {/* Glowing Cyan Indicator Pointer Arrow */}
                    <div className="absolute -top-3 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-b-[12px] border-b-cyan-300 filter drop-shadow-[0_0_6px_#38bdf8]" />
                    {/* Inner Reactor Center Dot */}
                    <div className="w-3.5 h-3.5 rounded-full bg-gradient-to-tr from-teal-300 to-cyan-400 shadow-[0_0_10px_#2dd4bf] animate-pulse" />
                  </motion.div>

                  {/* Real-time Status Overlay Inside the Core */}
                  <div className="absolute bottom-4 inset-x-0 text-center font-mono text-[9px] font-bold tracking-widest text-teal-200/90 z-20 uppercase">
                    {isThinking ? 'PROCESSING...' : isTalking ? 'LISTENING...' : activeActionLabel || companionName}
                  </div>
                </div>
              </motion.div>
            </div>

            {/* ===================================================================== */}
            {/* 8 RADIAL ORBITING PODS (MATCHING REFERENCE IMAGE ICONS & LABELS)       */}
            {/* ===================================================================== */}
            {radialNodes.map((node) => {
              const Icon = node.icon;
              const isHovered = hoveredNode?.id === node.id;

              return (
                <div
                  key={node.id}
                  style={{
                    position: 'absolute',
                    left: `calc(50% + ${node.x}px - 26px)`,
                    top: `calc(48% + ${node.y}px - 26px)`
                  }}
                  className="flex items-center z-20"
                >
                  {/* If Left Node: Label is on the Left, then Horizontal Leader Line, then Icon Pod */}
                  {node.side === 'left' && (
                    <motion.div
                      animate={{ opacity: isHovered ? 1 : 0.85, x: isHovered ? -3 : 0 }}
                      className="flex items-center gap-2 mr-2 cursor-pointer"
                      onClick={node.action}
                      onMouseEnter={() => setHoveredNode(node)}
                      onMouseLeave={() => setHoveredNode(null)}
                    >
                      <span className="font-mono text-[11px] font-extrabold tracking-widest text-slate-100 uppercase hover:text-teal-300 transition-colors">
                        {node.label}
                      </span>
                      <div className="w-4 h-[1px] bg-gradient-to-r from-transparent to-teal-400/60" />
                    </motion.div>
                  )}

                  {/* Circular Layered Pod / Button */}
                  <motion.button
                    onClick={node.action}
                    onMouseEnter={() => setHoveredNode(node)}
                    onMouseLeave={() => setHoveredNode(null)}
                    whileHover={{ scale: 1.15 }}
                    whileTap={{ scale: 0.92 }}
                    className="relative w-[52px] h-[52px] rounded-full flex items-center justify-center cursor-pointer transition-all focus:outline-none"
                    title={node.label}
                  >
                    {/* Outer Segmented Ring Gauge SVG */}
                    <svg viewBox="0 0 52 52" className="absolute inset-0 w-full h-full pointer-events-none">
                      <circle
                        cx="26"
                        cy="26"
                        r="23"
                        fill="none"
                        stroke="rgba(255, 255, 255, 0.15)"
                        strokeWidth="1.5"
                      />
                      <circle
                        cx="26"
                        cy="26"
                        r="23"
                        fill="none"
                        stroke={node.ringColor}
                        strokeWidth="2.2"
                        strokeDasharray={isHovered ? '40 10' : '15 25'}
                        strokeLinecap="round"
                        className="transition-all duration-300 filter drop-shadow-[0_0_6px_currentColor]"
                      />
                    </svg>

                    {/* Inner Frosted Glass Disc */}
                    <div className="w-[38px] h-[38px] rounded-full bg-[#0e1620]/90 border border-teal-200/30 backdrop-blur-xl shadow-lg flex items-center justify-center text-slate-100 group-hover:border-teal-300">
                      <Icon
                        className="w-4 h-4 transition-transform duration-200"
                        style={{ color: isHovered ? '#2dd4bf' : '#e2e8f0' }}
                      />
                    </div>
                  </motion.button>

                  {/* If Right Node: Icon Pod first, then Horizontal Leader Line, then Label on the Right */}
                  {node.side === 'right' && (
                    <motion.div
                      animate={{ opacity: isHovered ? 1 : 0.85, x: isHovered ? 3 : 0 }}
                      className="flex items-center gap-2 ml-2 cursor-pointer"
                      onClick={node.action}
                      onMouseEnter={() => setHoveredNode(node)}
                      onMouseLeave={() => setHoveredNode(null)}
                    >
                      <div className="w-4 h-[1px] bg-gradient-to-l from-transparent to-teal-400/60" />
                      <span className="font-mono text-[11px] font-extrabold tracking-widest text-slate-100 uppercase hover:text-teal-300 transition-colors">
                        {node.label}
                      </span>
                    </motion.div>
                  )}
                </div>
              );
            })}

            {/* Bottom Minimalist Close Button (✕ CLOSE) */}
            <div className="absolute bottom-3 inset-x-0 flex justify-center z-30">
              <button
                onClick={() => desktopAPI.anchorToCursor(620, 580)}
                className="flex items-center gap-1.5 font-mono text-[11px] font-bold tracking-widest text-teal-300 hover:text-white bg-[#0e1620]/80 hover:bg-rose-500/20 border border-teal-500/20 hover:border-rose-400/50 px-4 py-1.5 rounded-full backdrop-blur-xl transition-all shadow-md cursor-pointer"
              >
                <X className="w-3.5 h-3.5 text-teal-400" />
                <span>CLOSE</span>
              </button>
            </div>

            {/* Top Right Quick Expand to Tactical View Button */}
            <div className="absolute top-2 right-4 z-30">
              <button
                onClick={handleExpandToDashboard}
                className="w-8 h-8 rounded-full bg-[#0e1620]/80 hover:bg-teal-500/20 border border-teal-500/30 text-teal-300 flex items-center justify-center transition-all cursor-pointer shadow-lg"
                title="Expand to Full Tactical Dashboard (Ctrl+Shift+Y)"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </motion.div>
        ) : (
          /* ========================================================================= */
          /* EXTENDED SPATIAL TACTICAL HUD (MATCHING MINT-WHITE GLASS MANDALA THEME)   */
          /* ========================================================================= */
          <motion.div
            key="extended-tactical-hud"
            layoutId="aura-unified-hud"
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.92 }}
            transition={{ type: 'spring', stiffness: 360, damping: 28 }}
            className="w-[1150px] h-[450px] glass-panel rounded-3xl shadow-2xl overflow-hidden text-slate-100 flex flex-col justify-between relative border border-teal-200/25"
          >
            {/* Header */}
            <header className="h-[46px] px-6 py-2 flex items-center justify-between border-b border-teal-500/15 bg-[#0a1118]/60 backdrop-blur-xl flex-shrink-0">
              <div className="flex items-center gap-3">
                {isEditingName ? (
                  <div className="flex items-center gap-1.5 bg-[#0d1117] border border-teal-400 px-2.5 py-0.5 rounded-lg">
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
                    <div className="w-2.5 h-2.5 rounded-full bg-teal-400 shadow-[0_0_8px_#2dd4bf] animate-ping" />
                    <span className="text-teal-300 font-mono font-extrabold tracking-widest text-sm uppercase">
                      {companionName} MANDALA HUD
                    </span>
                    <Edit3 className="w-3.5 h-3.5 text-slate-400 group-hover:text-teal-300 transition-colors" />
                  </div>
                )}

                <span className="bg-teal-500/10 border border-teal-400/30 text-teal-200 text-[10px] px-2.5 py-0.5 rounded-full font-mono font-semibold tracking-wide">
                  MINT GLASS CORE
                </span>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    const next = !isMemoryOpen;
                    setIsMemoryOpen(next);
                    if (next) loadMemory();
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-lg font-mono text-xs border transition-all cursor-pointer ${
                    isMemoryOpen
                      ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200 shadow-[0_0_12px_rgba(56,189,248,0.35)]'
                      : 'bg-[#0e1620]/80 border-teal-500/20 text-slate-300 hover:text-teal-200 hover:border-teal-400/40'
                  }`}
                  title="View / Inspect Working Memory"
                >
                  <Brain className="w-3.5 h-3.5" />
                  <span>MEMORY ({memoryList.length})</span>
                </button>

                <span className="bg-amber-400/10 border border-amber-400/30 text-amber-300 text-xs px-3 py-1 rounded-lg font-mono font-semibold tracking-wide">
                  {isThinking ? 'PROCESSING' : isTalking ? 'STREAMING 16KHZ' : isSpeakingTTS ? 'TRANSMITTING' : 'STEADY'}
                </span>

                <button
                  onClick={handleCollapseToWheel}
                  className="w-7 h-7 rounded-full bg-[#0e1620]/80 hover:bg-teal-500/80 hover:text-white text-slate-300 border border-teal-500/20 flex items-center justify-center transition-all cursor-pointer shadow-md"
                  title="Collapse to Mandala Wheel (Esc)"
                >
                  <Minimize2 className="w-4 h-4" />
                </button>
              </div>
            </header>

            {/* Main 3-Column Layout */}
            <main className="grid grid-cols-12 gap-5 p-5 flex-1 min-h-0 relative bg-hud-grid">
              {/* Working Memory Inspector Drawer */}
              <AnimatePresence>
                {isMemoryOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="absolute inset-x-5 top-5 bottom-5 bg-[#0a1118]/98 border border-cyan-400/30 rounded-2xl p-5 z-20 flex flex-col justify-between shadow-2xl backdrop-blur-2xl font-mono"
                  >
                    <div className="flex items-center justify-between border-b border-teal-500/20 pb-3 flex-shrink-0">
                      <div className="flex items-center gap-2 text-cyan-300 font-bold text-sm">
                        <Brain className="w-4 h-4" /> {companionName}'S ACTIVE WORKING MEMORY
                        <span className="text-xs text-slate-400 font-normal">({memoryList.length} turns)</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={handleClearMemory}
                          className="flex items-center gap-1.5 text-xs text-rose-300 hover:text-rose-200 border border-rose-500/30 px-3 py-1 rounded-lg cursor-pointer transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" /> Clear Buffer
                        </button>
                        <button onClick={() => setIsMemoryOpen(false)} className="text-slate-400 hover:text-slate-200">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <div className="flex-1 overflow-y-auto my-3 pr-2 flex flex-col gap-2.5 text-xs">
                      {memoryList.length === 0 ? (
                        <div className="text-slate-500 text-center py-10">Memory buffer is clear.</div>
                      ) : (
                        memoryList.map((item, idx) => (
                          <div
                            key={idx}
                            className={`p-3 rounded-xl border ${
                              item.role === 'user'
                                ? 'bg-[#131d27] border-amber-500/30 text-amber-200'
                                : 'bg-[#0f1722] border-cyan-500/30 text-slate-200'
                            }`}
                          >
                            <div className="font-bold text-[10px] text-slate-400 mb-1">
                              {item.role === 'user' ? '► USER' : `❖ ${companionName.toUpperCase()}`}
                            </div>
                            <div className="whitespace-pre-wrap leading-relaxed">{item.content}</div>
                          </div>
                        ))
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Col 1: Holographic Reactor Orb & Hardware Telemetry */}
              <section className="col-span-3 flex flex-col gap-4">
                {/* Mini Mandala Core Orb */}
                <div className="bg-[#0e1620]/80 border border-teal-500/20 rounded-2xl p-4 flex items-center gap-4">
                  <div className="relative w-16 h-16 flex-shrink-0 flex items-center justify-center">
                    <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-teal-400 to-cyan-500 blur-md opacity-50" />
                    <div className="relative w-14 h-14 rounded-full bg-[#0a1118] border border-teal-300/40 flex items-center justify-center">
                      <div className="w-4 h-4 rounded-full bg-teal-400 shadow-[0_0_10px_#2dd4bf] animate-ping" />
                    </div>
                  </div>
                  <div className="flex flex-col font-mono">
                    <span className="text-xs font-bold text-teal-200 tracking-wider">SPECTRUM 51 dB</span>
                    <span className="text-[10px] text-emerald-400 font-bold mt-0.5">MANDALA ONLINE</span>
                    <div className="mt-2 w-full">
                      <AnimatedEQMeter isTalking={isTalking} isThinking={isThinking} isSpeaking={isSpeakingTTS} />
                    </div>
                  </div>
                </div>

                {/* Cybernetic Hardware Telemetry Rings */}
                <div className="bg-[#0e1620]/80 border border-teal-500/20 rounded-2xl p-4 flex items-center gap-4 flex-1">
                  <div className="relative w-16 h-16 flex-shrink-0 flex items-center justify-center">
                    <svg viewBox="0 0 80 80" className="w-full h-full transform -rotate-90">
                      <circle cx="40" cy="40" r="32" fill="none" stroke="#1e293b" strokeWidth="6" />
                      <circle
                        cx="40" cy="40" r="32" fill="none" stroke="#38bdf8" strokeWidth="6"
                        strokeDasharray="201" strokeDashoffset={201 - 201 * 0.68}
                        strokeLinecap="round" className="shadow-[0_0_10px_#38bdf8]"
                      />
                      <circle cx="40" cy="40" r="22" fill="none" stroke="#1e293b" strokeWidth="6" />
                      <circle
                        cx="40" cy="40" r="22" fill="none" stroke="#d946ef" strokeWidth="6"
                        strokeDasharray="138" strokeDashoffset={138 - 138 * 0.74}
                        strokeLinecap="round" className="shadow-[0_0_10px_#d946ef]"
                      />
                    </svg>
                  </div>
                  <div className="flex flex-col gap-2 font-mono">
                    <div className="text-[11px] font-bold text-slate-100 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_6px_#38bdf8]" />
                      1.32 <small className="text-[9px] text-slate-400">OF 2.0 GB</small>
                    </div>
                    <div className="text-[11px] font-bold text-slate-100 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-fuchsia-400 shadow-[0_0_6px_#d946ef]" />
                      46 <small className="text-[9px] text-slate-400">TOK/SEC</small>
                    </div>
                  </div>
                </div>
              </section>

              {/* Col 2: Action Controls Matrix */}
              <section className="col-span-3 grid grid-cols-2 gap-3">
                <button
                  onClick={toggleVoice}
                  className={`border rounded-2xl p-3 flex flex-col items-center justify-center gap-2 cursor-pointer transition-all shadow-md ${
                    isTalking
                      ? 'border-pink-400 bg-pink-500/20 text-pink-300 shadow-[0_0_15px_rgba(244,114,182,0.4)] animate-pulse'
                      : 'bg-[#0e1620]/80 border-teal-500/20 hover:border-teal-300/50 hover:bg-[#131e2b] text-slate-200'
                  }`}
                  title={isTalking ? 'Click to stop voice streaming' : 'Click to stream live 16kHz PCM'}
                >
                  <Mic className={`w-5 h-5 ${isTalking ? 'text-pink-400 scale-110' : 'text-teal-300'}`} />
                  <span className="font-mono font-bold text-[11px] text-center">
                    {isTalking ? 'STREAMING' : 'RECON VOICE'}
                  </span>
                </button>

                <button
                  onClick={() => handleSend(null, 'ENGAGE')}
                  className="bg-[#0e1620]/80 border border-teal-500/20 hover:border-amber-400/50 hover:bg-[#131e2b] text-slate-200 rounded-2xl p-3 flex flex-col items-center justify-center gap-2 cursor-pointer transition-all shadow-md active:scale-95 group"
                >
                  <Zap className="w-5 h-5 text-amber-300 group-hover:scale-110 transition-transform" />
                  <span className="font-mono font-bold text-[11px] text-center">ENGAGE</span>
                </button>

                <button
                  onClick={() => handleSend('Get system telemetry and status.', 'TELEMETRY')}
                  className="bg-[#0e1620]/80 border border-teal-500/20 hover:border-teal-300/50 hover:bg-[#131e2b] text-slate-200 rounded-2xl p-3 flex flex-col items-center justify-center gap-2 cursor-pointer transition-all shadow-md active:scale-95 group"
                >
                  <RotateCw className="w-5 h-5 text-teal-300 group-hover:rotate-45 transition-transform" />
                  <span className="font-mono font-bold text-[11px] text-center">TELEMETRY</span>
                </button>

                <button
                  onClick={() => setIsMuted(!isMuted)}
                  className={`border rounded-2xl p-3 flex flex-col items-center justify-center gap-2 cursor-pointer transition-all shadow-md ${
                    isMuted
                      ? 'border-rose-400 bg-rose-500/20 text-rose-300 shadow-[0_0_15px_rgba(251,113,133,0.4)]'
                      : 'bg-[#0e1620]/80 border-teal-500/20 hover:border-teal-300/50 hover:bg-[#131e2b] text-slate-200'
                  }`}
                >
                  <VolumeX className="w-5 h-5 text-rose-400" />
                  <span className="font-mono font-bold text-[11px] text-center">
                    {isMuted ? 'MUTED' : 'MUTE'}
                  </span>
                </button>
              </section>

              {/* Col 3: Holographic Neural Stream Feed */}
              <section className="col-span-6 bg-[#0a1118]/80 border border-teal-500/20 rounded-2xl p-4 flex flex-col justify-between flex-1 min-h-0 relative overflow-hidden backdrop-blur-xl">
                <div className="flex items-center justify-between border-b border-teal-500/15 pb-2.5 flex-shrink-0">
                  <span className="font-mono text-xs font-bold text-teal-300 tracking-wider flex items-center gap-1.5">
                    <Terminal className="w-4 h-4" /> RIGEL NEURAL STREAM
                  </span>
                  <span className="font-mono text-[10px] text-slate-400">ø13_49 // MANDALA</span>
                </div>

                <div className="flex-1 overflow-y-auto py-3 my-1 flex flex-col gap-2.5 font-mono text-xs pr-1">
                  {messages.map((m, idx) => (
                    <div
                      key={m.id}
                      className={`p-3 rounded-xl border leading-relaxed ${
                        m.sender === 'user'
                          ? 'bg-[#151f2a] border-amber-400/30 text-amber-100 self-end max-w-[85%]'
                          : 'bg-[#0b131c] border-teal-400/30 text-slate-200 self-start max-w-[95%]'
                      }`}
                    >
                      <div className="text-[10px] font-bold mb-1 flex items-center gap-1">
                        {m.sender === 'user' ? (
                          <span className="text-amber-400">► USER</span>
                        ) : (
                          <span className="text-teal-300">❖ {companionName.toUpperCase()}</span>
                        )}
                      </div>
                      {idx === messages.length - 1 && m.sender === 'companion' ? (
                        <TypewriterText text={m.text} speed={14} />
                      ) : (
                        <span className="whitespace-pre-wrap">{m.text}</span>
                      )}
                    </div>
                  ))}
                  {isThinking && (
                    <div className="p-3 rounded-xl border bg-[#0b131c] border-teal-400/30 text-teal-200 self-start">
                      <div className="text-[10px] font-bold mb-1 text-teal-300">❖ {companionName.toUpperCase()}</div>
                      <span className="animate-pulse">⚡ Invoking local agent & sensor tools...</span>
                    </div>
                  )}
                  {partialText && isTalking && (
                    <div className="p-2.5 rounded-xl border border-pink-400/30 bg-pink-500/10 text-pink-200 text-xs">
                      <span className="font-bold">🎙️ Stream:</span> {partialText}
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSend(null, 'PROMPT');
                  }}
                  className="border-t border-teal-500/20 bg-transparent text-xs font-mono text-slate-100 flex items-center gap-2 pt-2.5 flex-shrink-0"
                >
                  <span className="text-teal-300 font-bold text-sm">►</span>
                  <input
                    type="text"
                    className="w-full bg-transparent border-none outline-none text-slate-100 placeholder:text-slate-500 font-mono text-xs"
                    placeholder={`Ask ${companionName} or request telemetry...`}
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                  />
                  <button
                    type="submit"
                    className="text-teal-300 hover:text-white font-bold text-xs px-3 py-1 bg-teal-500/20 hover:bg-teal-500/40 rounded-lg transition-colors cursor-pointer"
                  >
                    SEND
                  </button>
                </form>
              </section>
            </main>

            {/* Footer */}
            <footer className="h-[32px] px-6 flex items-center justify-between border-t border-teal-500/15 bg-[#0a1118]/40 text-[11px] font-mono text-slate-400 opacity-80 flex-shrink-0">
              <div>CYCLES <span className="text-teal-300 font-semibold">13,607</span></div>
              <div>SPECTRUM <span className="text-teal-300 font-semibold">136 AQI</span></div>
              <div>STATUS <span className="text-teal-300 font-semibold">MANDALA ACTIVE</span></div>
            </footer>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
