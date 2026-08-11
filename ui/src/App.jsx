import React, { useState, useEffect, useRef } from 'react';
import './styles.css';

export default function App() {
  const [islandState, setIslandState] = useState('compact'); // 'compact' | 'expanded'
  const [compactVariant, setCompactVariant] = useState('idle'); // 'idle' | 'listening' | 'thinking' | 'speaking' | 'error'
  const [isBackendOnline, setIsBackendOnline] = useState(true);
  const [isSpeakingTTS, setIsSpeakingTTS] = useState(false);

  const [messages, setMessages] = useState([
    {
      id: 1,
      sender: 'companion',
      text: 'AI COMPANION ONLINE: Neural core active. Voice & telemetry systems ready.',
    },
  ]);

  const [inputText, setInputText] = useState('');
  const [isTalking, setIsTalking] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  // Dynamic Live Metrics (matching reference widgets)
  const [cycles, setCycles] = useState(13415);
  const [audioDb, setAudioDb] = useState(45);
  const [ramUsage, setRamUsage] = useState(1.32);
  const [tokensPerSec, setTokensPerSec] = useState(46);

  const chatEndRef = useRef(null);
  const recognitionRef = useRef(null);

  // IPC listener for Electron window state
  useEffect(() => {
    if (window.electronAPI?.getWindowState) {
      window.electronAPI.getWindowState().then((state) => {
        setIslandState(state || 'compact');
      });
    }

    if (window.electronAPI?.onWindowStateChanged) {
      const unsubscribe = window.electronAPI.onWindowStateChanged((state) => {
        setIslandState(state || 'compact');
      });
      return () => {
        if (typeof unsubscribe === 'function') unsubscribe();
      };
    }
  }, []);

  const setExpandedState = (expanded) => {
    const newState = expanded ? 'expanded' : 'compact';
    setIslandState(newState);
    if (window.electronAPI?.setWindowState) {
      window.electronAPI.setWindowState(newState);
    }
  };

  // Derive compact pill variant from activity state
  useEffect(() => {
    if (!isBackendOnline) {
      setCompactVariant('error');
    } else if (isTalking) {
      setCompactVariant('listening');
    } else if (isThinking) {
      setCompactVariant('thinking');
    } else if (isSpeakingTTS) {
      setCompactVariant('speaking');
    } else {
      setCompactVariant('idle');
    }
  }, [isBackendOnline, isTalking, isThinking, isSpeakingTTS]);

  // Check backend health periodically
  useEffect(() => {
    const checkHealth = async () => {
      try {
        const res = await fetch('http://localhost:8000/api/health');
        if (res.ok) {
          setIsBackendOnline(true);
        } else {
          setIsBackendOnline(false);
        }
      } catch {
        setIsBackendOnline(false);
      }
    };

    checkHealth();
    const interval = setInterval(checkHealth, 5000);
    return () => clearInterval(interval);
  }, []);

  // Increment metrics for responsive audio spectrum and system activity
  useEffect(() => {
    const timer = setInterval(() => {
      setCycles((c) => c + 1);
      if (isTalking || isSpeakingTTS) {
        setAudioDb(85 + Math.floor(Math.random() * 20));
        setRamUsage(1.48);
        setTokensPerSec(58);
      } else if (isThinking) {
        setAudioDb(60 + Math.floor(Math.random() * 15));
        setRamUsage(1.65);
        setTokensPerSec(62);
      } else {
        setAudioDb(42 + Math.floor(Math.random() * 8));
        setRamUsage(1.32);
        setTokensPerSec(46);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [isTalking, isSpeakingTTS, isThinking]);

  // Auto-scroll chat when expanded
  useEffect(() => {
    if (islandState === 'expanded') {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isThinking, islandState]);

  // Spoken voice TTS
  const speakText = (text) => {
    if (isMuted) return;
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const clean = text.replace(/[\*\_#\`]/g, '');
      const utterance = new SpeechSynthesisUtterance(clean);
      utterance.rate = 1.0;
      utterance.pitch = 0.95;

      const voices = window.speechSynthesis.getVoices();
      const preferred = voices.find(
        (v) => v.lang.startsWith('en') && (v.name.includes('Natural') || v.name.includes('David') || v.name.includes('Zira'))
      );
      if (preferred) utterance.voice = preferred;

      utterance.onstart = () => setIsSpeakingTTS(true);
      utterance.onend = () => setIsSpeakingTTS(false);
      utterance.onerror = () => setIsSpeakingTTS(false);

      window.speechSynthesis.speak(utterance);
    }
  };

  // Handle LLM API Chat Call
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
        body: JSON.stringify({ prompt }),
      });

      if (res.ok) {
        const data = await res.json();
        const reply = data.response || 'System parameters optimal. Neural responses ready.';
        setIsThinking(false);

        setMessages((prev) => [...prev, { id: Date.now() + 1, sender: 'companion', text: reply }]);
        speakText(reply);
      } else {
        throw new Error('API Error');
      }
    } catch (e) {
      setIsThinking(false);
      setIsTalking(false);
      setIsSpeakingTTS(false);
      const fallback = '[ALERT] AI Backend connection error. Please verify server status.';
      setMessages((prev) => [...prev, { id: Date.now() + 2, sender: 'companion', text: fallback }]);
      speakText('Connection warning.');
    }
  };

  // Push to talk mic
  const toggleVoice = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      handleSend('Status update on neural AI system.');
      return;
    }

    if (isTalking) {
      window.speechSynthesis?.cancel();
      setIsTalking(false);
      setIsSpeakingTTS(false);
      return;
    }

    if (!recognitionRef.current) {
      const rec = new SpeechRecognition();
      rec.continuous = false;
      rec.interimResults = false;
      rec.lang = 'en-US';

      rec.onstart = () => setIsTalking(true);
      rec.onresult = (e) => {
        const text = e.results[0][0].transcript;
        setIsTalking(false);
        if (text) handleSend(text);
      };
      rec.onerror = () => setIsTalking(false);
      rec.onend = () => setIsTalking(false);
      recognitionRef.current = rec;
    }

    try {
      recognitionRef.current.start();
    } catch (e) {
      setIsTalking(false);
    }
  };

  // Render Compact State (Dynamic Island Pill)
  if (islandState === 'compact') {
    return (
      <div
        className={`island-pill ${compactVariant}`}
        onClick={() => setExpandedState(true)}
        title="Click to Expand AI Companion"
      >
        {compactVariant === 'listening' ? (
          <>
            <div className="pill-wave">
              <span className="bar" />
              <span className="bar" />
              <span className="bar" />
              <span className="bar" />
            </div>
            <span className="pill-text text-listening">Listening...</span>
          </>
        ) : compactVariant === 'thinking' ? (
          <>
            <div className="pill-spinner" />
            <span className="pill-text text-thinking">Thinking...</span>
          </>
        ) : compactVariant === 'speaking' ? (
          <>
            <div className="pill-eq">
              <span className="eq-bar" />
              <span className="eq-bar" />
              <span className="eq-bar" />
              <span className="eq-bar" />
            </div>
            <span className="pill-text text-speaking">Speaking...</span>
          </>
        ) : compactVariant === 'error' ? (
          <>
            <span className="pill-dot error-dot" />
            <span className="pill-text text-error">Offline</span>
          </>
        ) : (
          <>
            <span className="pill-dot idle-dot" />
            <span className="pill-text">AI Ready</span>
          </>
        )}
      </div>
    );
  }

  // Render Expanded State (Vertical OLED Dynamic Island AI Card)
  return (
    <div className="island-vertical-card">
      {/* Top Bar Header */}
      <header className="card-header">
        <div className="header-badge">
          <span className={`status-led ${isBackendOnline ? 'online' : 'offline'}`} />
          <span className="header-title">AI COMPANION</span>
          <span className="header-chip">LLM 1B</span>
        </div>
        <button
          className="card-close-btn"
          onClick={(e) => {
            e.stopPropagation();
            setExpandedState(false);
          }}
          title="Collapse to Pill"
        >
          ✕
        </button>
      </header>

      {/* Widget 1: Audio Spectrum & Noise Meter (Reference Image 2 Top-Left) */}
      <section className="widget-card noise-meter-widget">
        <div className="widget-header">
          <span className="meter-val">{audioDb} <small>dB</small></span>
          <span className={`meter-tag ${audioDb > 85 ? 'loud' : 'normal'}`}>
            {audioDb > 85 ? 'ACTIVE ⚠️' : 'NORMAL'}
          </span>
        </div>
        <div className="spectrum-bars-row">
          {[...Array(16)].map((_, i) => {
            const activeCount = Math.floor((audioDb / 100) * 16);
            const isActive = i < activeCount;
            let barColorClass = 'green';
            if (i >= 10) barColorClass = 'red';
            else if (i >= 6) barColorClass = 'yellow';

            return (
              <span
                key={i}
                className={`spec-bar ${barColorClass} ${isActive ? 'active' : ''}`}
              />
            );
          })}
        </div>
      </section>

      {/* Widget 2: Concentric Activity Rings & Memory Pill Gauges (Reference Image 2) */}
      <section className="widget-card stats-row-widget">
        {/* Concentric Rings */}
        <div className="activity-rings-container">
          <svg viewBox="0 0 60 60" className="rings-svg">
            {/* Outer Ring: Cyan LLM Load */}
            <circle cx="30" cy="30" r="25" fill="none" stroke="#1e293b" strokeWidth="4" />
            <circle
              cx="30" cy="30" r="25" fill="none" stroke="#38bdf8" strokeWidth="4"
              strokeDasharray="157" strokeDashoffset={157 - (157 * 0.65)} strokeLinecap="round"
            />
            {/* Middle Ring: Pink STT Rate */}
            <circle cx="30" cy="30" r="18" fill="none" stroke="#1e293b" strokeWidth="4" />
            <circle
              cx="30" cy="30" r="18" fill="none" stroke="#ec4899" strokeWidth="4"
              strokeDasharray="113" strokeDashoffset={113 - (113 * 0.88)} strokeLinecap="round"
            />
            {/* Inner Ring: Yellow Audio Sample */}
            <circle cx="30" cy="30" r="11" fill="none" stroke="#1e293b" strokeWidth="4" />
            <circle
              cx="30" cy="30" r="11" fill="none" stroke="#f4b942" strokeWidth="4"
              strokeDasharray="69" strokeDashoffset={69 - (69 * 0.45)} strokeLinecap="round"
            />
          </svg>
        </div>

        {/* Memory & Token Gauges */}
        <div className="metrics-col">
          <div className="pill-gauge-item">
            <span className="gauge-label">{ramUsage} <small>OF 2.0 GB</small></span>
            <div className="capsule-dots-row">
              <span className="cap-dot fill-cyan" />
              <span className="cap-dot fill-cyan" />
              <span className="cap-dot fill-cyan" />
              <span className="cap-dot fill-cyan" />
              <span className="cap-dot fill-empty" />
            </div>
          </div>

          <div className="pill-gauge-item">
            <span className="gauge-label">{tokensPerSec} <small>TOK/SEC</small></span>
            <div className="capsule-dots-row">
              <span className="cap-dot fill-pink" />
              <span className="cap-dot fill-pink" />
              <span className="cap-dot fill-pink" />
              <span className="cap-dot fill-empty" />
              <span className="cap-dot fill-empty" />
            </div>
          </div>
        </div>
      </section>

      {/* Widget 3: Quick Tactile Action Pills */}
      <div className="action-pills-row">
        <button className={`action-btn pink ${isTalking ? 'active' : ''}`} onClick={toggleVoice}>
          🎙️ RECON (VOICE)
        </button>
        <button className="action-btn orange" onClick={() => handleSend()}>
          ⚡ ENGAGE
        </button>
        <button className="action-btn" onClick={() => handleSend('Regenerate system response.')}>
          🔄 REGEN
        </button>
        <button className="action-btn" onClick={() => setIsMuted(!isMuted)}>
          {isMuted ? '🔈 UNMUTE' : '🔇 MUTE'}
        </button>
      </div>

      {/* Widget 4: Vertical Neural Chat Box */}
      <section className="vertical-chat-widget">
        <div className="chat-widget-header">
          <span>RIGEL NEURAL STREAM</span>
          <span className="header-sub">ø13_49</span>
        </div>

        <div className="vertical-chat-messages">
          {messages.map((m) => (
            <div key={m.id} className={`chat-bubble-oled ${m.sender}`}>
              <div className="bubble-sender">{m.sender === 'user' ? '► USER' : '❖ COMPANION'}</div>
              <div className="bubble-text">{m.text}</div>
            </div>
          ))}
          {isThinking && (
            <div className="chat-bubble-oled companion">
              <div className="bubble-sender">❖ COMPANION</div>
              <div className="bubble-text thinking-dots">⚡ Processing neural output...</div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="vertical-chat-form"
        >
          <input
            type="text"
            className="vertical-chat-input"
            placeholder="Ask your AI companion..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
          />
          <button type="submit" className="vertical-chat-submit">
            ►
          </button>
        </form>
      </section>

      {/* Widget 5: Telemetry Footer Strip (Reference Image 2) */}
      <footer className="card-footer-strip">
        <div className="footer-item">CYCLES <span>{cycles.toLocaleString()}</span></div>
        <div className="footer-item">SPECTRUM <span>136 AQI</span></div>
        <div className="footer-item">STATUS <span>POTENT</span></div>
      </footer>
    </div>
  );
}
