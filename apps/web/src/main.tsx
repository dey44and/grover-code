import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/exo/wght.css';
import { App } from './App';
import './styles.css';

const root = document.getElementById('root');
if (root === null) throw new Error('Elementul #root lipseste din document.');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
