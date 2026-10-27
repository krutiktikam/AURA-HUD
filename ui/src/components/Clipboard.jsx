import React, { useState, useEffect } from 'react';
import { API_BASE } from '../config';

const Clipboard = () => {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const response = await fetch(`${API_BASE}/api/clipboard/history?limit=20`);
        if (response.ok) {
          const data = await response.json();
          setHistory(data.history || []);
          setError(null);
        } else {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
      } catch (err) {
        setError('Failed to fetch clipboard history');
        // Generate mock data for demonstration
        setHistory([
          {
            content: "Hello world example text...",
            category: "text",
            timestamp: new Date(Date.now() - 2 * 60 * 1000).toISOString()
          },
          {
            content: "const example = () => { return 'code'; };",
            category: "code",
            timestamp: new Date(Date.now() - 5 * 60 * 1000).toISOString()
          },
          {
            content: "https://example.com/article",
            category: "url",
            timestamp: new Date(Date.now() - 10 * 60 * 1000).toISOString()
          }
        ]);
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();

    // Update every 10 seconds
    const interval = setInterval(fetchHistory, 10000);
    return () => clearInterval(interval);
  }, []);

  const filteredHistory = history.filter(item =>
    item.content.toLowerCase().includes(query.toLowerCase()) ||
    item.category.toLowerCase().includes(query.toLowerCase())
  );

  if (loading) {
    return (
      <div className="p-4 text-center">
        <div className="animate-pulse rounded-full h-8 w-8 bg-lime-400/20 inline-block mb-2"></div>
        <p className="text-white/60">Loading clipboard history...</p>
      </div>
    );
  }

  if (error && history.length === 0) {
    return (
      <div className="p-4 text-center text-red-400">
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {/* Search Bar */}
      <div className="flex space-x-2 mb-4">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search clipboard history..."
          className="flex-1 bg-white/10 rounded-xl px-3 py-2 text-white placeholder-white/50 outline-none focus:outline-none focus:ring-2 focus:ring-lime-400"
        />
        <button
          onClick={() => setQuery('')}
          className="bg-white/10 hover:bg-white/20 rounded-xl px-3 py-2 text-white/60 hover:text-white transition-colors"
        >
          Clear
        </button>
      </div>

      {/* History List */}
      <div className="space-y-3">
        {filteredHistory.length > 0 ? (
          filteredHistory.map((item, index) => (
            <div key={index} className="bg-white/5 rounded-xl p-4">
              <div className="flex items-center space-x-2 mb-2">
                <div
                  className={`w-3 h-3 rounded-full
                    ${item.category === 'text' ? 'bg-blue-400' :
                      item.category === 'code' ? 'bg-lime-400' :
                      item.category === 'url' ? 'bg-purple-400' :
                      item.category === 'json' ? 'bg-pink-400' :
                      'bg-gray-400'}
                  `}
                ></div>
                <span className="text-white/60 text-xs capitalize">{item.category}</span>
              </div>

              <p className="text-white/80 break-words line-clamp-3">{item.content}</p>

              <div className="flex items-center justify-between mt-2">
                <span className="text-white/50 text-xs">
                  {new Date(item.timestamp).toLocaleString()}
                </span>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(item.content);
                  }}
                  className="text-white/60 hover:text-white text-xs"
                >
                  Copy
                </button>
              </div>
            </div>
          ))
        ) : (
          <div className="text-center py-8">
            <p className="text-white/60">No clipboard history found</p>
            {query && (
              <p className="text-white/50 text-xs mt-2">
                Try clearing the search filter
              </p>
            )}
          </div>
        )}
      </div>

      {/* Stats Bar */}
      <div className="mt-4 pt-3 border-t border-white/10 text-xs flex items-center justify-between">
        <span className="text-white/60">Total items: {history.length}</span>
        <span className="text-white/60">Showing: {filteredHistory.length}</span>
      </div>
    </div>
  );
};

export default Clipboard;