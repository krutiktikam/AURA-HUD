import { useState, useEffect } from 'react';
import { apiFetch } from '../api';

// Default polling intervals: 15s when collapsed, 5s when expanded (defaults; not tuned)
const POLL_INTERVAL_COLLAPSED_MS = 15000;
const POLL_INTERVAL_EXPANDED_MS = 5000;

export function derivePillState(supervisorStatus, healthReachable, healthData) {
  if (supervisorStatus?.state === 'port_in_use') return 'port_in_use';
  if (supervisorStatus?.state === 'failed') return 'failed';
  if (supervisorStatus?.state === 'restarting' || supervisorStatus?.state === 'starting') return 'restarting';

  if (!healthReachable) {
    return 'down';
  }

  if (healthData) {
    if (healthData.ollama_state === 'down' || healthData.ollama_state === 'model_missing') {
      return 'degraded';
    }
    return 'ready';
  }

  return 'down';
}

/**
 * Hook to track backend health and supervisor status.
 *
 * @param {boolean} isExpanded - Whether the island is currently expanded
 * @returns {{ pillState: string, supervisorStatus: { state: string, attempt: number }, healthData: object|null, isReachable: boolean }}
 */
export function useBackendStatus(isExpanded = false) {
  const isTauri =
    typeof window !== 'undefined' &&
    (Boolean(window.__TAURI_INTERNALS__) || Boolean(window.__TAURI__));

  const [supervisorStatus, setSupervisorStatus] = useState(
    isTauri ? { state: 'starting', attempt: 0 } : { state: 'unknown', attempt: 0 }
  );
  const [healthData, setHealthData] = useState(null);
  const [healthReachable, setHealthReachable] = useState(true);

  // Listen for Tauri supervisor "backend-status" event (Tauri only)
  useEffect(() => {
    if (!isTauri) return;

    let unlisten = null;
    let isMounted = true;

    import('@tauri-apps/api/event')
      .then(({ listen }) => {
        if (!isMounted) return;
        return listen('backend-status', (event) => {
          if (isMounted && event?.payload) {
            setSupervisorStatus(event.payload);
          }
        });
      })
      .then((un) => {
        if (!isMounted) {
          if (un) un();
        } else {
          unlisten = un;
        }
      })
      .catch(() => {
        // Plain browser fallback: invoke failures ignored
      });

    return () => {
      isMounted = false;
      if (unlisten) unlisten();
    };
  }, [isTauri]);

  // Poll /api/health with dynamic interval based on expanded/collapsed state
  useEffect(() => {
    let isMounted = true;
    let timer = null;

    const checkHealth = async () => {
      try {
        const res = await apiFetch('/api/health');
        if (res.ok) {
          const data = await res.json();
          if (isMounted) {
            setHealthData(data);
            setHealthReachable(true);
          }
        } else {
          if (isMounted) {
            setHealthReachable(false);
          }
        }
      } catch {
        if (isMounted) {
          setHealthReachable(false);
        }
      }
    };

    checkHealth();
    const intervalMs = isExpanded ? POLL_INTERVAL_EXPANDED_MS : POLL_INTERVAL_COLLAPSED_MS;
    timer = setInterval(checkHealth, intervalMs);

    return () => {
      isMounted = false;
      if (timer) clearInterval(timer);
    };
  }, [isExpanded]);

  const pillState = derivePillState(supervisorStatus, healthReachable, healthData);

  return {
    pillState,
    supervisorStatus,
    healthData,
    isReachable: healthReachable,
  };
}
