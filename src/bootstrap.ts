// Runtime <head> setup that needs to stay inside the single HTML file:
// icon <link>s (as base64 data URIs, so Vite inlines the PNGs into the JS
// bundle rather than emitting separate files) and a data-URI web app
// manifest. Also blocks page-level pinch-zoom so gestures are free for the
// canvas (ASCII_BUDDY_SPEC.md §6.2).
import icon32 from './assets/icons/icon-32.png';
import icon180 from './assets/icons/icon-180.png';
import icon192 from './assets/icons/icon-192.png';
import icon512 from './assets/icons/icon-512.png';

function addLink(rel: string, href: string, extra: Record<string, string> = {}) {
  const link = document.createElement('link');
  link.rel = rel;
  link.href = href;
  for (const [k, v] of Object.entries(extra)) link.setAttribute(k, v);
  document.head.appendChild(link);
}

export function installHeadAssets() {
  addLink('icon', icon32, { type: 'image/png', sizes: '32x32' });
  addLink('apple-touch-icon', icon180, { sizes: '180x180' });

  const manifest = {
    name: 'ascii_buddy<3',
    short_name: 'ascii_buddy',
    display: 'standalone',
    start_url: '.',
    background_color: '#ffffff',
    theme_color: '#ffffff',
    icons: [
      { src: icon192, sizes: '192x192', type: 'image/png' },
      { src: icon512, sizes: '512x512', type: 'image/png' },
    ],
  };
  const manifestUri = `data:application/manifest+json,${encodeURIComponent(JSON.stringify(manifest))}`;
  addLink('manifest', manifestUri);
}

export function preventPageGestures() {
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('gesturechange', (e) => e.preventDefault());
  document.addEventListener(
    'touchmove',
    (e) => {
      if (e.touches.length > 1) e.preventDefault();
    },
    { passive: false },
  );
}
