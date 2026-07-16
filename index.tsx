import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error(
    'LexForge could not find #root. Ensure index.html includes <div id="root"></div>.',
  );
}

// Dark-first shell before React paints (matches brand-bg-primary #0c0c0d).
document.documentElement.style.colorScheme = 'dark';

createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
