import React, { useState, useEffect, useRef } from 'react';
import './styles.css';

export default function App() {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isBackendOnline, setIsBackendOnline] = useState(true);

  const [messages, setMessages] = useState([
    {
      id: 1,
      sender: 'companion',
      text: 'OKUDAGRAM SYSTEM INITIALIZED: Rigel station core active. Voice and neural interface standby.',
    },
  ]);

  const [inputText, setInputText] = useState('');
  const [isTalking, setIsTalking] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  // Dynamic Live Metrics
  const [cycles, setCycles] = useState(13386);
  const [powerMetric, setPowerMetric] = useState(1636);
  const [technoSig, setTechnoSig] = useState(16);
  const [olivinePpm, setOlivinePpm] = useState(76);

  const canvasRef = useRef(null);
  const chatEndRef = useRef(null);
  const animFrameRef = useRef(null);
  const recognitionRef = useRef(null);

  // Synchronize state with Electron main process via IPC
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

  const setExpandedState = (expanded) => {
    setIsExpanded(expanded);
    if (window.electronAPI?.setWindowState) {
      window.electronAPI.setWindowState(expanded ? 'expanded' : 'compact');
    }
  };

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

  // Increment dynamic cycles & power metrics for responsive feel
  useEffect(() => {
    const timer = setInterval(() => {
      setCycles((c) => c + 1);
      if (isTalking) {
        setPowerMetric(1600 + Math.floor(Math.random() * 120));
        setOlivinePpm(70 + Math.floor(Math.random() * 25));
      } else {
        setPowerMetric(1636);
        setOlivinePpm(76);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [isTalking]);

  // Auto-scroll chat when expanded
  useEffect(() => {
    if (isExpanded) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isThinking, isExpanded]);

  // Spoken voice TTS
  const speakText = (text) => {
    if (isMuted) return;
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const clean = text.replace(/[\*\_#\`]/g, '');
      const utterance = new SpeechSynthesisUtterance(clean);
      utterance.rate = 1.0;
      utterance.pitch = 0.92;

      const voices = window.speechSynthesis.getVoices();
      const preferred = voices.find(
        (v) => v.lang.startsWith('en') && (v.name.includes('Natural') || v.name.includes('David') || v.name.includes('Zira'))
      );
      if (preferred) utterance.voice = preferred;

      utterance.onstart = () => setIsTalking(true);
      utterance.onend = () => setIsTalking(false);
      utterance.onerror = () => setIsTalking(false);

      window.speechSynthesis.speak(utterance);
    }
  };

  // Orbital Canvas Visualizer renderer when expanded
  useEffect(() => {
    if (!isExpanded) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let angle = 0;

    const render = () => {
      const width = (canvas.width = canvas.parentElement?.clientWidth || 140);
      const height = (canvas.height = canvas.parentElement?.clientHeight || 110);
      const cx = width / 2;
      const cy = height / 2;

      ctx.clearRect(0, 0, width, height);

      // Outer wireframe grid lines
      ctx.strokeStyle = '#291e1c';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, 45, 0, Math.PI * 2);
      ctx.arc(cx, cy, 30, 0, Math.PI * 2);
      ctx.arc(cx, cy, 15, 0, Math.PI * 2);
      ctx.stroke();

      // Crosshairs
      ctx.beginPath();
      ctx.moveTo(cx - 55, cy); ctx.lineTo(cx + 55, cy);
      ctx.moveTo(cx, cy - 55); ctx.lineTo(cx, cy + 55);
      ctx.stroke();

      // Rotating Station Spokes & Nodes
      const spokeCount = 12;
      const speed = isTalking ? 0.04 : isThinking ? 0.06 : 0.015;

      for (let i = 0; i < spokeCount; i++) {
        const theta = angle + (i * Math.PI * 2) / spokeCount;
        const r1 = 10;
        const r2 = 40 + Math.sin(angle * 2 + i) * (isTalking ? 6 : 2);

        const x1 = cx + Math.cos(theta) * r1;
        const y1 = cy + Math.sin(theta) * r1;
        const x2 = cx + Math.cos(theta) * r2;
        const y2 = cy + Math.sin(theta) * r2;

        ctx.strokeStyle = i % 2 === 0 ? '#ef475a' : '#f79256';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();

        // Node dots
        ctx.fillStyle = '#f4b942';
        ctx.beginPath();
        ctx.arc(x2, y2, 2, 0, Math.PI * 2);
        ctx.fill();
      }

      // Center Eye Ring
      ctx.fillStyle = isThinking ? '#f4b942' : isTalking ? '#ef475a' : '#dfd3c3';
      ctx.beginPath();
      ctx.arc(cx, cy, 6, 0, Math.PI * 2);
      ctx.fill();

      angle += speed;
      animFrameRef.current = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [isTalking, isThinking, isExpanded]);

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
        const reply = data.response || 'Telemetry check complete. Systems normal.';
        setIsThinking(false);

        setMessages((prev) => [...prev, { id: Date.now() + 1, sender: 'companion', text: reply }]);
        speakText(reply);
      } else {
        throw new Error('API Error');
      }
    } catch (e) {
      setIsThinking(false);
      setIsTalking(false);
      const fallback = '[ALERT] Rigel telemetry connection error. Verify local backend server status.';
      setMessages((prev) => [...prev, { id: Date.now() + 2, sender: 'companion', text: fallback }]);
      speakText('Connection warning.');
    }
  };

  // Push to talk mic
  const toggleVoice = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      handleSend('Give me a status update on the Rigel system.');
      return;
    }

    if (isTalking) {
      window.speechSynthesis?.cancel();
      setIsTalking(false);
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

  // Render Compact State (Pill)
  if (!isExpanded) {
    return (
      <div
        className="island-compact"
        onClick={() => setExpandedState(true)}
        title="Click to Expand Dynamic Island"
      >
        <span className={`compact-dot ${isBackendOnline ? 'online' : 'offline'}`} />
        
        <div className="compact-visualizer">
          {isTalking ? (
            <div className="compact-wave">
              <span className="bar" />
              <span className="bar" />
              <span className="bar" />
            </div>
          ) : isThinking ? (
            <div className="compact-spinner" />
          ) : (
            <div className="compact-steady-pulse" />
          )}
        </div>

        <span className="compact-label">
          {isTalking ? 'TALK' : isThinking ? 'THINK' : isBackendOnline ? 'Z4' : 'OFF'}
        </span>
      </div>
    );
  }

  // Render Expanded State (Okudagram Dashboard)
  return (
    <div className="island-expanded">
      {/* Top Header Bar */}
      <header className="oku-top-panel">
        <div className="oku-top-header">
          <div className="oku-pill-group">
            <div className="oku-pill-tag">era <span>34 T.E</span></div>
            <div className="oku-pill-tag">cycles <span>{cycles.toLocaleString()}</span></div>
            <div className="oku-pill-tag">mass <span>46</span></div>
          </div>
          
          <div className="header-right-group">
            <div className="oku-pill-tag status-pill">
              <span>{isThinking ? 'COMPUTING' : isTalking ? 'TRANSMITTING' : 'STEADY'}</span>
            </div>
            <button
              className="island-close-btn"
              onClick={(e) => {
                e.stopPropagation();
                setExpandedState(false);
              }}
              title="Collapse to Pill"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="oku-top-grid">
          {/* Orbital Canvas Diagram */}
          <div className="oku-visualizer-box">
            <canvas ref={canvasRef} className="oku-canvas" />
          </div>

          {/* kW/kg Metric Readout */}
          <div className="oku-metric-display">
            <div className="oku-huge-num">{powerMetric}</div>
            <div className="oku-unit-label">kW/kg</div>
            <div className="oku-coords-row">
              <span>3.009°</span>
              <span>6.016°</span>
              <span>rigel</span>
            </div>
          </div>

          {/* Radial Dial SVG Widget */}
          <div className="oku-dial-widget">
            <svg viewBox="0 0 100 100" className="oku-dial-svg">
              <circle cx="50" cy="50" r="44" fill="none" stroke="#f79256" strokeWidth="8" strokeDasharray="60 30" />
              <circle cx="50" cy="50" r="44" fill="none" stroke="#ef475a" strokeWidth="8" strokeDasharray="30 120" strokeDashoffset="-90" />
              <circle cx="50" cy="50" r="30" fill="none" stroke="#dfd3c3" strokeWidth="6" strokeDasharray="80 20" />
              <circle cx="50" cy="50" r="30" fill="none" stroke="#ef475a" strokeWidth="6" strokeDasharray="30 70" strokeDashoffset="-40" />
              <circle cx="50" cy="50" r="18" fill="#120e0d" stroke="#f4b942" strokeWidth="2" />
              <text x="50" y="54" fill="#dfd3c3" fontSize="10" fontWeight="bold" textAnchor="middle" fontFamily="monospace">z4</text>
            </svg>
          </div>
        </div>
      </header>

      {/* Bottom Main Content Panel */}
      <main className="oku-bottom-panel">
        {/* Left Stack Controls */}
        <div className="oku-button-stack">
          <button className="oku-btn" onClick={() => handleSend('Regenerate system diagnostic response.')}>
            regenerate
          </button>
          <button className={`oku-btn pink ${isTalking ? 'active' : ''}`} onClick={toggleVoice}>
            recon (voice)
          </button>
          <button className="oku-btn orange" onClick={() => handleSend()}>
            engage
          </button>
          <button className="oku-btn" onClick={() => setIsMuted(!isMuted)}>
            synthesis {isMuted ? '[off]' : '[on]'}
          </button>
          <button className="oku-btn" onClick={() => setMessages([])}>
            atomise
          </button>
        </div>

        {/* Vertical Capsule Bars */}
        <div className="oku-capsules-group">
          <div className="oku-capsule orange">
            <span className="capsule-symbol">ø6</span>
            <div className="capsule-val">13_176</div>
          </div>
          <div className="oku-capsule yellow">
            <span>NO₂</span>
            <div className="capsule-val">21_226</div>
          </div>
          <div className="oku-capsule cream">
            <span>H₂S</span>
            <div className="capsule-symbol">⋔7</div>
          </div>
          <div className="oku-capsule taupe">
            <span>spin</span>
            <div className="capsule-val">406</div>
          </div>
        </div>

        {/* Interactive Chat Module */}
        <section className="oku-chat-box">
          <div className="oku-chat-header">
            <span>RIGEL NEURAL CHAT</span>
            <span>ø13_49</span>
          </div>

          <div className="oku-chat-messages">
            {messages.map((m) => (
              <div key={m.id} className={`oku-msg ${m.sender}`}>
                <div className="oku-msg-sender">{m.sender === 'user' ? '► USER' : '❖ COMPANION'}</div>
                <div>{m.text}</div>
              </div>
            ))}
            {isThinking && (
              <div className="oku-msg companion">
                <div className="oku-msg-sender">❖ COMPANION</div>
                <div>⚡ Processing neural output...</div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="oku-chat-form"
          >
            <input
              type="text"
              className="oku-chat-input"
              placeholder="Query companion..."
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
            />
            <button type="submit" className="oku-chat-submit">
              ENGAGE ►
            </button>
          </form>
        </section>
      </main>

      {/* Footer Telemetry Row */}
      <footer className="oku-telemetry-row">
        <div className="oku-telemetry-item">techo: <span>{technoSig}/466</span></div>
        <div className="oku-telemetry-item">voids: <span>16%</span></div>
        <div className="oku-telemetry-item">olivine: <span>{olivinePpm} ppm</span></div>
        <div className="oku-telemetry-item">photolysis: <span>potent</span></div>
      </footer>
    </div>
  );
}
