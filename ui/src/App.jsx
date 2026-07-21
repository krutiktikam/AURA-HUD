import React, { useState, useEffect, useRef } from 'react';
import './styles.css';

export default function App() {
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

  // Dynamic Live Metrics (matching image telemetry)
  const [cycles, setCycles] = useState(13386);
  const [powerMetric, setPowerMetric] = useState(1636);
  const [technoSig, setTechnoSig] = useState(16);
  const [olivinePpm, setOlivinePpm] = useState(76);

  const canvasRef = useRef(null);
  const chatEndRef = useRef(null);
  const animFrameRef = useRef(null);
  const recognitionRef = useRef(null);

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

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isThinking]);

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

  // Wireframe Station / Orbital Core 3D Canvas Renderer (matching the diagram in the reference image)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let angle = 0;

    const render = () => {
      const width = (canvas.width = canvas.parentElement.clientWidth || 240);
      const height = (canvas.height = canvas.parentElement.clientHeight || 160);
      const cx = width / 2;
      const cy = height / 2;

      ctx.clearRect(0, 0, width, height);

      // Outer wireframe grid lines
      ctx.strokeStyle = '#291e1c';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, 65, 0, Math.PI * 2);
      ctx.arc(cx, cy, 45, 0, Math.PI * 2);
      ctx.arc(cx, cy, 25, 0, Math.PI * 2);
      ctx.stroke();

      // Crosshairs
      ctx.beginPath();
      ctx.moveTo(cx - 75, cy); ctx.lineTo(cx + 75, cy);
      ctx.moveTo(cx, cy - 75); ctx.lineTo(cx, cy + 75);
      ctx.stroke();

      // Rotating Station Spokes & Nodes
      const spokeCount = 16;
      const speed = isTalking ? 0.04 : isThinking ? 0.06 : 0.015;

      for (let i = 0; i < spokeCount; i++) {
        const theta = angle + (i * Math.PI * 2) / spokeCount;
        const r1 = 15;
        const r2 = 55 + Math.sin(angle * 2 + i) * (isTalking ? 8 : 2);

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
        ctx.arc(x2, y2, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }

      // Center Eye Ring
      ctx.fillStyle = isThinking ? '#f4b942' : isTalking ? '#ef475a' : '#dfd3c3';
      ctx.beginPath();
      ctx.arc(cx, cy, 8, 0, Math.PI * 2);
      ctx.fill();

      angle += speed;
      animFrameRef.current = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [isTalking, isThinking]);

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

  return (
    <div className="oku-container">
      {/* Top Okudagram Frame */}
      <header className="oku-top-panel">
        <div className="oku-top-header">
          <div className="oku-pill-group">
            <div className="oku-pill-tag">crisis era <span>34 T.E</span></div>
            <div className="oku-pill-tag">cycles <span>{cycles.toLocaleString()}</span></div>
            <div className="oku-pill-tag">mass dots <span>46</span></div>
            <div className="oku-pill-tag">dual vector foils <span>2.0156</span></div>
          </div>
          <div className="oku-pill-tag">
            STATUS: <span>{isThinking ? 'COMPUTING' : isTalking ? 'TRANSMITTING' : 'STEADY'}</span>
          </div>
        </div>

        <div className="oku-top-grid">
          {/* Visualizer Station Diagram Box */}
          <div className="oku-visualizer-box">
            <canvas ref={canvasRef} className="oku-canvas" />
          </div>

          {/* Big kW/kg Metric Readout */}
          <div className="oku-metric-display">
            <div className="oku-huge-num">{powerMetric}</div>
            <div className="oku-unit-label">kW/kg</div>
            <div className="oku-coords-row">
              <span>3.009°</span>
              <span>6.016°</span>
              <span>2.119°</span>
              <span>rigel system</span>
            </div>
          </div>

          {/* Segmented Radial Dial SVG Widget (Matching Image Right Dial) */}
          <div className="oku-dial-widget">
            <svg viewBox="0 0 100 100" className="oku-dial-svg">
              {/* Outer Ring */}
              <circle cx="50" cy="50" r="44" fill="none" stroke="#f79256" strokeWidth="10" strokeDasharray="60 30" />
              <circle cx="50" cy="50" r="44" fill="none" stroke="#ef475a" strokeWidth="10" strokeDasharray="30 120" strokeDashoffset="-90" />
              {/* Middle Ring */}
              <circle cx="50" cy="50" r="30" fill="none" stroke="#dfd3c3" strokeWidth="8" strokeDasharray="80 20" />
              <circle cx="50" cy="50" r="30" fill="none" stroke="#ef475a" strokeWidth="8" strokeDasharray="30 70" strokeDashoffset="-40" />
              {/* Inner Circle with Label */}
              <circle cx="50" cy="50" r="18" fill="#120e0d" stroke="#f4b942" strokeWidth="2" />
              <text x="50" y="54" fill="#dfd3c3" fontSize="10" fontWeight="bold" textAnchor="middle" fontFamily="monospace">z4</text>
              <text x="78" y="32" fill="#120e0d" fontSize="7" fontWeight="bold" fontFamily="sans-serif">&gt;&gt;&gt; +</text>
              <text x="18" y="52" fill="#120e0d" fontSize="7" fontWeight="bold" fontFamily="sans-serif">q3</text>
              <text x="74" y="74" fill="#120e0d" fontSize="7" fontWeight="bold" fontFamily="sans-serif">b2</text>
            </svg>
          </div>
        </div>
      </header>

      {/* Bottom Okudagram Panel */}
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

        {/* Vertical Capsule Bars (Matching Image Center Pillars) */}
        <div className="oku-capsules-group">
          <div className="oku-capsule orange">
            <span className="capsule-symbol">ø6</span>
            <div style={{ fontSize: '0.7rem' }}>13_176</div>
          </div>
          <div className="oku-capsule yellow">
            <span>NO₂</span>
            <div style={{ fontSize: '0.7rem' }}>21_226</div>
          </div>
          <div className="oku-capsule cream">
            <span>H₂S</span>
            <div className="capsule-symbol">⋔7 ¤3</div>
          </div>
          <div className="oku-capsule taupe">
            <span>spin</span>
            <div style={{ fontSize: '0.75rem', textAlign: 'center' }}>406 cycle steady</div>
          </div>
        </div>

        {/* Interactive Okudagram Conversational Chat */}
        <section className="oku-chat-box">
          <div className="oku-chat-header">
            <span>RIGEL NEURAL CHAT INTERFACE</span>
            <span>ø13_49_66</span>
          </div>

          <div className="oku-chat-messages">
            {messages.map((m) => (
              <div key={m.id} className={`oku-msg ${m.sender}`}>
                <div className="oku-msg-sender">{m.sender === 'user' ? '► RECON USER' : '❖ COMPANION'}</div>
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
              placeholder="Input query for companion..."
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
            />
            <button type="submit" className="oku-chat-submit">
              ENGAGE ►
            </button>
          </form>
        </section>
      </main>

      {/* Telemetry Footer Strip */}
      <footer className="oku-telemetry-row">
        <div className="oku-telemetry-item">techo-signatures: <span>{technoSig}/466</span></div>
        <div className="oku-telemetry-item">voids: <span>16%</span></div>
        <div className="oku-telemetry-item">olivine deposits: <span>{olivinePpm} ppm (above average)</span></div>
        <div className="oku-telemetry-item">amines: <span>null</span></div>
        <div className="oku-telemetry-item">biofilms: <span>null</span></div>
        <div className="oku-telemetry-item">photolysis: <span>potent</span></div>
      </footer>
    </div>
  );
}
