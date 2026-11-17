import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { apiFetch } from '../../api';

// Polling interval: 5s while tab is visible (default; not tuned)
const STATS_POLL_INTERVAL_MS = 5000;

function RingGauge({ value, label }) {
  const radius = 42;
  const stroke = 6;
  const normalizedRadius = radius - stroke * 2;
  const circumference = normalizedRadius * 2 * Math.PI;
  const clampedValue = Math.min(100, Math.max(0, value));
  const strokeDashoffset = circumference - (clampedValue / 100) * circumference;

  return (
    <div className="flex flex-col items-center justify-center p-3">
      <div className="relative flex items-center justify-center">
        <svg height={radius * 2} width={radius * 2} className="transform -rotate-90">
          {/* Background circle */}
          <circle
            stroke="rgba(255, 255, 255, 0.1)"
            fill="transparent"
            strokeWidth={stroke}
            r={normalizedRadius}
            cx={radius}
            cy={radius}
          />
          {/* Active progress circle */}
          <circle
            stroke="#a3e635"
            fill="transparent"
            strokeWidth={stroke}
            strokeDasharray={`${circumference} ${circumference}`}
            style={{
              strokeDashoffset,
              transition: 'stroke-dashoffset 0.4s ease',
            }}
            strokeLinecap="round"
            r={normalizedRadius}
            cx={radius}
            cy={radius}
          />
        </svg>
        <div className="absolute text-xs font-bold text-[#e8ecef]">
          <motion.span layout="position">{Math.round(value)}%</motion.span>
        </div>
      </div>
      <motion.span layout="position" className="text-xs font-semibold text-[#9aa3ad] mt-2 tracking-wide uppercase">
        {label}
      </motion.span>
    </div>
  );
}

export default function StatsTab() {
  const [telemetry, setTelemetry] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;
    let timer = null;

    const fetchTelemetry = async () => {
      try {
        const response = await apiFetch('/api/system/telemetry');
        if (response.ok) {
          const data = await response.json();
          if (isMounted) {
            setTelemetry(data);
            setError(null);
          }
        } else {
          throw new Error(`HTTP ${response.status}`);
        }
      } catch (err) {
        if (isMounted) {
          setError('Failed to fetch system telemetry');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchTelemetry();
    timer = setInterval(fetchTelemetry, STATS_POLL_INTERVAL_MS);

    return () => {
      isMounted = false;
      if (timer) clearInterval(timer);
    };
  }, []);

  return (
    <div className="w-full h-full flex flex-col min-h-0 items-center justify-center">
      {loading && !telemetry && (
        <div className="text-xs text-[#9aa3ad]">
          <motion.span layout="position">Loading system telemetry...</motion.span>
        </div>
      )}

      {!loading && error && !telemetry && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-[#ff6b6b] text-xs text-center">
          <motion.span layout="position">{error}</motion.span>
        </div>
      )}

      {telemetry && (
        <div className="w-full flex items-center justify-around py-4">
          <RingGauge value={telemetry.cpu ?? 0} label="CPU" />
          <RingGauge value={telemetry.ram ?? 0} label="RAM" />
          <RingGauge value={telemetry.disk ?? 0} label="Disk" />
        </div>
      )}
    </div>
  );
}
