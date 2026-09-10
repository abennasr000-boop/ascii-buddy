# ascii_buddy<3 — Product & Technical Specification

A retro, minimalist drawing and frame-by-frame animation tool that turns freehand drawings into ASCII art. Delivered as a single self-contained HTML file, designed first for iPad + Apple Pencil.

Spec version 1.0 · September 2026

**Naming.** The app's display name is exactly `ascii_buddy<3` (lowercase, with the underscore and the heart). Use it in the page title, the home-screen app name, the About dialog and the Home window. Escape it as `ascii_buddy&lt;3` inside HTML. Wherever `<` isn't safe (file names, IDs, package name, IndexedDB database name), use `ascii_buddy` instead.

---

## 0. Read this first (instructions for Claude Code)

This document is the single source of truth for the project. Read it fully before writing any code.

- **Build in phases.** Follow the phases in §19, in order. At the end of each phase, stop and write a short summary of what was built, plus a step-by-step list of what the user should test on their iPad. Then wait for the user's confirmation before starting the next phase.
- **Log your decisions.** Where this spec is silent or ambiguous, make the simplest reasonable choice, record it in `DECISIONS.md` (one line: the decision and why), and continue. Only stop to ask the user about decisions that would be expensive to reverse.
- **No scope creep.** Do not add features that are not in this spec. Put ideas in `IDEAS.md` instead.
- **One engine, everywhere.** The ASCII conversion engine (§5) must be pure, framework-free TypeScript with unit tests (§20). The exact same engine is used for the on-screen view and for every export, so what the user sees is exactly what they export.
- **Verify dependencies.** The libraries suggested in §3.4 were current when this spec was written. Check current versions, APIs and licenses before using them, and prefer small, tree-shakable options.
- **Safari is the target.** The user tests on a real iPad. Many browser APIs behave differently in iPadOS Safari than in desktop Chrome. When in doubt, design for Safari.
- Keep `TESTING.md` (manual iPad checklist) and `README.md` (build + hosting instructions) up to date at every phase.

---

## 1. Vision and principles

ascii_buddy<3 lets someone draw freely with a pencil, like in a basic raster paint program, while a character grid sits over the canvas. The app projects the drawing onto that grid and turns it into ASCII characters, in color. The same tool is a flipbook: the user draws frame after frame, uses onion skinning, and plays the animation back as either the drawing or its ASCII version.

Guiding principles:

1. **The drawing is the truth; the ASCII is a lens.** The raster drawing is the only primary data. ASCII is always derived from it, so grid size, conversion style, character ramp and thresholds can change at any moment without losing work.
2. **Canvas first.** The drawing surface gets almost all the screen. Interface elements are small, quiet, and can be hidden entirely.
3. **Looks like 1984, works like today.** The interface is 1-bit black and white, early-Macintosh style. The behavior is modern: fast, gesture-driven, full undo, autosave.
4. **Offline and private.** No accounts, no server, no analytics, and no network requests after the page loads.
5. **Predictable.** The same drawing and settings always produce the same ASCII, on screen and in every export format.

---

## 2. Glossary

Use these terms consistently in code and UI. Note that **grid cell** and **cel** are different things.

| Term | Meaning |
|---|---|
| Canvas | The fixed-size raster image area of a project. |
| Grid | The columns × rows character layout projected onto the canvas. |
| Grid cell | One character slot in the grid. Always write "grid cell" (or `gridCell` in code), never just "cell". |
| Frame | One moment in the animation. |
| Track | A layer that runs through all frames (like Aseprite or Procreate Dreams). The UI may call tracks "layers". |
| Cel | The content of one track in one frame. |
| Drawing track | A track whose content is converted to ASCII. |
| Reference track | A track holding images (photos, video frames). Never converted, never exported. |
| Static track | A track with a single cel shared by every frame (e.g. a background). |
| Tick | One playback step, lasting 1/fps seconds. |
| Hold | A frame's duration in ticks (default 1). |
| Ink | Any non-transparent pixel in a drawing cel. |
| Coverage | The fraction of a grid cell's pixels that contain ink, from 0 to 1. |
| Ramp | An ordered string of characters from light to dense. |
| Occupancy | The rule that decides which drawing track owns each grid cell (§4.4). |
| Raster view / ASCII view | The two ways to display the canvas. Both are fully drawable. |

---

## 3. Platform, delivery, tech stack

### 3.1 Targets

- **Primary:** iPadOS Safari (current version), both as a home-screen web app and in a normal Safari tab. All iPad sizes, portrait and landscape, and Split View / Stage Manager windows of any size.
- **Secondary:** desktop Safari, Chrome, and Firefox with mouse, trackpad or pen tablet. Everything must work there, but the layout is optimized for iPad.
- **Phones:** not a target. The app must not crash; it may show a short "Works best on iPad or desktop" note.
- **Inputs:** Apple Pencil (`pointerType === "pen"`), fingers (`"touch"`), mouse, and hardware keyboard shortcuts (Magic Keyboard).

### 3.2 Deliverable

- `dist/index.html`: one self-contained file with all JS, CSS, fonts (base64), icons, and libraries inlined. No CDN links and no runtime network requests.
- Optional `dist/sw.js`: a tiny service worker that caches `index.html` for offline use when hosted. The app must work fully without it.
- Target size: under about 2.5 MB. Subset fonts to the glyphs actually used.
- It should still work when opened directly from disk in desktop browsers where possible, degrading gracefully if storage is unavailable.

### 3.3 Distribution (explain this in README.md for the user)

- Opening a local HTML file on iPad works poorly, so the recommended path is free hosting: GitHub Pages, Netlify Drop (drag the `dist` folder onto the page), or itch.io (HTML project). Then in Safari: Share → Add to Home Screen. The app runs full screen with its own icon.
- Storage for a home-screen web app is separate from storage in a Safari tab. Projects made in one are not visible in the other, so the user should pick one (the home-screen app is recommended) and use project files (§14.2) to move work between them.
- Several APIs require a secure context (HTTPS): the Clipboard API, Web Share, WebCodecs, persistent storage, and service workers. All the hosting options above serve HTTPS.

### 3.4 Stack

- **Language/build:** TypeScript + Vite + `vite-plugin-singlefile` to produce the single HTML file.
- **UI:** Preact (with signals) for panels, dialogs and the timeline, or plain TypeScript. Keep the bundle small. The canvas engine and the ASCII engine are plain TypeScript modules that do not depend on the UI framework.
- **Workers:** heavy work (converting many frames, shape matching, exports) runs in Web Workers, inlined into the build (for example Vite's `?worker&inline` import).
- **Suggested libraries** (verify before use):
  - `fflate`: deflate and ZIP (cel compression, project files, PNG-sequence ZIPs).
  - `gifenc`: GIF encoding, including palette quantization.
  - `jsPDF`: PDF generation; supports embedding a TTF font, so ASCII can be written as real text.
  - `mediabunny`: MP4 writing on top of WebCodecs, and optionally video reading. It is the maintained successor of `mp4-muxer`.
  - `idb` or a small custom wrapper: IndexedDB access.
- **Fonts** (both SIL Open Font License; include license text in the About dialog and the repo):
  - **Departure Mono**: a monospaced pixel font that includes box-drawing and block characters. Default ASCII font ("Pixel") and UI font.
  - **JetBrains Mono** (subset): optional second ASCII font ("Smooth") for users who prefer clean vector glyphs.
  - For the UI, a Chicago-style bitmap font may be used instead of Departure Mono if one with a clearly free license is found. Otherwise use Departure Mono.

### 3.5 Development workflow for iPad testing

- `npm run dev -- --host`, then open `http://<computer-ip>:5173` on the iPad (same Wi-Fi). Drawing works this way, but HTTPS-only features will not. For those, use `@vitejs/plugin-basic-ssl` (accept the certificate warning on the iPad) or deploy a preview build to Netlify.
- `npm run build` produces `dist/index.html`.
- If the user has a Mac, Safari Web Inspector can debug the iPad over a cable. Mention this in the README.

---

## 4. Core model

### 4.1 The raster is the source of truth

Only the raster drawing (plus reference images) is stored as primary data. ASCII output is computed from it and may be cached, but a cache is always disposable. Changing the number of columns, the conversion style, the ramp, the threshold or the density never modifies the drawing.

### 4.2 Canvas and resolution

- **Canvas shape** is chosen when creating a project. Presets: 4:3 (default), 3:4, 16:9, 9:16, 1:1, 3:2, 2:3, "Terminal 80×24", and custom W:H.
- **Canvas pixel size** is fixed at creation. The long side is 2048 px and the short side follows the aspect ratio, rounded to an even number. The aspect ratio cannot change after creation in v1 (canvas resize is in §21).
- **Grid resolution** is set by the number of **columns** (10–320, default 80), with presets Low 40, Medium 80, High 160, Ultra 240 plus a fine slider. Rows are computed so grid cells are close to the 1:2 (width:height) shape of monospace characters:

  ```
  rows = max(1, round(columns × canvasHeight / (2 × canvasWidth)))
  gridCellWidth  = canvasWidth  / columns     (float)
  gridCellHeight = canvasHeight / rows        (float, ≈ 2 × width)
  ```

  Example: 4:3 canvas (2048×1536) at 80 columns gives 80 × 30.
- The "Terminal 80×24" preset uses a 5:3 canvas (2048×1228) so that 80 columns gives exactly 24 rows.
- Columns can be changed at any time. While dragging the slider, the view updates live (debounced) and shows a readout such as "80 × 30".

### 4.3 Tracks, frames and cels

- A project has an ordered list of **frames** and an ordered list of **tracks** (index 0 = top).
- Each track is either a **drawing** track or a **reference** track, and either **animated** (one cel per frame) or **static** (one cel shared by all frames).
- Cels are created lazily. A missing cel is simply empty.
- A new project starts with 1 frame and 1 animated drawing track named "Layer 1".
- A project always has at least 1 frame.

### 4.4 Occupancy (how tracks combine in ASCII)

For each grid cell, walk through the **visible drawing tracks from top to bottom**. The first track whose cel has coverage above its effective threshold (§5.3) **claims** the grid cell. The character and color come only from that track. Tracks below never show in a claimed grid cell, even if they contain ink there. Hidden tracks are skipped completely. Reference tracks never take part.

```
Top track "A":    ·  ·  @  @  ·  ·
Lower track "B":  x  x  x  x  x  x
ASCII result:     x  x  @  @  x  x     ← grid cells 3–4 belong to A, the rest to B
```

In raster view, tracks composite normally (top over bottom). Overlaps are visible in raster view and resolved by occupancy in ASCII view; this difference is intended.

Static drawing tracks take part in occupancy at their position in the stack, in every frame.

---

## 5. ASCII conversion engine

### 5.1 Pipeline for one frame

1. For each visible drawing track (static tracks use their single cel), compute **per-grid-cell statistics** from its cel: coverage, dominant color, and, when shape matching is needed, a small sub-sample grid (§5.2).
2. Resolve **occupancy** (§4.4).
3. For each claimed grid cell, choose a **character** using the effective conversion settings of the claiming cel (§5.7).
4. Output an `AsciiFrame` (§17): columns, rows, a character code per grid cell (0 = empty), a color index per grid cell, and the owning track.

### 5.2 Per-grid-cell statistics

- Computed in a single pass over the cel's pixels (indexed buffer, §6.1), accumulating for each grid cell: the ink pixel count, a count per color index, and a sub-grid of S × 2S bins (default S = 6, so 6 × 12 bins) holding the coverage of each bin.
- `coverage = inkPixels / gridCellPixels`.
- **Dominant color** = the color index with the highest count in that grid cell. Ties go to the lower index (deterministic).
- Statistics are cached per cel, keyed by the cel's version and the column count. Edits mark only the affected grid cells dirty (the stroke's bounding box), so updates after a stroke are incremental.

### 5.3 Threshold and density

- **Threshold** `t` ranges from 0 to 0.9; the default is 0, meaning *any ink counts*. A grid cell is empty when `coverage ≤ t`. At the default, a grid cell is empty only if it contains no ink at all, so even a tiny mark produces the lightest character.
- Raising the threshold makes lightly inked grid cells empty. This removes specks and stray marks.
- Normalized value: `n = (coverage − t) / (1 − t)`, in (0, 1].
- **Density** is a curve applied to `n`: `d = n^γ`, with γ from 0.2 to 3. Lower γ produces denser characters, which helps thin lines read clearly. Start at γ = 0.5 and tune it against the targets in §5.10.
- Both are sliders with live preview.

### 5.4 Style: Ramp (default)

- A ramp is a string of characters from light to dense. The empty character (space) is implicit and never part of the editable string.
- For a non-empty grid cell: `index = clamp(ceil(d × L), 1, L)` where `L` is the ramp length, and the character is `ramp[index − 1]`.
- Presets (shown here with the implicit space omitted):

  ```
  Classic   .:-=+*#%@
  Long      .'`^",:;Il!i><~+_-?][}{1)(|\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$
  Minimal   .oO@
  Blocks    ░▒▓█            (extended character set only)
  ```

- **Custom**: a text field where the user types their own ramp, light to dense.

### 5.5 Style: Shape-aware

The goal is characters that follow the lines of the drawing: `/ \ | - _ ( )` and so on.

- **Method: template matching.** For each candidate character, precompute a mask by rendering the glyph in the ASCII font on an offscreen canvas at grid-cell proportions, then averaging its alpha into the same S × 2S bins. For each grid cell, compare its bin vector with every candidate mask using **cosine similarity**, which ignores the total amount of ink, so a thin line still matches a line-shaped glyph. Pick the best score. An optional small penalty for large differences in total ink between cell and glyph can be added if it improves results.
- **Candidate set** ("shape characters") is editable. Suggested starting set, to be tuned with visual tests:

  ```
  - _ | / \ ( ) < > ^ v ' ` , . : ; + x = [ ] o
  ```

- The threshold (§5.3) is applied first; empty grid cells stay empty.
- With the **extended character set** on, candidates also include box-drawing and block characters such as `─ │ ┌ ┐ └ ┘ ├ ┤ ┬ ┴ ┼ ╱ ╲ ╳ ▀ ▄ ▌ ▐`.
- Performance: at 320 columns there are about 28,000 grid cells × ~30 glyphs × 72 bins, roughly 60 million multiply-adds per full frame. Run full-frame shape conversion in a worker. After a stroke, only dirty grid cells are recomputed.

### 5.6 Style: Hybrid

- For each grid cell: if `coverage ≥ hybridCutoff` (default 0.45), use the ramp; otherwise use shape matching. Strokes become shape characters and filled areas become density characters.
- The cutoff is a slider in settings.

### 5.7 Settings cascade (project → track → cel)

- **Project settings** are the default for everything.
- A **track override** can set any subset of the conversion settings (style, ramp, shape characters, threshold, density, hybrid cutoff). Default: inherit everything from the project.
- A **cel override** works the same way on top of the track. Default: inherit from the track.
- Effective settings = project, overlaid with the track override, overlaid with the cel override.
- Settings that are **project-only**: columns, character set (ASCII / extended), ASCII font, crisp glyphs, and colors-to-characters mapping.
- UI: the ASCII window (§12.3) has an **"Apply to: Project | Track | Cel"** selector. Choosing Track or Cel edits that level's override, and a "Reset to inherited" button clears it. Tracks and cels with overrides show a small marker in the timeline.

### 5.8 Colors-to-characters mapping (off by default)

- A project setting, **"Characters by color"**. When enabled, a table lists every color in the project color table (§7.1) with an optional character for each.
- If the dominant color of a claimed grid cell has a mapped character, that character is used. The threshold still decides whether the grid cell is empty. Unmapped colors use the normal style.

### 5.9 Grid cell color

A claimed grid cell is drawn in the dominant color (§5.2) of its claiming track. TXT export has no color by nature; all other formats keep color.

### 5.10 Tuning targets (acceptance criteria)

- With the default pen size (4 px) and default columns (80), a normal stroke in Ramp mode reads as clearly visible characters, at least mid-ramp. Tune the default γ to achieve this.
- A fully filled area produces the densest ramp character.
- A tiny accidental dot produces the lightest character at threshold 0 and disappears with a small threshold increase.
- In Shape mode, straight lines at 0°, 45°, 90° and 135° consistently produce `-`, `/`, `|` and `\`.
- Conversion is deterministic: the same input always yields the identical `AsciiFrame`.

### 5.11 Rendering ASCII

- Use a **glyph atlas**: render each needed (character, color) pair once at the current on-screen grid-cell size into an atlas canvas, then draw grid cells with `drawImage`. Rebuild the atlas when zoom or columns change (debounced; reuse the nearest cached size while zooming). Never call `fillText` per grid cell per frame during playback.
- Glyphs are scaled to fill the grid cell. The font's advance width × line height box is stretched to the grid cell; the slight non-uniform scaling is acceptable.
- The background is filled with the project background color.
- **Crisp glyphs** (project setting, default on): glyph alpha is thresholded at 50%, giving hard 1-bit edges. This suits the retro look and keeps GIF exports clean.

---

## 6. Drawing and tools

### 6.1 Pixel format and rasterization

- **Drawing cels are indexed 8-bit images** (`Uint8Array`, one byte per pixel). 0 = transparent; 1–255 = an index into the project color table (§7.1). Benefits: a quarter of the memory of RGBA, crisp lossless edges, exact flood fills, trivial dominant-color counting, and very compact storage.
- **All drawing is aliased** (hard-edged, no anti-aliasing), at fine resolution. Implement rasterization directly on the indexed buffer: Bresenham lines between input samples, with a brush tip stamped along them. **Do not use Canvas 2D `stroke()`, `arc()` or similar to draw into cels, because they anti-alias.** Canvas 2D is used only for display.
- **Display:** convert the dirty rectangle of the indexed buffer to RGBA through a 256-entry lookup table, then `putImageData` into the track's display canvas.

### 6.2 Input handling

- Use Pointer Events. **Pen draws. Touch navigates** (pan, zoom, gestures) unless the app setting "Draw with finger" is on. Mouse draws; Space + drag pans; the wheel or trackpad pinch zooms.
- Use `getCoalescedEvents()` when available so fast strokes stay smooth. Connect samples with Bresenham lines so strokes never have gaps.
- **Palm rejection:** while a pen pointer is down, ignore all touch pointers.
- **Pencil hover** (on supporting iPads): if hover pointer events arrive, show the brush outline at the hover position. Nice-to-have.
- Pencil double-tap and squeeze are not available to web apps. Do not try to support them.
- No pressure sensitivity (explicit decision). No stroke stabilizer in v1.
- Prevent iPad Safari interference: `touch-action: none` on the canvas area, `-webkit-user-select: none`, `-webkit-touch-callout: none`, `overscroll-behavior: none`, and cancel `gesturestart` to block page zoom.

### 6.3 Tools

**Pen.** Draws with the current color into the current cel. Tip: round (default) or square. Size 1–128 canvas pixels, default 4, with quick presets 1, 2, 4, 8, 16, 32.

**Eraser.** Writes transparency (index 0). Same tip and size options as the pen, with its own remembered size.

**Fill.** Flood fill, 4-connected (so diagonal lines are solid boundaries), exact index match, which is clean because everything is aliased.
- Option "Boundaries from": **all visible drawing tracks** (default) or current track only. With the default, a user can ink lines on one track and fill colors on a track below; the region is computed from the composite of visible drawing tracks, but pixels are written only into the current cel.

**Eyedropper.** Picks the color under the point from everything visible, including reference images (so colors can be sampled from a photo). New colors are added to the project color table. Quick access: long-press with one finger on the canvas (about 400 ms) when finger drawing is off, or Option-click with a mouse. In ASCII view it picks the grid cell's color.

**Select.** Two modes, rectangle and lasso (freehand polygon), working on the current drawing cel.
- A selection shows animated marching ants (black and white, the classic Mac look).
- Actions (a small action bar near the selection): move by dragging inside, scale by corner handles (nearest-neighbor, keeps the aliased look), flip horizontal, flip vertical, rotate 90°, copy, cut, delete, deselect. Arbitrary-angle rotation is out of scope for v1.
- **Paste in place:** pasting creates a floating selection at the same position it was copied from, on the current cel, which may be a different frame or track. This is key for animation. The floating selection is committed when the user taps outside it, changes tool, frame or track.
- **"Snap to grid cells"** option for moving: moves in whole grid-cell steps so the ASCII result shifts cleanly. Default on in ASCII view, off in raster view.
- Keyboard: arrow keys nudge 1 px, Shift + arrow nudges one grid cell. Select all and Deselect in the Edit menu.
- The clipboard for drawing content is internal to the app. An image pasted from the system clipboard goes to a reference track (§10.1).

**Transform (reference tracks).** When the current track is a reference track, drawing tools are disabled and the Select tool becomes a transform tool for the current cel's image: move, scale from corner handles (keeps proportions; a toggle allows free scaling), and a rotation handle. Buttons: Fit, Fill, Reset, and **"Apply to all cels in track"**, which copies this transform to every cel of the track (useful after importing a video).

**Clear.** Edit → Clear cel empties the current track in the current frame.

### 6.4 Undo and redo

- **One global history** covering drawing, frames, tracks, settings, imports, and color changes.
- Stroke steps store the before/after bytes of the dirty rectangle of the indexed buffer (compressed with fflate when large). Structural changes are reversible command objects.
- Undoing or redoing a change in another frame or track **jumps to that frame/track** so the change is visible.
- Limit: 200 steps or about 150 MB, dropping the oldest steps first.
- Two-finger tap = undo, three-finger tap = redo (a tap is under ~250 ms with little movement; anything else is a pan). Undo/redo buttons in the menu bar. Cmd+Z / Shift+Cmd+Z.
- The history is not saved between sessions.

---

## 7. Colors and palettes

### 7.1 Project color table

- Up to 255 colors, added automatically when a new color is first used. An index stays bound to its color, so existing artwork never changes color unexpectedly when the palette is edited.
- **Replace color…** (Edit menu, or long-press a swatch) changes a table entry and therefore recolors every pixel using it across the whole project. It is undoable, and useful for recoloring a whole animation.
- **Remove unused colors** is available as a command.
- If the 255-color limit is reached, show a message suggesting "Remove unused colors".

### 7.2 Current color, background, picker

- Default drawing color: black `#000000`. Default background: white `#FFFFFF`.
- **Colors window** (floating, §12.3): large current-color swatch, the palette grid, a row of the 8 most recent colors, a "+" button to add the current color to the palette, and a picker (saturation/value square, hue strip, hex field), drawn in 1-bit style. A secondary button opens the system picker (`<input type="color">`).
- **Background** ("Paper") swatch in the Colors window and in project settings. It affects both views and all exports (unless a transparent background is chosen on export).

### 7.3 Palettes

- **Global palette library**, shared across all projects and stored in IndexedDB: save the current palette as a named palette, load, rename, duplicate, delete, reorder swatches by dragging, remove a swatch.
- Each project keeps its own active palette copy. Editing it does not change the library until "Save to library" is used.
- Import and export palettes as `.hex` (one hex color per line, compatible with Lospec) and `.gpl` (GIMP).
- Include 3–4 original starter palettes, for example "Ink" (black, white, grays), "Terminal" (phosphor green and amber), and two small colorful sets.

---

## 8. Layers (tracks)

- A track header shows: a type icon (pencil for drawing, photo for reference), the name, a visibility eye, a lock, and an "S" badge for static tracks.
- **Add track:** "New drawing track" or "New reference track", inserted above the current track.
- **Track menu** (tap the track name): rename, duplicate, delete (with confirmation), make static / make animated, opacity (reference only), conversion override (drawing only), merge down (drawing into the drawing track below, frame by frame, top pixels over bottom).
  - Make static keeps the current frame's cel as the shared cel (confirm first, explaining that other frames' content on this track will be removed).
  - Make animated copies the shared cel into every frame.
- Reorder tracks by dragging headers.
- **Visibility** affects the view and exports (hidden tracks are not exported). **Lock** prevents all edits.
- **Global reference toggle:** a single button in the menu bar hides or shows all reference tracks in every frame at once, without changing each track's own eye state. Its icon shows the current state. App setting "Hide references during playback" (default off) auto-hides them while playing.
- **Reference tracks:**
  - Opacity 0–100%, default 50%.
  - Each cel holds one image with its own transform (§6.3).
  - Never exported, never converted, never part of occupancy.
  - Raster view draws them at their position in the stack. ASCII view draws them beneath all characters at their opacity, so tracing works in both views.
- Soft limit of 16 tracks (warn above that, for memory reasons).

---

## 9. Animation and timeline

### 9.1 Frames

- Each frame has a **hold** (duration in ticks), default 1, range 1–99.
- Operations: new blank frame after the current one, duplicate frame (copies all animated cels), delete frame (confirm if it has content), reorder by dragging, set hold (1, 2, 3, 4, or custom).
- **Multi-select** a range of frames (tap the first, Shift-tap or long-press-then-tap the last) to delete, duplicate, move, or set the hold for all of them at once.

### 9.2 Playback

- **FPS** 1–60, default 12, with presets 6, 8, 12, 15, 24, 30.
- **Modes:** Loop (default), Ping-pong, Once.
- Playback uses the current view (raster or ASCII) and respects track visibility and the global reference toggle. Onion skin is hidden during playback.
- **Timing:** `requestAnimationFrame` with accumulated real time, so the frame rate is accurate on 60 Hz and 120 Hz displays. If rendering falls behind, skip frames rather than slow down.
- **Caching:** before and during playback, build caches: ASCII frames as `AsciiFrame` data (tiny), raster frames as flattened `ImageBitmap`s at display resolution (subject to the memory budget in §14.3). If preparation takes a moment, show a small "Preparing 12/48" indicator without blocking the UI.
- Playback stops when the user taps the canvas, presses the stop control or Return, or starts drawing.

### 9.3 Onion skin

- On/off toggle in the menu bar plus a settings popover:
  - Frames before: 0–5, default 1. Frames after: 0–5, default 1.
  - Color before: default **purple** (`#8B3FD9`). Color after: default **orange** (`#FF8A00`).
  - Opacity of the nearest frame: default 40%. Each frame further away is multiplied by 0.6.
  - Wrap around the loop: default off.
  - Tracks: all visible animated drawing tracks (default) or current track only.
- **Raster view:** neighboring frames' drawing tracks are drawn as silhouettes tinted with the onion color, beneath the current frame.
- **ASCII view:** neighboring frames' ASCII is drawn in the onion color at the given opacity, only in grid cells that are empty in the current frame.
- Static tracks and reference tracks are never onion-skinned.

### 9.4 Timeline UI

The timeline is a panel at the bottom of the editor with two states.

- **Collapsed (default in landscape):** a single strip with transport controls (first, previous, play/stop, next, last), a scrollable row of frame numbers (the current one inverted, held frames marked like "×3"), the FPS value, the playback mode, and an expand button.
- **Expanded (default in portrait):** a grid with track headers in a left column and one column per frame. A grid square shows a filled dot if that cel has content and is empty otherwise. The current frame column has an inverted header; the current track row is outlined. Frames with a hold are drawn wider (width proportional to ticks, capped). Static tracks show one continuous bar. Tracks and cels with conversion overrides show a small marker.
- Tap a square to select that frame and track. Long-press a frame number for the frame menu; long-press a track header for the track menu.
- Scroll horizontally with one finger. Auto-scroll to keep the current frame visible.

---

## 10. Import

### 10.1 Entry points

- File → Import images… (multi-select allowed; on iPad the file picker offers Photos, Camera and Files).
- File → Import video….
- Paste an image from the system clipboard (Cmd+V, or Edit → Paste image as reference).
- Drag and drop images onto the canvas (iPad supports dragging from Photos or Files into Safari).
- A single pasted or dropped image goes onto the current reference track in the current frame. If the current track is a drawing track, a new reference track is created. The image is fitted to the canvas.

### 10.2 Import dialog (images, including bulk)

| Option | Choices | Default |
|---|---|---|
| Order | As selected / By file name (natural sort, so `img2` comes before `img10`) | By file name |
| Size | Fit inside canvas / Fill canvas (crop) / Stretch / Original size (centered) | Fit inside |
| Start at | Frame 1 / Current frame / After last frame | Frame 1 if the project has a single empty frame, otherwise After last frame |
| Into | New reference track / an existing reference track | New reference track |

- One image per frame. Frames are created as needed (hold 1, empty cels on the other tracks). Existing cels in the target range of an existing track are replaced after confirmation.
- A summary line previews the result, for example "24 images → frames 1–24 on new track 'Reference 2'".
- A progress bar with Cancel. The whole import is a single undo step.

### 10.3 Video import

The same dialog, plus:

- **Sampling FPS**: default is the project FPS, range 1–60. Shows the result, for example "4.2 s × 12 fps = 50 frames".
- **Trim**: start and end times, with a scrubber and a preview thumbnail.
- Checkbox **"Set project FPS to match"**.
- A warning above 300 frames (memory and storage).
- Implementation: an `HTMLVideoElement` (plays iPhone `.mov`/HEVC and `.mp4` on iPad). For each time `start + i / fps`, set `currentTime`, wait for `seeked` (and `requestVideoFrameCallback` when available), draw to a canvas at the target size, and encode the image. Mediabunny's decoding APIs are an alternative if they prove more reliable in Safari; choose whichever works best on iPad and log the decision. Audio is ignored.

### 10.4 Reference image storage

Downscale every imported image to at most the canvas size and store it as JPEG (quality about 0.85), or PNG if it has transparency. Never keep full-resolution originals.

---

## 11. Views and navigation

- **Raster ⇄ ASCII** toggle: a segmented control in the menu bar, plus the `A` key. Both views are fully drawable with every tool.
- **Drawing in ASCII view:** while the pen is down, the stroke is shown as a thin raster preview in the current color. The affected grid cells are recomputed when the pen lifts. If incremental live conversion during the stroke holds 60 fps, prefer that instead.
- **"Show drawing under ASCII"** (View menu): shows the raster drawing at 20% opacity under the characters. Default off.
- **Grid overlay** in raster view (View menu): thin dotted lines at grid-cell boundaries. Default off. It appears faintly and temporarily while the columns slider is being dragged.
- **Navigation:** two-finger drag pans; pinch zooms (10%–3200%) around the fingers. Canvas rotation by gesture is an app setting, default off; when on, it snaps to 0°, 90°, 180° and 270° within 10°.
- **Fit to screen** (View menu, a button, and the `0` key). **Actual pixels** (`1` key).
- **Crisp display:** `image-rendering: pixelated`, `imageSmoothingEnabled = false`, and correct handling of `devicePixelRatio`.
- The area around the canvas uses a classic dithered desktop pattern.
- On rotation or window resize, the layout reflows. If the user has not zoomed or panned, the canvas re-fits; otherwise it keeps its center and zoom.

---

## 12. Visual design: 1-bit Macintosh

### 12.1 Design tokens

- **Color:** the interface is strictly black `#000000` and white `#FFFFFF`. Grays exist only as dither patterns (50% checkerboard, 25% dots). The only color on screen is the user's artwork and color swatches.
- **Type:** the pixel UI font (§3.4), at sizes that keep it pixel-perfect (Departure Mono renders crisply at multiples of 11 px). Sentence case for labels and buttons ("Import video", "Onion skin"); menu titles in title case like the classic Mac (File, Edit, View).
- **Lines:** 1 px black borders everywhere.
- **Windows and panels:** 1 px border with a hard black drop shadow offset 2 px right and down, no blur. The title bar has horizontal pinstripes, a small square close box on the left, and the title centered in a white box.
- **Buttons:** white with a 1 px black border and rounded corners (about 5 px). The default button in a dialog has a thick outer ring. Pressed = inverted (black background, white text).
- **Selected/active states:** inverted colors. **Disabled:** dithered text.
- **Icons:** original 16×16 pixel-art icons (pencil, eraser, bucket, dropper, marquee, lasso, eye, lock, onion, play, and so on), rendered at 2× as inline SVG with `shape-rendering: crispEdges`. They are inspired by the era, not copies of Apple's original bitmaps.
- **Motion:** almost none. Marching ants on selections, and a brief invert flash when a button or menu item is chosen (like the classic Mac menu blink). No fades or slides.
- **Touch targets:** every control has a hit area of at least 44 × 44 pt, even when it looks smaller.
- **Modals:** a Mac-style dialog window, centered, over a dither-pattern overlay.
- **Restraint:** no decoration that doesn't carry information. Words are short, plain, and describe what happens ("Export GIF", not "Submit").

### 12.2 Editor layout

Landscape:

```
┌──────────────────────────────────────────────────────────────────────┐
│ ▣ File Edit View Frame Layer ASCII   [Raster|ASCII] Ref Onion ↶ ↷ Fx │  menu bar
├──────┬───────────────────────────────────────────────────────────────┤
│ Pen  │░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│
│ Eras │░░░░░░┌───────────────────────────────────────────────┐░░░░░░░░│
│ Fill │░░░░░░│                                               │░░░░░░░░│
│ Drop │░░░░░░│                                               │░░░░░░░░│
│ Sel  │░░░░░░│                     CANVAS                    │░░░░░░░░│
│ ──── │░░░░░░│                                               │░░░░░░░░│
│ ■ □  │░░░░░░│                                               │░░░░░░░░│  ■ color, □ paper
│ size │░░░░░░└───────────────────────────────────────────────┘░░░░░░░░│
├──────┴───────────────────────────────────────────────────────────────┤
│ |◀ ◀ ▶ ▶ ▶|   1  2  3 [4] 5  6  7 ×3  8  9 …       12 fps  Loop  ▲   │  timeline
└──────────────────────────────────────────────────────────────────────┘
```

- **Menu bar** (about 32 pt tall): menus on the left; on the right a few quick toggles: Raster/ASCII, reference toggle, onion toggle, undo, redo, and focus mode ("Fx" in the sketch). A small autosave status ("Saved" / "Saving…") sits between them.
- **Tool palette** (vertical, left): Pen, Eraser, Fill, Eyedropper, Select (tap again to switch rectangle/lasso), then current color and paper swatches (tap opens the Colors window) and a brush size control. The app setting "Left-handed layout" moves the palette to the right.
- **Canvas** in the middle, on the dithered desktop.
- **Timeline** at the bottom (§9.4).
- **Portrait:** the same structure. The timeline starts expanded because there is more vertical space.
- **Focus mode** (menu bar button, `F` key): hides everything except the canvas and a tiny exit button in a corner. Pencil and gestures keep working.
- The layout must respect safe areas (`env(safe-area-inset-*)`, `viewport-fit=cover`) and use dynamic viewport units (`100dvh`).

### 12.3 Floating windows

Draggable Mac-style windows with a close box. Each remembers its position per orientation. Only open windows are shown; ideally no more than two at once.

- **Colors** (§7.2, §7.3).
- **ASCII** (menu "ASCII"): the main control panel for conversion, with live preview while adjusting.
  - Apply to: Project | Track | Cel (§5.7), with "Reset to inherited".
  - Columns: presets + slider, readout "80 × 30 characters".
  - Style: Ramp | Hybrid | Shape.
  - Ramp: preset menu + custom text field.
  - Shape characters: text field.
  - Threshold, Density, Hybrid cutoff: sliders.
  - Project-level: Character set (ASCII / Extended), ASCII font (Pixel / Smooth), Crisp glyphs, Characters by color (opens the mapping table).
- **Onion skin** settings (§9.3), opened from the onion toggle.

### 12.4 Menus

Tapping a menu title opens a classic dropdown (highlighted item inverted). Keyboard shortcuts are shown next to items.

- **▣** (app menu): About ascii_buddy<3, App settings…, Back to projects.
- **File:** Save now, Import images…, Import video…, Export…, Export project file…, Project settings…, Close project.
- **Edit:** Undo, Redo, Cut, Copy, Paste, Paste image as reference, Select all, Deselect, Clear cel, Replace color…, Remove unused colors.
- **View:** Raster / ASCII, Fit to screen, Actual pixels, Grid overlay, Show drawing under ASCII, Hide all references, Onion skin, Onion settings…, Expand timeline, Focus mode.
- **Frame:** New frame, Duplicate frame, Delete frame, Hold ▸, Previous frame, Next frame, Play/Stop, Playback mode ▸, FPS….
- **Layer:** New drawing track, New reference track, Duplicate track, Delete track, Make static / Make animated, Merge down, Opacity…, Conversion override….
- **ASCII:** opens the ASCII window.

---

## 13. Screens

### 13.1 Home ("Projects")

- Full screen dithered desktop with a single Finder-like window titled "Projects".
- A grid of project icons: a thumbnail (frame 1, in the last view used), the name, and the last-modified date, sorted newest first.
- Tap to open. Long-press (or the "…" button on each icon) for: Rename, Duplicate, Export project file, Delete (Mac-style alert: "Delete 'Walk cycle'? This can't be undone." with Delete and Cancel).
- Window buttons: New project, Import project file, Settings, About.
- Empty state: "No projects yet." with a New project button.
- Footer: storage used (for example "12.4 MB used") and a quiet reminder that project files are the backup.

### 13.2 New project dialog

- Name (default "Untitled 1", incrementing).
- Canvas shape: preset buttons with small outline previews, plus custom W:H fields.
- Resolution: column presets + slider with the live readout "80 × 30 characters" and a tiny grid preview.
- Background color and FPS.
- Buttons: Create (default) and Cancel.

### 13.3 Project settings dialog

Tabs: General (name, background, FPS, playback mode), Canvas (aspect and pixel size shown read-only, columns, pixels per grid cell shown as info), ASCII (opens the same controls as the ASCII window), Onion skin.

### 13.4 App settings

| Setting | Default |
|---|---|
| Draw with finger | Off |
| Left-handed layout | Off |
| Canvas rotation gesture | Off |
| Two-finger tap undo / three-finger tap redo | On |
| Hide references during playback | Off |
| Autosave delay | 1.5 s |
| Storage: usage, persistent storage status, "Request persistent storage" | — |
| About and font/library licenses | — |

---

## 14. Persistence

### 14.1 Autosave

- Everything is stored in **IndexedDB**. Object stores: `projects` (metadata and structure as JSON), `cels` (compressed indexed buffers, keyed by project/track/frame), `images` (reference image blobs), `thumbnails`, `palettes` (global library), `settings` (app settings).
- Save only what changed, debounced (1.5 s after the last change), and **immediately on `visibilitychange` → hidden and on `pagehide`**, because iPadOS can close background tabs without warning.
- Save order is crash-safe: write new cels and images first, then the project JSON that references them, so an interrupted save never corrupts a project. Clean up orphaned records on load.
- Show the status ("Saved" / "Saving…") in the menu bar.
- Call `navigator.storage.persist()` when the first project is created; show the result in App settings.
- On `QuotaExceededError`, show an alert explaining that storage is full, with an "Export project file" action.

### 14.2 Project file (`.buddy`)

- A ZIP (via fflate) containing: `project.json` (with `schemaVersion`), `cels/<trackId>/<frameId>.bin` (raw indexed bytes plus bounding box header; the ZIP compresses them), `images/<imageId>.jpg|png`, and `thumbnail.png`.
- Import validates `schemaVersion` and migrates older versions. Imported projects get a new id, so importing twice creates two copies.
- Record `lastExportedAt` and show "Last backup: 3 days ago" (or "never") in the project's long-press menu on the Home screen.

### 14.3 Memory management (critical on iPad)

iPadOS Safari limits total canvas memory and may reload a tab that uses too much. Rules:

- Only the **current frame's** cels are held as live display canvases. Other frames' cels are kept compressed, or decoded in an LRU cache with a budget (about 150 MB).
- Release canvases explicitly (set `width` and `height` to 0) when they are no longer needed.
- Store empty cels as nothing. Store non-empty cels cropped to their bounding box, compressed at rest.
- Decode reference images lazily as `ImageBitmap` for the current frame and prefetch a few frames ahead during playback.
- Playback caches follow §9.2. If the raster playback cache exceeds its budget, render frames on the fly at reduced resolution instead.

---

## 15. Export

### 15.1 Export dialog

| Option | Choices | Default |
|---|---|---|
| Format | See §15.2 | GIF |
| Content | ASCII view / Raster view | ASCII view |
| Frames | Current frame / All frames / Range (from–to) | All frames (animated formats), current frame (single-image formats) |
| Size | 1×, 2×, 4× of on-canvas size, or a custom width; shows the resulting pixel size | 1× |
| Background | Project color / Transparent (PNG, PNG sequence, sprite sheet, GIF) | Project color |

- **Always excluded:** reference tracks, hidden tracks, onion skin, grid overlay, selections.
- **Raster view** exports flatten the visible drawing tracks over the background.
- All animated formats respect **holds**.
- **Delivery:** a "Share…" button uses the Web Share API with the file (on iPad this offers Save to Photos, Save to Files, AirDrop, Messages). Otherwise, or additionally, a "Download" button uses a blob link. Check `navigator.canShare({ files })` first.
- Exports run in a worker where possible, with a progress bar and Cancel.
- File names: `<project-name>_<ascii|raster>[_f0004].<ext>`.

### 15.2 Formats

| Format | Contents | Notes |
|---|---|---|
| PNG | One frame | Transparent background option. |
| PNG sequence (.zip) | All or a range of frames, named `name_0001.png` | Option: repeat held frames as duplicate files, or one file per frame. |
| GIF | Animation | gifenc. Frame delays are in 1/100 s, and browsers clamp very short delays, so warn above 50 fps. Loop forever (default) or once. |
| MP4 (H.264) | Animation | Mediabunny + WebCodecs `VideoEncoder`; check support with `VideoEncoder.isConfigSupported`. Even pixel dimensions. Quality preset Standard/High. Option "Repeat animation N times", since MP4 doesn't loop. Fallback: `MediaRecorder` on `canvas.captureStream()`. If neither works, explain and suggest GIF. |
| PDF | One frame per page, or a contact sheet | Page size A4, Letter, or fit to artwork; orientation. Contact sheet: automatic grid with frame numbers under each frame. ASCII content is written as real, selectable vector text using the embedded font when feasible; otherwise as images. |
| TXT | Plain ASCII | Current frame or all frames. Frames separated by a blank line and `--- frame 3 ---` (option: form feed instead). Option to trim trailing spaces. UTF-8 (extended characters need it). |
| Copy text | Current frame as ASCII text | Copies to the system clipboard. |
| HTML player | A single self-contained `.html` file with the colored ASCII animation | Real text in a `<pre>` with color spans, embedded font subset, background color, play/pause, correct FPS and holds, playback mode. Text is selectable. |
| Sprite sheet | One PNG grid of frames, plus optional JSON | JSON lists each frame's rectangle and duration in ms. Columns automatic or set by the user. |
| ANSI (nice-to-have) | Colored terminal text with 24-bit escape codes | Phase 9. |
| SVG (nice-to-have) | One ASCII frame as `<text>` elements | Phase 9. |

The project file (`.buddy`) is exported from the File menu, not from this dialog.

---

## 16. Project settings reference

| Setting | Range / values | Default |
|---|---|---|
| Canvas shape | Presets or custom W:H (fixed after creation) | 4:3 |
| Canvas size | Long side 2048 px | 2048 × 1536 |
| Columns | 10–320 | 80 |
| Background | Any color | `#FFFFFF` |
| Drawing color | Any color | `#000000` |
| FPS | 1–60 | 12 |
| Playback mode | Loop / Ping-pong / Once | Loop |
| Conversion style | Ramp / Hybrid / Shape | Ramp |
| Ramp | Preset or custom | Classic |
| Shape characters | Editable string | See §5.5 |
| Threshold | 0–0.9 | 0 (any ink counts) |
| Density (γ) | 0.2–3 | 0.5, tuned per §5.10 |
| Hybrid cutoff | 0–1 | 0.45 |
| Character set | ASCII / Extended | ASCII |
| ASCII font | Pixel / Smooth | Pixel |
| Crisp glyphs | On / Off | On |
| Characters by color | On / Off + mapping table | Off |
| Onion before / after | 0–5 each | 1 / 1 |
| Onion colors | Any colors | Purple `#8B3FD9` / Orange `#FF8A00` |
| Onion opacity / falloff | 0–100% / ×0.6 per frame | 40% |
| Reference opacity (per track) | 0–100% | 50% |
| Pen size / eraser size | 1–128 px | 4 / 16 |

---

## 17. Data model (TypeScript)

```ts
type ID = string;      // short random id
type Hex = string;     // "#RRGGBB"

interface Project {
  schemaVersion: 1;
  id: ID;
  name: string;
  createdAt: number;
  updatedAt: number;
  lastExportedAt?: number;

  canvas: { aspect: [number, number]; width: number; height: number };
  grid: { columns: number };            // rows derived with rowsFor()
  background: Hex;
  fps: number;
  playbackMode: 'loop' | 'pingpong' | 'once';

  colors: Hex[];                         // project color table; index 0 unused (transparent), max 255 entries
  palette: { name: string; swatches: Hex[] };  // project's active palette

  conversion: ConversionSettings;        // project-level defaults
  charset: 'ascii' | 'extended';
  asciiFont: 'pixel' | 'smooth';
  crispGlyphs: boolean;
  colorChars: { enabled: boolean; map: Record<number, string> };  // color index → character

  onion: OnionSettings;
  ui: { view: 'raster' | 'ascii'; hideReferences: boolean; currentFrameId: ID; currentTrackId: ID };

  tracks: Track[];                       // index 0 = top of the stack
  frames: Frame[];                       // at least one
}

interface ConversionSettings {
  style: 'ramp' | 'hybrid' | 'shape';
  ramp: string;          // non-empty characters, light → dense (space is implicit)
  shapeChars: string;
  threshold: number;     // 0–0.9
  density: number;       // gamma, 0.2–3
  hybridCutoff: number;  // 0–1
}
type ConversionOverride = Partial<ConversionSettings>;

interface OnionSettings {
  enabled: boolean;
  before: number; after: number;
  colorBefore: Hex; colorAfter: Hex;
  opacity: number;       // nearest frame, 0–1
  falloff: number;       // multiplier per additional frame
  wrap: boolean;
  scope: 'all' | 'current';
}

interface Frame { id: ID; duration: number }   // duration in ticks (hold), ≥ 1

interface Track {
  id: ID;
  name: string;
  kind: 'drawing' | 'reference';
  isStatic: boolean;
  visible: boolean;
  locked: boolean;
  opacity: number;                    // reference tracks only, 0–1
  conversion?: ConversionOverride;    // drawing tracks only
}

// Stored separately from the project JSON. Static tracks use frameId = 'static'.
interface DrawingCel {
  projectId: ID; trackId: ID; frameId: ID | 'static';
  version: number;                                  // increments on every edit (cache key)
  bbox: { x: number; y: number; w: number; h: number } | null;  // null = empty
  data: Uint8Array;                                 // bbox-sized indexed pixels (compressed at rest)
  conversion?: ConversionOverride;
}

interface ReferenceCel {
  projectId: ID; trackId: ID; frameId: ID | 'static';
  imageId: ID;
  transform: { x: number; y: number; scale: number; rotation: number };  // center in canvas px; rotation in radians
}

// Output of the conversion engine for one frame.
interface AsciiFrame {
  columns: number;
  rows: number;
  chars: Uint32Array;    // Unicode code point per grid cell, 0 = empty
  colors: Uint8Array;    // color index per grid cell
  owner: Uint8Array;     // claiming track position + 1, 0 = none
}

interface PaletteLibraryEntry { id: ID; name: string; swatches: Hex[] }

interface AppSettings {
  drawWithFinger: boolean;
  leftHanded: boolean;
  canvasRotation: boolean;
  tapGestures: boolean;
  hideReferencesDuringPlayback: boolean;
  autosaveDelayMs: number;
}

function rowsFor(columns: number, width: number, height: number): number {
  return Math.max(1, Math.round((columns * height) / (2 * width)));
}
```

---

## 18. Performance targets

Measured on a mid-range iPad from around 2020 or later:

- **Pencil latency:** pixels appear in the same animation frame as the input; no dropped input at 120 Hz.
- **ASCII update after a stroke** (dirty grid cells only): under 16 ms at 80 columns; under 50 ms at 320 columns in Shape style (worker).
- **Full-frame recompute** after a settings change: under 100 ms at 80 columns (Ramp); under 500 ms at 320 columns (Shape), with a busy indicator.
- **Playback:** steady 30 fps in ASCII view at 160 columns with 3 drawing tracks.
- **Launch to interactive:** under 2 seconds.
- **Capacity:** a project with 100 frames, 3 drawing tracks and 1 reference track (video import) stays within memory on a 4 GB iPad.

---

## 19. Build phases

Each phase ends with a stop for user testing (§0). Acceptance criteria must pass on a real iPad.

**Phase 0 — Foundations**
Vite + TypeScript + single-file build; 1-bit UI kit (window, button, menu bar and dropdowns, slider, segmented control, dialog, alert, dither patterns, fonts, first icons); Home ↔ Editor routing; IndexedDB layer; data model types; home-screen web app meta tags and icon.
*Accept:* the build produces one HTML file that opens on iPad; Home shows the empty state; projects can be created, renamed, duplicated and deleted; everything survives a reload.

**Phase 1 — Drawing on one frame**
Indexed cel buffer and display pipeline; pan, zoom, fit; pointer handling (pen vs touch, palm rejection); pen and eraser (round/square, sizes); current color with basic picker; background color; undo/redo with buttons and tap gestures; autosave.
*Accept:* smooth, gap-free, hard-edged lines with the Pencil at any zoom; fingers only navigate; two-finger tap undoes, three-finger tap redoes; the drawing survives a reload.

**Phase 2 — ASCII engine (Ramp)**
Grid math; per-grid-cell statistics; threshold and density; Ramp style with presets and custom ramp; glyph-atlas rendering; view toggle; live columns slider; grid overlay; drawing in ASCII view; unit tests.
*Accept:* toggling views is instant; the columns slider changes the grid live without altering the drawing; §5.10 Ramp targets are met; tests pass.

**Phase 3 — Tracks**
Multiple drawing tracks with occupancy; reference tracks (single image import, paste, drag and drop); opacity, visibility, lock, reorder; static tracks; global reference toggle; reference transform tool; merge down.
*Accept:* the §4.4 example reproduces exactly; references never appear in ASCII or exports; one tap hides all references.

**Phase 4 — Animation**
Frames; timeline (collapsed and expanded); holds; duplicate, reorder, delete, multi-select; playback modes and FPS; onion skin in both views; playback caches; memory management (§14.3).
*Accept:* a 48-frame test animation plays smoothly at 12 fps in both views; onion skin shows purple before and orange after; holds are respected; memory stays stable when scrubbing through all frames repeatedly.

**Phase 5 — Tools and color**
Fill (with boundary option); eyedropper (including long-press); select rectangle and lasso with transforms, copy/cut/paste in place across frames and tracks, snap to grid cells; palette library with import/export; replace color; remove unused colors.
*Accept:* ink on one track and fill on the track below works; a selection copied in frame 3 pastes in the same place in frame 4.

**Phase 6 — Conversion styles**
Shape-aware style (template matching in a worker); Hybrid; extended character set; settings cascade with "Apply to" UI and override markers; colors-to-characters mapping; ASCII font option; crisp glyphs.
*Accept:* all §5.10 targets; a track override and a cel override visibly change only their scope.

**Phase 7 — Import**
Bulk image import dialog with all options; video import with FPS sampling and trim.
*Accept:* 30 photos imported by name become 30 frames in the right order; a 5-second iPhone video at 12 fps becomes 60 frames; each size option behaves correctly.

**Phase 8 — Export**
All §15.2 formats except the nice-to-haves; share sheet and download; project file export and import.
*Accept:* each format opens correctly in another app (Photos, Files preview, a text editor, a browser); a `.buddy` file round-trips with no difference.

**Phase 9 — Polish**
Keyboard shortcuts (Appendix A); focus mode; left-handed layout; App settings and storage info; optional `sw.js` for offline use; About with licenses; ANSI and SVG exports; performance pass against §18 on iPad; final README with hosting instructions.

---

## 20. Testing

- **Unit tests (Vitest):** grid math and `rowsFor`; per-grid-cell statistics; threshold and density mapping; ramp selection; occupancy; settings cascade merge; shape matching on synthetic lines at 0°/45°/90°/135°; hybrid switching; TXT export; project file round trip; color table operations; undo/redo of structural commands.
- **Golden tests:** a few fixed test drawings stored in the repo with their expected TXT output, so any change to the engine is detected.
- **Manual iPad checklist** in `TESTING.md`, updated every phase. It covers both orientations, Split View, the home-screen web app, and a Safari tab.

---

## 21. Out of scope for v1 (candidates for later)

Manual per-grid-cell character editing; line, rectangle and ellipse tools; text tool; pressure sensitivity; stroke stabilizer; canvas resize and crop; audio track; gap closing for fill; global "replace this color in the cel" fill; playback in/out range; paste into all frames; cloud sync; importing ASCII text files; more than two ASCII fonts.

---

## Appendix A — Keyboard shortcuts

| Key | Action |
|---|---|
| B / E / G / I / M | Pen / Eraser / Fill / Eyedropper / Select (M again toggles rectangle/lasso) |
| [ / ] | Brush size down / up |
| A | Toggle Raster / ASCII |
| R | Toggle all references |
| O | Toggle onion skin |
| Return | Play / stop |
| Space + drag | Pan (mouse/trackpad) |
| , / . or ← / → | Previous / next frame (arrows nudge the selection when one exists) |
| N / Cmd+D | New frame / duplicate frame |
| Cmd+Z / Shift+Cmd+Z | Undo / redo |
| Cmd+X / C / V | Cut / copy / paste |
| Cmd+A / Esc | Select all / deselect (Esc also closes dialogs) |
| Delete | Delete selection content |
| 0 / 1 / + / − | Fit / actual pixels / zoom in / zoom out |
| F | Focus mode |
| Cmd+S / Cmd+E | Save now / Export |

## Appendix B — Touch gestures

| Gesture | Action |
|---|---|
| Apple Pencil | Use the current tool |
| One finger | Nothing on the canvas (draws if "Draw with finger" is on) |
| One-finger long-press | Eyedropper (when finger drawing is off) |
| Two-finger drag / pinch | Pan / zoom (and rotate, if enabled) |
| Two-finger tap | Undo |
| Three-finger tap | Redo |
| Timeline: swipe / tap / long-press | Scroll / select / frame or track menu |
