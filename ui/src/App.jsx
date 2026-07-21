import React, { useState, useEffect, useRef } from 'react';
import './styles.css';

export default function App() {
  const [messages, setMessages] = useState([
    {
      id: 1,
      sender: 'companion',
      text: 'SYSTEM ONLINE: Welcome! I am your Retro AI Companion. Tap COMMUNICATE to speak via voice or type a message below to begin our conversation.',
    },
  ]);

  const [inputText, setInputText] = useState('');
  const [isTalking, setIsTalking] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [status, setStatus] = useState({
    online: true,
    model: 'llama3.2:1b',
  });

  const canvasRef = useRef(null);
  const chatEndRef = useRef(null);
  const animFrameRef = useRef(null);

  // Auto-scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isThinking]);

  // Canvas Oscilloscope / Retro Visualizer Rendering Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let phase = 0;

    const render = () => {
      const width = (canvas.width = canvas.parentElement.clientWidth || 280);
      const height = (canvas.height = canvas.parentElement.clientHeight || 180);

      ctx.clearRect(0, 0, width, height);

      // Grid background effect
      ctx.strokeStyle = 'rgba(0, 242, 254, 0.07)';
      ctx.lineWidth = 1;
      for (let x = 0; x < width; x += 20) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = 0; y < height; y += 20) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      // Dynamic Oscilloscope Sine Wave / Plasma Orb
      const isBusy = isTalking || isThinking;
      const waveCount = isBusy ? 4 : 2;
      const baseAmp = isBusy ? 35 : 12;

      for (let w = 0; w < waveCount; w++) {
        ctx.beginPath();
        ctx.lineWidth = w === 0 ? 3 : 1.5;

        if (isThinking) {
          ctx.strokeStyle = w % 2 === 0 ? 'rgba(255, 183, 3, 0.9)' : 'rgba(255, 0, 127, 0.7)';
        } else if (isTalking) {
          ctx.strokeStyle = w % 2 === 0 ? 'rgba(0, 242, 254, 0.9)' : 'rgba(79, 172, 254, 0.7)';
        } else {
          ctx.strokeStyle = 'rgba(0, 242, 254, 0.4)';
        }

        for (let x = 0; x < width; x++) {
          const freq = 0.02 + w * 0.008;
          const amp = baseAmp * Math.sin(phase * 0.4 + w);
          const y = height / 2 + Math.sin(x * freq + phase + w * 1.5) * amp;

          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      phase += isBusy ? 0.12 : 0.04;
      animFrameRef.current = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [isTalking, isThinking]);

  // Send message to local LLM backend
  const handleSendMessage = async (textToSend) => {
    const prompt = textToSend || inputText;
    if (!prompt.trim() || isThinking) return;

    const userMsg = { id: Date.now(), sender: 'user', text: prompt };
    setMessages((prev) => [...prev, userMsg]);
    if (!textToSend) setInputText('');

    setIsThinking(true);

    try {
      const res = await fetch('http://localhost:8000/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });

      if (res.ok) {
        const data = await res.json();
        const companionReply = data.response || "I am right here listening!";

        setIsThinking(false);
        setIsTalking(true);

        const companionMsg = { id: Date.now() + 1, sender: 'companion', text: companionReply };
        setMessages((prev) => [...prev, companionMsg]);

        // Simulate voice playback duration matching response length
        const talkDuration = Math.min(Math.max(companionReply.length * 40, 1500), 5000);
        setTimeout(() => {
          setIsTalking(false);
        }, talkDuration);
      } else {
        throw new Error('API request failed');
      }
    } catch (err) {
      setIsThinking(false);
      setIsTalking(false);
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 2,
          sender: 'companion',
          text: '[SYSTEM ALERT] Unable to reach backend server. Please verify FastAPI backend is running.',
        },
      ]);
    }
  };

  // Toggle Voice Input / Microphone
  const toggleVoiceInteraction = () => {
    if (!isTalking && !isThinking) {
      setIsTalking(true);
      const simulatedPrompts = [
        "Tell me a short story about an AI companion in the year 2088.",
        "How are you feeling today, companion?",
        "Give me a quick tip for building hardware projects."
      ];
      const randomPrompt = simulatedPrompts[Math.floor(Math.random() * simulatedPrompts.length)];

      setTimeout(() => {
        setIsTalking(false);
        handleSendMessage(randomPrompt);
      }, 2000);
    }
  };

  return (
    <div className="retro-container">
      {/* Top Header */}
      <header className="retro-header">
        <div className="retro-brand">
          <div className="retro-orb"></div>
          <span className="retro-title">COMPANION AI // MK-I</span>
        </div>

        <div className="retro-status-group">
          <div className="status-badge">
            <span className={`led-dot ${status.online ? 'active' : ''}`}></span>
            <span>SYSTEM: ONLINE</span>
          </div>
          <div className="status-badge">
            <span className={`led-dot ${isThinking ? 'busy' : isTalking ? 'pink' : 'active'}`}></span>
            <span>MODEL: {status.model}</span>
          </div>
        </div>
      </header>

      {/* Main Body */}
      <main className="retro-body">
        {/* Left Column: AI Core Avatar & Voice Push Button */}
        <section className="retro-card ai-core-panel">
          <div className="retro-card-header">
            <span>[ OSCILLOSCOPE ]</span>
          </div>

          <div className="oscilloscope-screen">
            <canvas ref={canvasRef} className="oscilloscope-canvas" />
          </div>

          <div className="core-avatar-display">
            <div className="ai-state-label">
              {isThinking ? '⚡ THINKING...' : isTalking ? '🎙️ TALKING' : '🟢 READY'}
            </div>
          </div>

          <button
            className={`retro-talk-btn ${isTalking ? 'recording' : ''}`}
            onClick={toggleVoiceInteraction}
          >
            <span>{isTalking ? '🎙️ LISTENING...' : '⚡ COMMUNICATE (VOICE)'}</span>
          </button>
        </section>

        {/* Right Column: Conversational Chat Panel */}
        <section className="retro-card chat-panel">
          <div className="retro-card-header">
            <span>[ CONVERSATION FEED ]</span>
            <span style={{ color: 'var(--text-phosphor)' }}>{messages.length} MESSAGES</span>
          </div>

          <div className="chat-history">
            {messages.map((msg) => (
              <div key={msg.id} className={`chat-bubble ${msg.sender}`}>
                <span className="speaker-tag">
                  {msg.sender === 'user' ? '► USER' : '❖ COMPANION'}
                </span>
                <p>{msg.text}</p>
              </div>
            ))}
            {isThinking && (
              <div className="chat-bubble companion">
                <span className="speaker-tag">❖ COMPANION</span>
                <p>⚡ Processing response from Llama-3.2-1B...</p>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="chat-input-area"
          >
            <input
              type="text"
              className="retro-text-input"
              placeholder="Type message to your companion..."
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
            />
            <button type="submit" className="retro-send-btn">
              SEND ►
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}
