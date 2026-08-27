import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { tauriAPI, desktopAPI } from './ipcBridge';

export { tauriAPI, desktopAPI };

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
