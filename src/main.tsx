import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import './fondvideo-workspace.css';
import './scelyo.css';
import './scelyo-music.css';
import './scelyo-clearvoice.css';
import './scelyo-quality-fixes.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
