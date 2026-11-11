# iPad / iPadOS Safari — field notes for web apps

Everything here was learned building **ascii_buddy<3** (Preact + TypeScript + Vite, single-file build, IndexedDB, Canvas 2D, Apple Pencil + touch) with the developer testing on a real iPad after every phase. It is written to be pasted into a future project's context: precise, technical, and honest about what was *confirmed on the device* versus *inferred*.

**Legend** — **[iPad]** = reported/observed on the real device and fixed against that report. **[desktop-verified]** = implemented and tested in desktop Chromium only; the iPad behaviour is expected but not confirmed. **[spec]** = well-known platform behaviour I relied on but did not see fail.

Notation: file paths refer to this repo (`src/…`) for the reference implementation.

---

## 0. The five lessons that cost the most time

1. **Desktop Chromium hides the bugs.** Almost every serious bug below (data loss, project mix-ups, stuck drags, hidden menu bar, scroll-vs-drag) was invisible or "not reproducible" on desktop. iPad storage is slower, touch has no hover and no mouse-drag-to-scroll, and the status bar overlaps content. Test on the device after every feature, not at the end.
2. **Anything asynchronous that touches persisted state must be serialised, latest-wins, and flushed before the state it reads changes.** (§6.)
3. **Touch needs a deliberate gesture for anything destructive or rearranging, and the *easy* gesture must be scrolling.** (§3.4.)
4. **Every element that overlaps an interactive element must either be interactive on purpose or `pointer-events: none`.** A transparent `<canvas>` hit-tests over its *whole box*. (§3.6.)
5. **APIs gated on a user gesture (Web Share, file pickers, clipboard) die if you `await` something slow first.** Split into two taps. (§5.1.)

---

## 1. Delivery, hosting, origins

- **Home-screen web app ≠ Safari tab.** Separate storage (IndexedDB, localStorage, caches) *per install mode*. Projects made in one do not exist in the other. Tell users to pick one (home-screen recommended) and give them a file export/import (`.buddy` zip) as the bridge and the backup. **[spec, designed for it]**
- **`file://` is not a viable delivery.** Safari restricts storage for local files. Host over HTTPS (GitHub Pages / Netlify Drop / itch.io). Degrade gracefully anyway: catch the IndexedDB open failure, show a banner, keep the app navigable (`StorageUnavailableError` in `src/db/db.ts`). **[desktop-verified]**
- **HTTPS-only APIs** (secure context): Clipboard API, Web Share, WebCodecs, `navigator.storage.persist()`, service workers. A LAN dev server over plain `http://<ip>:5173` runs the UI and drawing but not these — use `@vitejs/plugin-basic-ssl` (accept the cert warning) or a deploy preview.
- **Stale app after a deploy** **[iPad]**: the developer once saw a tool still greyed out after a fix shipped ("did you do the update?") — refreshing fixed it. With a service worker (stale-while-revalidate, `public/sw.js`) the *new* version appears the **next** launch, so tell the user: open once online, then fully close and reopen. Keep the SW optional; the app must work without it.
- **Single-file build** (`vite-plugin-singlefile`): all JS/CSS/fonts/icons inlined; workers via `?worker&inline` with `worker: { format: 'iife' }` (older iPadOS Safari loads IIFE workers; ES-module workers are the risky ones). `assetsInlineLimit` huge so fonts become data URIs. Code-split heavy, rarely used libraries (`import('./mp4')` for Mediabunny) — the file went 285 kB → 585 kB with gifenc + Mediabunny instead of 1.1 MB. **[desktop-verified]**
- **Manifest + icons at runtime:** the `<link rel=manifest>` is a `data:` URI and icons are inlined base64 (`src/bootstrap.ts`), so there are no extra files to host. `apple-mobile-web-app-capable`, `-status-bar-style: black-translucent`, `apple-touch-icon` 180 px. **[iPad, shipped]**

## 2. Viewport, safe areas, chrome

- Meta: `width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover`.
- **`viewport-fit=cover` + `black-translucent` status bar draws the page *under* the status bar.** **[iPad]** The first version had the menu bar directly beneath the Wi-Fi/battery icons — untappable. Fix: pad the root with `env(safe-area-inset-top/right/bottom/left)` (a no-op = 0 in a plain Safari tab, so it is safe everywhere).
- **`position: fixed` bypasses the root's padding.** **[iPad]** Floating windows rendered under the status bar/menu bar. Add the `env()` insets to fixed elements' own `top/left/right` (`FloatingWindow`, `.ab-focus-exit`).
- **Persisted window positions must be clamped, not trusted.** **[iPad]** A position saved (localStorage) before a layout fix overrode the new default forever. Use a CSS floor: `top: max(stored + inset, inset + var(--menubar-height) + gap)`; keep the bar height in one CSS custom property. Also leave a gap: two adjacent 1 px borders read as one thick line.
- **Use `100dvh`** (dynamic viewport) for the root height, not `100vh`, or the bottom bar hides behind Safari's toolbar in a tab.
- **Hit targets ≥ 44 × 44 pt.** **[iPad]** 32 px menu bar and icon buttons were called out as a tap-precision problem once the controls did real work. Bars are 44 px; icon buttons fill them. On-canvas handles: ~24 px worked, 32 px looked oversized once they were actually usable, 28 px and below (after zoom counter-scaling errors) were missed.
- **Counter-scale on-canvas handles by the *product* of every scale in the stack** (object scale × viewport zoom). **[iPad]** Handles were computed against the object scale only and shrank to a few px at fit-to-screen zoom, so taps landed on the image (move) instead of the handle (scale/rotate).
- **Orientation:** re-apply orientation-dependent defaults on `resize` when the viewport crosses the portrait/landscape line (the timeline default flips expanded/collapsed) — computing once at load was wrong after rotation. **[iPad]**
- **Global CSS for a canvas-app shell:** `user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; overscroll-behavior: none` on `html, body`; `touch-action: none` on the drawing surface.
- Phones are not a target; show a one-line "Works best on iPad or desktop" note under ~600 px.
- **Icons must be drawn at integer multiples of their pixel grid** (16 px grid → 16 / 32 px). Non-integer sizes (14, 18, 20, 22, 28 px) with `shape-rendering: crispEdges` give uneven, "fuzzy" pixels on retina iPad. **[iPad feedback, fixed]** Hand-drawn bitmaps beat rule-generated ones; render a contact sheet to review them. Don't use text glyphs (`▶ ◀ ↶ ▲`) as icons: their weight/size differ by font and they look inconsistent.

## 3. Input model (Pointer Events)

### 3.1 Basics
- Use **Pointer Events**, branch on `event.pointerType`: `'pen'` (Apple Pencil), `'touch'`, `'mouse'`. Do not use `touch*` events for logic (except the two `preventDefault` cases below).
- **Pencil draws; fingers navigate** (pan/zoom); finger-drawing is an opt-in setting. **Palm rejection:** keep a `penActive` flag set on pen `pointerdown` and cleared on `pointerup`/`pointercancel`/`lostpointercapture`; ignore touch pointers while it is set. `src/canvas/DrawingCanvas.tsx`.
- Drawing surface: `touch-action: none`. Block page pinch zoom: `gesturestart`/`gesturechange` → `preventDefault`, and a `touchmove` listener with `{ passive: false }` that `preventDefault`s when `touches.length > 1` (`src/bootstrap.ts`).
- **Two-finger tap = undo, three-finger tap = redo:** track the peak simultaneous touch count and the duration/movement; treat as a tap if it ends < ~250 ms without moving. Use only the first two pointers for pan/pinch math; a third finger only feeds the tap counter. **[iPad, works]**
- One-finger **long-press = eyedropper** (timer ~450 ms, cancelled by movement / second finger).
- No hover on touch: "hover previews" are desktop-only; don't rely on them for discoverability.

### 3.2 Pointer capture
- `setPointerCapture` **can throw** (`NotFoundError`) if the pointer was released between the event and the call. Wrap it (`src/ui/pointerCapture.ts`).
- **Capture re-targets the matching `pointerup`.** **[iPad]** A draggable title bar that captured on `pointerdown` swallowed the click on its own close button. Fix: `stopPropagation` on the button's `pointerdown` (`Window.tsx`).
- Listen for **`lostpointercapture`** as a second cleanup path next to `pointerup`/`pointercancel`; add a last-resort **no-movement watchdog** (2 s) that clears drag state. **[iPad]** A "drag worked once then never again" bug looked like a stuck `dragRef` — the watchdog/lostpointercapture defenses were added, but the actual cause turned out to be §3.6; keep them anyway, they are cheap.
- Never gate *starting* a gesture on a counter that could get stuck (`touchCount > 0`). Gate on the single source of truth for "a drag is active" instead.

### 3.3 Don't break sibling gesture recognisers
- **`stopPropagation` on `pointerdown` in a child can starve the parent's multi-touch counting.** **[iPad]** A reference-image drag handler stopped propagation, so the canvas never saw that finger and a second finger could not start pinch-zoom. Let events bubble; make the parent's handler a no-op for the current mode.
- An effect that installs the canvas's pan/zoom listeners must not be conditional on an element that exists only in some modes. **[iPad]** With a *reference* track selected the drawing `<canvas>` was not rendered, `canvasRef.current` was `null`, the effect bailed and **no pan/zoom worked at all**. Gate on the container; re-read optional refs at the point of use.

### 3.4 Scroll vs drag (the timeline lesson) **[iPad]**
Symptom: with 189 frames, swiping the horizontal strip **reordered frames instead of scrolling**.
- Rule: **the easy gesture must be scrolling; the deliberate gesture rearranges.** Touch/pen: swipe scrolls (`touch-action: pan-x` on the strip, `pan-x pan-y` on grid cells), tap selects, **long-press (~450 ms) then drag reorders**. Mouse: drag reorders immediately (a mouse cannot scroll by dragging).
- Implementation: on touch `pointerdown` start a long-press timer; if the finger moves > ~8 px before it fires, **abandon the press** and let the browser scroll (do nothing). Once armed (long-press fired) capture the pointer and start blocking scroll with a **non-passive `touchmove` listener** that calls `preventDefault()` *only while armed* (`Timeline.tsx`). Haptic tick: `navigator.vibrate?.(8)` (no-op on iOS, harmless).
- **Select on release, not on press**, in scrollable regions, and only if the finger barely moved (`TAP_MAX_MOVE_PX`), otherwise scrolling selects whatever is under the finger.
- Reorder must apply **once, on release**, with an insertion marker while dragging. Live re-keying/re-ordering of DOM under a captured pointer was laggy and made items jump. **[iPad]**
- Add edge auto-scroll while dragging near the strip ends.
- Selection UX that survived feedback: long-press starts a selection; taps then **toggle frame-by-frame**; a separate **Range** toggle gives "everything between anchor and tapped". (The first design, tap-extends-a-range by default, was rejected as friction.)
- Don't add a scrubber slider "just in case" — it was built and immediately declared useless once scrolling worked.

### 3.5 Programmatic scrolling
- **`scrollIntoView` is unreliable inside iOS scroll containers** (it also scrolls ancestors). Compute `scroller.scrollLeft += elementCentre − viewportCentre` explicitly, accounting for sticky columns (`GRID_HEADER_INSET_PX`). **[iPad-motivated, desktop-verified]** Also re-centre on transport buttons even if the current item didn't change (pressing "|◀" while already on frame 1 after scrolling away must scroll back).
- Avoid nested `overflow:auto` lists inside floating panels: reaching lower items meant scrolling a cramped inner list. Use a separate small floating window for secondary controls. **[iPad feedback]**

### 3.6 Hit-testing pitfalls **[iPad, root cause of a long-running bug]**
- **A `<canvas>` hit-tests across its entire box regardless of which pixels are opaque.** A decorative canvas (other tracks' read-only render, the ASCII overlay) sitting above an interactive layer silently stole every tap inside the canvas bounds. Symptom that gave it away: handles worked when the image was *larger* than the canvas (handles lay outside the covering canvas) and failed when smaller. Fix: `pointer-events: none` on every purely visual layer. Diagnose with `document.elementFromPoint(x, y)` at the handle's centre.
- DOM/paint order, not element size, decides who wins an overlapping hit-test.

## 4. Canvas, memory, rendering

- **Max canvas area ≈ 16,777,216 px (4096×4096) on iOS Safari; total canvas memory is also limited and the tab is reloaded if you exceed it.** Refuse export sizes above that in the UI instead of failing halfway (`MAX_EXPORT_PIXELS`). **[spec; enforced]**
- **Only the current frame's cels live as canvases;** everything else stays compressed (deflate of the bbox-cropped indexed buffer) and is decoded on demand. Release canvases explicitly (`canvas.width = canvas.height = 0`). Playback caches all frames at **one shared reduced resolution** to fit a ~150 MB budget rather than caching some frames full-size and dropping the rest (a 189-frame 2048×1536 project plays at ≈0.18×). **[iPad long-clip report → fix desktop-verified]**
- **Never `fillText` per cell per frame.** Build a glyph atlas (per char × color, cell-sized) and `drawImage` from it; rebuild debounced after zoom/columns settle. Crisp glyphs: threshold glyph alpha — but at small cell sizes a fixed 50 % threshold erases thin glyphs entirely (`|`, `'`, `.`); threshold at min(50 %, 50 % of the glyph's own peak) (`engine/glyphMask.ts`).
- **Wait for fonts before measuring or rasterising:** `await document.fonts.load('32px <family>')` then `document.fonts.ready`. Building the atlas before the font loads gives wrong metrics; and if the first frame arrives *after* the atlas was due, build it lazily in the render effect or the view stays blank forever. **[iPad-adjacent bug, fixed]**
- `imageSmoothingEnabled = false` for crisp pixel art; smooth only for photographic references and tiny thumbnails (nearest-neighbour shrinking a photo 4× is noise; shrinking 1–4 px lines to a thumbnail turns them into dots).
- Handle `devicePixelRatio`; size the backing store to the on-screen cell size (clamped), let CSS scale between rebuilds.
- Heavy per-frame work (shape matching) belongs in a Web Worker with a **main-thread fallback** if `new Worker` throws or errors; structured-clone the inputs so later in-place edits can't race the worker.
- Yield to the UI (`setTimeout(0)`) every few frames in long loops so progress bars paint and Cancel works; expose `AbortSignal`.
- **rAF is throttled in a hidden pane/tab**; timing tests must run in a visible tab.

## 5. Files, media, sharing

### 5.1 Share / download
- **Web Share (`navigator.share({files})`) requires transient user activation.** A long render between the tap and `share()` consumes it. Pattern: tap **Export** → render with progress → show a **result panel** with fresh **Share…** and **Download** buttons (`ui/DeliverPanel.tsx`). Check `navigator.canShare({ files })` first and only show Share when true. Treat `AbortError` as "user dismissed".
- Download: `<a download>` + `URL.createObjectURL`, revoke after ~60 s. Multi-file deliverables → zip them (sharing two files at once is unreliable).
- `.buddy`/unknown extensions: **do not put them in an `<input type=file accept>`** — iOS greys out files it doesn't recognise. Use no `accept` and validate the content. Use `accept="image/*"` and `video/*,.mov,.mp4,.m4v` for media.

### 5.2 Import
- **`navigator.clipboard.read()` for images is inconsistent on iPadOS Safari and needs HTTPS; it failed silently.** **[iPad]** Primary path is a real **file picker** (`<input type=file accept="image/*" multiple>` triggered by a button — the universally reliable iOS pattern; also opens Photos/Files/Camera). Keep clipboard as a secondary path and **always show an alert on failure**. The `paste` DOM event works for the system paste gesture.
- Drag & drop from Photos/Files works in Split View; route one image to the quick path, several to the options dialog.
- **Video → frames:** `HTMLVideoElement` + one `seeked` per sample + draw to canvas is the path that already plays iPhone `.mov`/HEVC and `.mp4` on iPadOS with zero codec code. Wrap `requestVideoFrameCallback` with a ~250 ms cap so a missing callback can't hang; resolve unknown durations by seeking past the end. **[desktop-verified only; real HEVC/iPad speed still to confirm]**
- Downscale imported images to at most the canvas size (memory); bake crop/stretch into the stored bitmap instead of relying on a transform the renderer can't express.

### 5.3 Export
- WebCodecs H.264 (`VideoEncoder.isConfigSupported` / Mediabunny `canEncodeVideo('avc', {width, height})`) — check *with the actual size*, force even dimensions, fall back to `MediaRecorder` on `canvas.captureStream()` (real-time), and finally tell the user to use GIF. **[desktop-verified; iPad encoder unverified]**
- PDF: fflate's `deflateSync` is *raw* DEFLATE; PDF `/FlateDecode` needs zlib framing → `zlibSync`. (Verified by rendering the PDF with macOS's engine; the wrong one silently gave blank pages.)
- GIF: delays are integer centiseconds and browsers treat < 2 cs as 10 cs; use cumulative rounding; per-frame exact palettes when ≤ 256 colours; transparent GIFs need dispose-to-background on **every** frame.

## 6. Persistence and data integrity **[iPad — the most damaging bugs]**

- **Debounced autosave that saves "whatever is live when the timer fires" loses data when the user changes context inside the debounce window.** Symptom reported: "content disappears when I add the next frame, as if I pressed undo". Fix: flush **before** replacing the live buffer; every operation that *reads stored data* (duplicate, delete, playback start, export, leave screen) flushes first.
- `flush()` must return a promise for **everything in flight**, not just what it started; read the project at *write time* (after awaits) so an older snapshot can never land after a newer one.
- **Serialise async reloads, latest-wins**, and make `undo` wait for the newest reload; a superseded reload that returns early must not resolve callers before data is loaded (undo silently did nothing across frames).
- **Module-level state must be reset between screens/projects** (`resetEditorSession()`): live buffers, stats, previews, selection, playback, caches, pending reloads. Otherwise the next project briefly (or, with a late async load, permanently) shows the previous project's data — on iPad's slower storage this presented as "projects get shuffled". Also cancel queued reloads on leave.
- **Never re-read the whole list from storage on every screen mount** and replace the in-memory list: it can return an *older* copy of a project whose save is still in flight, then the next save writes the old copy back. Load once, keep in memory, sort synchronously (with an id tiebreak) so the grid can't re-order under a finger (which also caused "tapped project A, opened B").
- Save order: write cels/images first, the project record last; roll back partial imports. Orphaned records are cleaned on load.
- Flush on **`visibilitychange → hidden` and `pagehide`** — iPadOS kills background tabs without warning.
- Ask for `navigator.storage.persist()` when the first project is created; show granted/denied and explain; tell users project files are the real backup. Handle `QuotaExceededError` with an alert that offers *Export project file* on the spot (and surface storage errors in the editor, not only on the home screen).
- Images/blobs keyed by id alone must be **copied** when a project is duplicated, and reference-counted when frames are deleted (deleting a copy's frame deleted the original's shared image).
- IndexedDB structured clone stores `Uint8Array`, `Blob`, `undefined` fine; keep records small; store empty cels as nothing.

## 7. Workflow that worked with a real device

- `npm run dev -- --host` and open `http://<mac-ip>:5173` on the iPad (same Wi-Fi). For HTTPS-only features use basic-ssl or a Netlify preview. Mac + cable → Safari **Develop → iPad → page** Web Inspector (console, elementFromPoint, storage).
- **Stop for device testing after every phase** and keep a `TESTING.md` checklist with concrete pass/fail lines; the developer's notes ("test 3: multi-select works but no bold border in the expanded view") drove most fixes. Fix validated bugs first, then move on when told.
- Simulating touch on desktop (`new PointerEvent('pointerdown', {pointerType:'touch', …})`) reproduces *logic* (long-press timers, selection, reorder) but **not** native scrolling/`touch-action` behaviour, momentum, or the status-bar/safe-area problems. Say so in the checklist and ask the user to confirm on the device.
- Timing-dependent bugs (project mix-up) were not reproducible with a single desktop pass; a **stress script** (30 rapid open/leave cycles, leaving at 0/30/80/200 ms) plus reading the code for *every* mechanism was what closed it.
- Record root causes in a `DECISIONS.md` as you go, including wrong theories (a defensive fix for "stuck drag" was added before the real cause — an overlapping canvas — was found; leave a note so nobody trusts the wrong theory later).

## 8. Bug → cause → fix catalogue (from real iPad reports)

| Reported | Cause | Fix |
|---|---|---|
| Menu bar unreachable in home-screen app | `viewport-fit=cover` + translucent status bar draws under it | `env(safe-area-inset-*)` padding on root; 44 px bar |
| Windows rendered under menu bar | `position:fixed` ignores root padding; stale saved positions | add `env()` to fixed elements; CSS `max()` floor |
| "Reference import does nothing" | `clipboard.read()` images unsupported/silent | file input as primary path; alert on clipboard failure |
| Can't pan/zoom with a reference track selected | gesture effect gated on a canvas that wasn't rendered | gate on the container only |
| Handles too small to hit | scaled by object scale only | counter-scale by object scale × viewport zoom |
| Two-finger gestures broke during a drag | child `stopPropagation` hid the finger from the parent | let it bubble; parent no-ops in that mode |
| Handles work only when image ≥ canvas | decorative `<canvas>` above them stole hits | `pointer-events:none` on visual-only layers |
| Content vanishes when adding a frame | debounced save wrote the *new* (blank) live cel | flush before swapping live buffers |
| Undo across frames does nothing | superseded reload resolved early | callers await the newest reload |
| Projects shuffle / wrong project opens | list reloaded + re-sorted after appear; stale saves; no per-project reset | load once; sync deterministic sort; flush-await; `resetEditorSession()` |
| Timeline reorders instead of scrolling | `touch-action:none` + 8 px drag = reorder | `pan-x`; long-press to arm; block touchmove only when armed |
| "|◀ stuck at frame 5" | consequence of the above + `scrollIntoView` | explicit `scrollLeft` maths + re-centre on every transport press |
| Reference images frozen during playback | playback cache ignored per-frame references | composite references per frame at a shared reduced resolution |
| Blank ASCII view after a settings change | atlas built before the first frame/font existed | build atlas lazily in the render path; await font load |
| Thin glyphs vanish at small sizes | fixed 50 % crisp threshold | threshold relative to glyph peak |
| Fuzzy, off-centre icons | rule-generated bitmaps at non-integer sizes | hand-drawn 16×16 bitmaps at 16/32 px only |

## 9. Still unverified on a real iPad (as of 1.0)

- Pencil latency at 120 Hz with the ASCII overlay; the 100-frame / 4 GB memory case.
- HEVC `.mov` video import speed/quality; WebCodecs H.264 encode on iPadOS; `MediaRecorder` fallback.
- Web Share with each file type (zip, gif, mp4, pdf, html); `.buddy` AirDrop round trip.
- Service-worker offline launch from the Home Screen; the persistence prompt behaviour.
- Long-press-then-drag reorder *feel* (timing constants 450 ms / 8 px are guesses tuned on desktop).

## 10. Starter checklist for the next iPad-targeted web project

1. Meta tags + `env(safe-area-inset-*)` root padding + `100dvh` + 44 pt targets from day one.
2. Pointer Events only; `touch-action` set on every interactive surface; `pointer-events:none` on every decorative overlay.
3. Wrap `setPointerCapture`; handle `pointercancel` and `lostpointercapture`; never let a child swallow events a parent counts.
4. Decide the scroll-vs-drag rule before building any list/strip (swipe scrolls, long-press arms).
5. File picker for import, two-step (render → Share/Download) for export, `.zip` for multi-file.
6. IndexedDB with a single in-memory source of truth, flush-before-read, serialised latest-wins loads, reset-on-navigation.
7. Canvas budget: one live frame, compressed rest, ≤ 16.7 MP per canvas, shared reduced-resolution caches, worker with fallback.
8. Single-file build (inline workers as IIFE), code-split big optional libraries, optional service worker.
9. Backup story on day one (export/import file, "last backup" indicator, persistent-storage request, quota alert).
10. A `TESTING.md` device checklist and a `DECISIONS.md` that records root causes (and retracts wrong theories).
