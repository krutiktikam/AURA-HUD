import React, { useState, useEffect } from 'react';

const Stats = () => {
  const [cpuUsage, setCpuUsage] = useState(0);
  const [ramUsage, setRamUsage] = useState(0);
  const [diskUsage, setDiskUsage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await fetch('http://localhost:8000/api/system/telemetry');
        if (response.ok) {
          const data = await response.json();
          setCpuUsage(data.cpu || 0);
          setRamUsage(data.ram || 0);
          setDiskUsage(data.disk || 0);
          setError(null);
        } else {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
      } catch (err) {
        setError('Failed to fetch system stats');
        // Generate mock data for demonstration
        setCpuUsage(Math.floor(Math.random() * 80));
        setRamUsage(Math.floor(Math.random() * 90));
        setDiskUsage(Math.floor(Math.random() * 70));
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
    const interval = setInterval(fetchStats, 5000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="p-4 text-center">
        <div className="animate-pulse rounded-full h-8 w-8 bg-lime-400/20 inline-block mb-2"></div>
        <p className="text-white/60">Loading system stats...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-center text-red-400">
        <p>{error}</p>
        <p className="text-xs mt-2">Showing mock data</p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-6">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-white/60 font-medium">CPU Usage</span>
          <span className="text-lime-400 font-semibold">{cpuUsage}%</span>
        </div>
        <div className="w-full bg-white/10 rounded-full h-2.5 overflow-hidden">
          <div
            className={`h-full bg-lime-400 transition-all duration-500 w-[${cpuUsage}%]`}
          ></div>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-white/60 font-medium">RAM Usage</span>
          <span className="text-lime-400 font-semibold">{ramUsage}%</span>
        </div>
        <div className="w-full bg-white/10 rounded-full h-2.5 overflow-hidden">
          <div
            className={`h-full bg-lime-400 transition-all duration-500 w-[${ramUsage}%]`}
          ></div>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-white/60 font-medium">Disk Usage</span>
          <span className="text-lime-400 font-semibold">{diskUsage}%</span>
        </div>
        <div className="w-full bg-white/10 rounded-full h-2.5 overflow-hidden">
          <div
            className={`h-full bg-lime-400 transition-all duration-500 w-[${diskUsage}%]`}
          ></div>
        </div>
      </div>

      <div className="text-xs text-white/50 mt-4">
        Last updated: {new Date().toLocaleTimeString()}
      </div>
    </div>
  );
};

export default Stats;