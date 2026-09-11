# ascii_buddy&lt;3

A retro, minimalist drawing and frame-by-frame animation tool that turns freehand drawings into ASCII art. See [ASCII_BUDDY_SPEC.md](ASCII_BUDDY_SPEC.md) for the full product and technical spec, and [DECISIONS.md](DECISIONS.md) for choices made along the way.

## Build

```bash
npm install
npm run build
```

This produces `dist/index.html` — one self-contained file with all JS, CSS, fonts and icons inlined. No CDN links, no runtime network requests. Target size is under ~2.5 MB (Phase 0 is well under 100 KB).

Other scripts:

```bash
npm run dev        # local dev server with hot reload
npm run typecheck  # tsc --noEmit
npm run test       # vitest — engine unit tests (grid math, ASCII conversion, ...)
```

## Hosting (recommended path for iPad)

Opening `dist/index.html` directly from disk on iPad doesn't work well (Safari restricts local-file storage and some APIs), so host it for free instead:

- **GitHub Pages** — commit `dist/index.html` (as `index.html`) to a repo and enable Pages.
- **Netlify Drop** — drag the `dist` folder onto [app.netlify.com/drop](https://app.netlify.com/drop).
- **itch.io** — create an HTML project and upload `dist/index.html`.

All three serve over HTTPS, which several features require: the Clipboard API, Web Share, WebCodecs (video export), persistent storage, and service workers.

Once hosted, open the URL in Safari on iPad, then **Share → Add to Home Screen**. The app then runs full-screen with its own icon.

**Storage note:** a home-screen web app and a plain Safari tab have *separate* storage origins — projects made in one won't show up in the other. Pick one (the home-screen app is recommended) and use project files (`.buddy`, arriving in Phase 8) to move work between them if you ever need to.

## Local iPad testing during development

```bash
npm run dev -- --host
```

Then open `http://<your-computer's-ip>:5173` on the iPad, on the same Wi-Fi network. Drawing and most UI works this way, but HTTPS-only features won't. For those, either:

- add `@vitejs/plugin-basic-ssl` to `vite.config.ts` and accept the certificate warning on the iPad, or
- deploy a preview build (e.g. a Netlify preview) and test against that.

If you have a Mac, you can also debug the iPad over a cable with Safari's Web Inspector (Safari → Develop → *your iPad* → the page).

## What "opened from disk" degrades to

If `dist/index.html` is opened directly as a local file (double-click, or `file://` in a browser), IndexedDB is unavailable in some browsers for that origin. The app still loads and is fully navigable, but shows a banner explaining that projects won't be saved, and suggests hosting it or using a local dev server instead.

## Project status

Currently through **Phase 2 — ASCII engine (Ramp)** of the build plan in [ASCII_BUDDY_SPEC.md §19](ASCII_BUDDY_SPEC.md#19-build-phases). See [TESTING.md](TESTING.md) for the manual iPad checklist.
