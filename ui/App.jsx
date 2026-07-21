import React, { useState, useEffect, useRef } from 'react';
import './styles.css';

export default function App() {
  const [status, setStatus] = useState({
    online: false,
    ollamaModel: 'llama3.2:1b',
    ollamaOnline: false,
    whisperLoaded: false,
    inputDevice: 'Default Mic',
  });

  const [isListening, setIsListening] = useState(false);
  const [transcription, setTranscription] = useState('');
  const [terminalLogs, setTerminalLogs] = useState([]);
  const [terminalInput, setTerminalInput] = useState('');

  const [currentCode, setCurrentCode] = useState(
`# Embedded AI Companion Controller
import sys
from backend.ai_engine import ai_engine

async def process_hardware_event(event_id, payload):
    """Process incoming sensors and local LLM response."""
    print(f"[HW-EVT] Dispatching {event_id}")
    response = await ai_engine.generate_response(payload)
    return {"status": 200, "response": response}

if __name__ == "__main__":
    print("AI Companion Hardware Pipeline Active.")`
  );

  const canvasRef = useRef(null);
  const animFrameRef = useRef(null);
  const wsTerminalRef = useRef(null);
  const wsAudioRef = useRef(null);
  const terminalEndRef = useRef(null);

  // Helper to add logs to terminal output
  const addLog = (level, source, message) => {
    const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });
    setTerminalLogs((prev) => [
      ...prev.slice(-100), // Keep last 100 log lines
      { timestamp, level, source, message, id: Math.random() },
    ]);
  };

  // Poll backend health API
  useEffect(() => {
    const fetchHealth = async () => {
      try {
        const res = await fetch('http://localhost:8000/api/health');
        if (res.ok) {
          const data = await res.json();
          setStatus({
            online: true,
            ollamaModel: data.ollama.model,
            ollamaOnline: data.ollama.online,
            whisperLoaded: data.audio.stt_loaded,
            inputDevice: `Device #${data.audio.input_index}`,
          });
        }
      } catch (err) {
        setStatus((prev) => ({ ...prev, online: false }));
      }
    };

    fetchHealth();
    const interval = setInterval(fetchHealth, 5000);
    return () => clearInterval(interval);
  }, []);

  // Connect to live WebSocket telemetry endpoints
  useEffect(() => {
    addLog('SYSTEM', 'HARDWARE', 'Booting companion UI touch interface...');
    addLog('SYSTEM', 'AUDIO', 'Waveform canvas rendering engine initialized.');

    // Connect Terminal WebSocket
    try {
      const wsTerm = new WebSocket('ws://localhost:8000/ws/terminal');
      wsTerm.onopen = () => {
        addLog('SYSTEM', 'WS', 'Terminal telemetry channel established.');
      };
      wsTerm.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          addLog(data.level || 'INFO', data.source || 'BACKEND', data.message || '');
        } catch (e) {
          addLog('INFO', 'STREAM', event.data);
        }
      };
      wsTerminalRef.current = wsTerm;
    } catch (e) {
      addLog('WARN', 'WS', 'Could not open live WebSocket telemetry.');
    }

    return () => {
      if (wsTerminalRef.current) wsTerminalRef.current.close();
    };
  }, []);

  // Auto-scroll terminal log to bottom
  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [terminalLogs]);

  // Voice Waveform Canvas Animation
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let phase = 0;

    const renderWaveform = () => {
      const width = (canvas.width = canvas.parentElement.clientWidth || 600);
      const height = (canvas.height = 60);

      ctx.clearRect(0, 0, width, height);

      // Draw center reference line
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.moveTo(0, height / 2);
      ctx.lineTo(width, height / 2);
      ctx.stroke();

      // Dynamic sine waves
      const waveCount = isListening ? 3 : 1;
      const baseAmp = isListening ? 22 : 4;

      for (let w = 0; w < waveCount; w++) {
        ctx.beginPath();
        ctx.lineWidth = w === 0 ? 2 : 1;
        ctx.strokeStyle =
          w === 0
            ? 'rgba(0, 242, 254, 0.9)'
            : w === 1
            ? 'rgba(59, 130, 246, 0.5)'
            : 'rgba(168, 85, 247, 0.4)';

        for (let x = 0; x < width; x++) {
          const freq = 0.015 + w * 0.005;
          const amp = baseAmp * (1 + Math.sin(x * 0.01 + phase * 0.5));
          const y = height / 2 + Math.sin(x * freq + phase + w) * amp;

          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      phase += isListening ? 0.12 : 0.03;
      animFrameRef.current = requestAnimationFrame(renderWaveform);
    };

    renderWaveform();
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [isListening]);

  // Handle Touch Microphone Toggle
  const toggleListening = () => {
    if (!isListening) {
      setIsListening(true);
      setTranscription('Listening for voice input...');
      addLog('STT', 'MIC', 'Microphone active. Capturing audio stream...');

      // Simulated voice prompt trigger for local demo testing
      setTimeout(() => {
        const demoPrompts = [
          "Explain Python async generator functions.",
          "Write a fast helper function to read sensor input.",
          "What is the system status of the hardware companion?"
        ];
        const selected = demoPrompts[Math.floor(Math.random() * demoPrompts.length)];
        setTranscription(`" ${selected} "`);
        sendPromptToLLM(selected);
        setIsListening(false);
      }, 2500);
    } else {
      setIsListening(false);
      setTranscription('Voice input paused.');
    }
  };

  // Send Prompt to LLM via REST or WS
  const sendPromptToLLM = async (promptText) => {
    addLog('LLM', 'PROMPT', `Sending prompt to ${status.ollamaModel}: "${promptText}"`);
    try {
      const res = await fetch('http://localhost:8000/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: promptText }),
      });
      if (res.ok) {
        const data = await res.json();
        const reply = data.response;
        addLog('LLM', 'RESPONSE', reply.substring(0, 80) + '...');

        // If reply has python or code snippet, extract to code block display
        if (reply.includes('def ') || reply.includes('import ') || reply.includes('function')) {
          setCurrentCode(reply);
        }
      }
    } catch (e) {
      addLog('WARN', 'API', 'Error reaching local LLM endpoint.');
    }
  };

  // Handle Manual Terminal Command Submit
  const handleTerminalSubmit = (e) => {
    e.preventDefault();
    if (!terminalInput.trim()) return;
    addLog('USER', 'INPUT', terminalInput);
    
    if (terminalInput.toLowerCase().startsWith('chat ')) {
      const prompt = terminalInput.substring(5);
      sendPromptToLLM(prompt);
    } else if (terminalInput.toLowerCase() === 'clear') {
      setTerminalLogs([]);
    } else if (terminalInput.toLowerCase() === 'help') {
      addLog('SYSTEM', 'HELP', 'Available CLI commands: chat <prompt>, clear, help, status');
    } else {
      addLog('SYSTEM', 'CLI', `Executed terminal command: ${terminalInput}`);
    }
    setTerminalInput('');
  };

  return (
    <div className="device-container">
      {/* Top Hardware Navigation & Status Bar */}
      <header className="hardware-header">
        <div className="brand-section">
          <div className="hardware-logo"></div>
          <span className="brand-title">AGY COMPANION OS</span>
          <span className="brand-badge">HW-v1.0</span>
        </div>

        <div className="status-indicators">
          <div className="indicator-item">
            <span className={`indicator-led ${status.online ? 'online' : ''}`}></span>
            <span>API {status.online ? 'ONLINE' : 'OFFLINE'}</span>
          </div>
          <div className="indicator-item">
            <span className={`indicator-led ${status.ollamaOnline ? 'online' : 'busy'}`}></span>
            <span>LLM: {status.ollamaModel}</span>
          </div>
          <div className="indicator-item">
            <span className={`indicator-led ${status.whisperLoaded ? 'online' : 'busy'}`}></span>
            <span>STT: {status.whisperLoaded ? 'WHISPER' : 'STANDBY'}</span>
          </div>
        </div>
      </header>

      {/* Main Touchscreen Grid Layout */}
      <main className="dashboard-grid">
        {/* Panel 1: Voice Waveform & Touch Mic Controller */}
        <section className="panel-card voice-panel">
          <div className="panel-header">
            <div className="panel-title">
              <span>🎙️ REAL-TIME VOICE PIPELINE</span>
            </div>
            <div className="quick-bar">
              <span className="action-chip">{status.inputDevice}</span>
              <span className="action-chip">16000Hz PCM</span>
            </div>
          </div>

          <div className="visualizer-container">
            <canvas ref={canvasRef} className="canvas-waveform" />

            <div className="voice-prompt-display">
              {transcription || 'Tap record button to begin speech-to-text...'}
            </div>

            <div className="voice-controls">
              <button
                className={`touch-btn ${isListening ? 'active' : ''}`}
                onClick={toggleListening}
              >
                <span>{isListening ? '🔴 STOP LISTENING' : '🎙️ START VOICE INTERACTION'}</span>
              </button>
            </div>
          </div>
        </section>

        {/* Panel 2: Code Snippet Assistant Block */}
        <section className="panel-card code-panel">
          <div className="panel-header">
            <div className="panel-title">
              <span>💻 CODE ASSISTANT DISPLAY</span>
            </div>
            <button
              className="action-chip"
              onClick={() => {
                navigator.clipboard?.writeText(currentCode);
                addLog('SYSTEM', 'CLIPBOARD', 'Code copied to clipboard.');
              }}
            >
              COPY CODE
            </button>
          </div>

          <div className="code-content">
            <pre className="syntax-code">
              {currentCode.split('\n').map((line, idx) => {
                let styledLine = line;
                if (line.trim().startsWith('#') || line.trim().startsWith('//')) {
                  return <div key={idx} className="syntax-comment">{line}</div>;
                }
                return (
                  <div key={idx}>
                    {line.replace(/(def|import|from|async|await|return|if|class)/g, '🔑 $1')}
                  </div>
                );
              })}
            </pre>
          </div>
        </section>

        {/* Panel 3: Cyberpunk Hardware Terminal Output View */}
        <section className="panel-card terminal-panel">
          <div className="panel-header">
            <div className="panel-title">
              <span>📟 SYSTEM TELEMETRY & LOGS</span>
            </div>
            <button className="action-chip" onClick={() => setTerminalLogs([])}>
              CLEAR LOGS
            </button>
          </div>

          <div className="terminal-logs">
            {terminalLogs.map((log) => (
              <div key={log.id} className="log-line">
                <span className="log-timestamp">[{log.timestamp}]</span>
                <span className={`log-tag ${log.level}`}>{log.source}</span>
                <span className="log-msg">{log.message}</span>
              </div>
            ))}
            <div ref={terminalEndRef} />
          </div>

          <form onSubmit={handleTerminalSubmit} className="terminal-input-bar">
            <span className="prompt-symbol">agy&gt;</span>
            <input
              type="text"
              className="term-input"
              placeholder="Type command or 'chat <prompt>'..."
              value={terminalInput}
              onChange={(e) => setTerminalInput(e.target.value)}
            />
          </form>
        </section>
      </main>
    </div>
  );
}
