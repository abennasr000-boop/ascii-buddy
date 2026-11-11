import { render } from 'preact';
import { App } from './App';
import { installHeadAssets, preventPageGestures } from './bootstrap';
import { installAutosaveFlushers } from './state/autosave';
import './style.css';

installHeadAssets();
preventPageGestures();
installAutosaveFlushers();

render(<App />, document.getElementById('root')!);

// Optional offline copy of the app (public/sw.js). Only when hosted over http(s) — not from a file, not in dev.
if (import.meta.env.PROD && 'serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => undefined);
  });
}
