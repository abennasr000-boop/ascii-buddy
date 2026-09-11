# Manual iPad testing checklist

Updated every phase. Test on a real iPad in Safari unless noted.

## Setup

- [ ] `npm run build`, then host `dist/index.html` (see README.md) or serve it over `npm run dev -- --host` on the same Wi-Fi for a quick check (some features need HTTPS — see README).
- [ ] Open the hosted URL in Safari.
- [ ] Share → Add to Home Screen, then open the app from the home-screen icon (this is a *separate* storage origin from the Safari tab — see README).

## Phase 0 — Foundations

Run each of these twice: once in a plain Safari tab, once in the home-screen app.

- [ ] App loads to the "Projects" window within ~2 seconds. Title bar reads "ascii_buddy<3".
- [ ] Home screen shows the dithered desktop pattern behind the window (should read as a soft gray, not a harsh checkerboard).
- [ ] Empty state: a fresh install shows "No projects yet." with a New project button.
- [ ] Tap **New project**: dialog shows canvas shape presets (4:3 selected by default), a resolution slider with live "N × M characters" readout, background color, FPS. Drag the columns slider — the readout updates live.
- [ ] Pick the "Terminal 80×24" preset — readout should read exactly 80 × 24, size 2048 × 1228px.
- [ ] Tap **Create** — app navigates into the Editor, showing the menu bar, a placeholder canvas sized to the chosen aspect ratio, and a placeholder timeline strip.
- [ ] In the Editor, tap the ▣ menu → **About ascii_buddy<3** — dialog shows version and font credit; OK closes it.
- [ ] ▣ menu → **App settings…** — toggles respond to tap, "Storage used" shows a real number, **Request** grants persistent storage (button changes to "Granted" — may not be grantable in a plain tab, only from the home-screen app on some iOS versions).
- [ ] ▣ menu → **Back to projects** (also File → Close project) returns to Home; the new project's thumbnail/name/date appear in the grid.
- [ ] Force-quit Safari (or the home-screen app) and reopen — the project is still there.
- [ ] On the project's **…** menu: Rename (typing + Return or the Rename button), Duplicate (appears as "<name> copy"), Delete (confirms with "Delete '<name>'? This can't be undone.", then removes it).
- [ ] Rotate the iPad between portrait and landscape while on Home and while in the Editor — layout reflows without clipping or overlapping the menu bar.
- [ ] Open Split View with another app at a narrow width — menu bar's right-side icons should scroll horizontally rather than break the layout.
- [ ] Tap through every menu in the Editor's menu bar (File/Edit/View/Frame/Layer/ASCII) — items are visibly dithered/disabled and do nothing when tapped, except File → Close project.
- [ ] With no network connection (Airplane Mode) after the initial load, the app continues to work fully (create/rename/duplicate/delete projects, navigate).

## Phase 1 — Drawing on one frame

- [ ] **Pencil draws, gap-free:** with Apple Pencil, draw a fast squiggle and a slow careful line at several zoom levels (fit, actual pixels, zoomed way in). Lines are continuous with no gaps or dropped segments, and edges are hard/pixelated (not anti-aliased/blurry) — zoom in close to check.
- [ ] **Fingers only navigate:** with "Draw with finger" off (default, App Settings), one-finger dragging on the canvas does nothing (no mark, no pan). Two-finger drag pans; pinch zooms (10%–3200%). Turn "Draw with finger" on — one finger now draws, and two fingers still pan/zoom.
- [ ] **Palm rejection:** while the Pencil is down and drawing, rest your palm on the screen — no stray marks, no interruption to the stroke.
- [ ] **Two/three-finger tap:** a quick two-finger tap (not a drag) undoes; a quick three-finger tap redoes. Toggling "Two-finger tap undo / three-finger tap redo" off in App Settings disables this without affecting the Undo/Redo buttons.
- [ ] **Pen tool:** round and square tips, size 1–128 (presets 1/2/4/8/16/32, `[`/`]` keys, or the slider) — draws hard-edged strokes in the current color.
- [ ] **Eraser tool:** same tip/size options, its own remembered size (switch Pen→4px, Eraser→16px, switch back — Pen still remembers 4px). Erases to transparency (paper shows through), not to white.
- [ ] **Current color:** tap the ink swatch (tool palette, bottom) — Colors window opens. Drag in the saturation/value square and the hue strip — swatch and next stroke's color update live. Type a hex value and press Return. Tap a palette swatch or a recent color to select it. Tap **+** to add the current color to the palette.
- [ ] **Paper color:** tap the paper swatch — Colors window switches to editing Paper; picking a color changes the canvas background immediately (both on-screen and after reload).
- [ ] **Undo/redo:** menu bar buttons, Edit menu items, Cmd+Z / Shift+Cmd+Z, and the two/three-finger taps above all undo/redo the same stroke history. Undo/redo jump correctly even right after a fresh app launch (history itself does *not* survive a relaunch — that's expected, §6.4).
- [ ] Edit → **Clear cel** empties the current drawing, undoable.
- [ ] **Pan/zoom/fit:** two-finger drag pans, pinch zooms. View → **Fit to screen** (`0` key) and **Actual pixels** (`1` key) both work. Rotate the iPad or resize Split View — if you haven't manually zoomed/panned, the canvas re-fits; if you have, it keeps the same center and zoom.
- [ ] **Survives a reload:** draw a few strokes, force-quit and reopen (or just reload) — the drawing is exactly as left, including after an undo (undo, then immediately background the app — the *undone* state should be what's there on return, not the stroke you undid).
- [ ] **Left-handed layout** (App Settings) moves the tool palette to the right side of the screen.
- [ ] Duplicate a project from Home — the duplicate has its own copy of the drawing (editing one doesn't affect the other).

## Phase 2 — ASCII engine (Ramp)

- [ ] **View toggle is instant:** draw something, tap the Raster/ASCII segmented control (menu bar) or press `A` — switching shows the converted characters immediately, no visible delay or flash.
- [ ] **A filled stroke reads as substantial characters:** draw a normal stroke with the default pen (4px) at the default column count, switch to ASCII — the stroke should read as clearly visible mid-to-dense characters (not just faint dots), with lighter characters at the tapered brush ends.
- [ ] **A stray tap stays light and can be thresholded away:** a quick single tap shows as a light character; opening the ASCII window and raising Threshold makes faint marks disappear while solid strokes remain.
- [ ] **Columns slider is live and non-destructive:** open the ASCII window, drag the Columns slider or tap a preset (Low/Medium/High/Ultra) while looking at the ASCII view — the character grid changes immediately. Switch to Raster — the drawing itself is pixel-for-pixel unchanged regardless of how many times you changed columns.
- [ ] **Columns/threshold/density changes apply even from Raster view:** while looking at Raster view, open the ASCII window and change Columns or Density, then switch to ASCII — the new settings are already reflected, not stale.
- [ ] **Ramp presets and custom ramp:** switching between Classic/Long/Minimal visibly changes the character set used; typing a custom ramp (e.g. `.ox`) takes effect live.
- [ ] **Density slider:** lowering Density makes strokes denser/darker-reading; raising it makes them lighter — both directions visibly change already-drawn content without redrawing.
- [ ] **Grid overlay:** View → Grid overlay shows thin lines at every grid-cell boundary in Raster view only; toggling off hides them. Dragging the Columns slider briefly flashes the overlay even when the toggle is off.
- [ ] **Show drawing under ASCII:** View → Show drawing under ASCII shows the raster drawing faintly (~20%) beneath the characters in ASCII view; off by default.
- [ ] **Drawing directly in ASCII view:** switch to ASCII view, draw a stroke with the Pencil — while the pen is down you see a normal thin raster line (not characters yet); the instant you lift the pen, that region converts to characters. Undo/redo and the eraser work the same way in ASCII view as in Raster view.
- [ ] **Crisp at any zoom:** pinch-zoom in on some ASCII characters, including well past 100% — glyph edges stay hard-edged/blocky, never blurry.
- [ ] `npm run test` passes (Vitest — grid math, per-grid-cell statistics, threshold/density/ramp mapping, including the §5.10 acceptance targets).
