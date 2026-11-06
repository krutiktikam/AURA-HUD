import { useState, useEffect, useRef, useCallback } from 'react';
import { WS_BASE } from '../config';
import { getToken } from '../api';

// Default backoff values: 1s initial, doubling to 10s cap (defaults; not tuned)
const INITIAL_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 10000;
const MAX_MESSAGES = 50;

const ERROR_MAP = {
  stt_unavailable: 'Speech recognition is currently unavailable.',
  ai_service_unavailable: 'AI service is temporarily unavailable.',
  ai_timeout: 'AI request timed out.',
  ai_stream_interrupted: 'AI response stream was interrupted.',
  bad_request: 'Invalid request sent to backend.',
};

/**
 * Hook to manage persistent WebSocket connection for chat streaming.
 *
 * @param {object} [options]
 * @param {function} [options.onAiDone] - Callback fired when ai_done completes with full text
 * @returns {{ connection: string, messages: Array, isThinking: boolean, send: function(string): void, error: string|null }}
 */
export function useChatSocket(options = {}) {
  const { onAiDone } = options;
  const onAiDoneRef = useRef(onAiDone);
  onAiDoneRef.current = onAiDone;

  const [connection, setConnection] = useState('connecting'); // 'connecting' | 'connected' | 'disconnected' | 'auth_error'
  const [messages, setMessages] = useState([]);
  const [isThinking, setIsThinking] = useState(false);
  const [error, setError] = useState(null);

  const wsRef = useRef(null);
  const backoffRef = useRef(INITIAL_BACKOFF_MS);

  useEffect(() => {
    let ws = null;
    let isMounted = true;
    let reconnectTimer = null;

    const connectWs = async () => {
      let token;
      try {
        token = await getToken();
      } catch (err) {
        if (isMounted) {
          setConnection('auth_error');
          setError('Authentication error: Unable to obtain API token.');
        }
        return;
      }

      if (!isMounted) return;

      try {
        ws = new WebSocket(`${WS_BASE}/api/stt/live`);
        wsRef.current = ws;

        ws.onopen = () => {
          if (!isMounted) return;
          // Send auth message first
          ws.send(JSON.stringify({ type: 'auth', token }));
          setConnection('connected');
          setError(null);
          backoffRef.current = INITIAL_BACKOFF_MS;
        };

        ws.onmessage = (event) => {
          if (!isMounted) return;
          try {
            const data = JSON.parse(event.data);
            if (data.event === 'ai_start') {
              setIsThinking(false);
              setMessages((prev) =>
                [...prev, { id: Date.now(), sender: 'companion', text: '' }].slice(-MAX_MESSAGES)
              );
            } else if (data.event === 'ai_token' && data.token) {
              setMessages((prev) => {
                const last = prev[prev.length - 1];
                if (last && last.sender === 'companion') {
                  const updated = [...prev.slice(0, -1), { ...last, text: last.text + data.token }];
                  return updated.slice(-MAX_MESSAGES);
                }
                const next = [...prev, { id: Date.now(), sender: 'companion', text: data.token }];
                return next.slice(-MAX_MESSAGES);
              });
            } else if (data.event === 'ai_done') {
              setIsThinking(false);
              if (data.full_text && onAiDoneRef.current) {
                onAiDoneRef.current(data.full_text);
              }
            } else if (data.event === 'transcription' && data.text) {
              setMessages((prev) =>
                [...prev, { id: Date.now(), sender: 'user', text: data.text }].slice(-MAX_MESSAGES)
              );
            } else if (data.event === 'error') {
              setIsThinking(false);
              const errCode = data.code || data.error;
              const errorText = ERROR_MAP[errCode] || `Error: ${errCode || 'Unknown error'}`;
              setError(errorText);
            }
          } catch (e) {
            console.warn('WS message parsing error:', e);
          }
        };

        ws.onclose = (event) => {
          if (!isMounted) return;
          // No reconnect on 4401 (unauthorized) or 1008 (policy violation)
          if (event.code === 4401 || event.code === 1008) {
            setConnection('auth_error');
            setIsThinking(false);
            setError('Authentication failed. Reconnect cancelled.');
            return;
          }

          setConnection('disconnected');
          const delay = backoffRef.current;
          backoffRef.current = Math.min(backoffRef.current * 2, MAX_BACKOFF_MS);
          reconnectTimer = setTimeout(connectWs, delay);
        };

        ws.onerror = () => {
          if (!isMounted) return;
          // Error handling will flow through onclose
        };
      } catch (err) {
        if (!isMounted) return;
        setConnection('disconnected');
        const delay = backoffRef.current;
        backoffRef.current = Math.min(backoffRef.current * 2, MAX_BACKOFF_MS);
        reconnectTimer = setTimeout(connectWs, delay);
      }
    };

    connectWs();

    return () => {
      isMounted = false;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) ws.close();
    };
  }, []);

  const send = useCallback(
    (prompt) => {
      if (!prompt || !prompt.trim() || isThinking) return;
      const cleanPrompt = prompt.trim();
      setError(null);
      setIsThinking(true);

      setMessages((prev) =>
        [...prev, { id: Date.now(), sender: 'user', text: cleanPrompt }].slice(-MAX_MESSAGES)
      );

      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'chat', prompt: cleanPrompt }));
      } else {
        setIsThinking(false);
        setError('Backend connection is not open.');
      }
    },
    [isThinking]
  );

  return {
    connection,
    messages,
    isThinking,
    send,
    error,
  };
}
