import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { isTauri } from './api/client';
import { createMemoryApi } from './api/memory';
import { createTauriApi } from './api/tauri';
import { restoreCachedAppearance } from './state/appearance';
import './styles/index.css';

restoreCachedAppearance();

// Outside Tauri (a plain browser preview) the journal is a synthetic in-browser store.
const api = isTauri() ? createTauriApi() : createMemoryApi();

const root = document.getElementById('root');
if (!root) throw new Error('The page has no #root element.');

createRoot(root).render(
  <StrictMode>
    <App api={api} />
  </StrictMode>,
);
