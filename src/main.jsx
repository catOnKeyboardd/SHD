import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App.jsx';
import './styles/global.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {/* Hash URLs (#/kiosk): GitHub Pages cannot rewrite deep links to index.html. */}
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>
);
