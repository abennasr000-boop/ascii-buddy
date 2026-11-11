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

## Phase 3 — Layers & references

- [ ] **Layers panel opens/closes, positioned clear of the top bar:** Layer menu → Open layers panel, or the menu-bar Layers icon. Shows every track top-to-bottom with a type icon (pencil/photo), name, eye, lock, and a settings gear, plus an "S" badge for static tracks. The window should open fully below the menu bar (and the iPad status bar), not overlapping either. The close box (×) responds to a real tap, not just a synthetic click.
- [ ] **Per-track settings open as a separate side window:** tap a row's gear icon — a second small window opens beside the Layers panel (not an inline dropdown requiring scrolling) showing Rename/Duplicate/Delete/static/merge/opacity, plus Fit/Fill/Reset/Apply for a reference track. Trying Fit, then Fill, then Reset in sequence should each take effect without the window closing; Delete or Merge down should close it (its subject is gone).
- [ ] **Add tracks:** the **+**/pencil and **+**/photo buttons add a new drawing/reference track above the current one and select it; the new track appears immediately in the panel and on canvas.
- [ ] **Select a track:** tapping a row (not its eye/lock icons) makes it current — highlighted, and the tool palette / Pen-Eraser-Select availability updates for its kind.
- [ ] **Visibility & lock are independent of selection:** tapping a row's eye or lock icon toggles that track without changing which track is current (this was a real bug during development — confirm it doesn't regress).
- [ ] **Hiding then re-showing the *current* track's drawing still repaints it** (also a real bug found during development — hide the current drawing track, then show it again; its content must reappear immediately, not stay blank).
- [ ] **Rename:** tap a track's name to open its menu, choose Rename, type a new name, press Return.
- [ ] **Duplicate track:** appears as "<name> copy" directly above the source, with the same content on every frame (or just the static cel, if static).
- [ ] **Delete track:** removes it and its stored cels/images; deleting the last remaining *drawing* track is blocked (menu item disabled, in both the Layers panel and the Layer menu).
- [ ] **Reorder by drag:** drag a row's handle (⠿) up/down in the list — the on-canvas stacking order updates to match (top of the list paints on top).
- [ ] **Make static / Make animated:** on a drawing track, toggling to static keeps only the current frame's drawing (shared across all frames, marked "S"); toggling back to animated copies that drawing into every frame.
- [ ] **Merge down:** draws something on two adjacent drawing tracks, Merge down on the top one — the result on the remaining (bottom) track shows both, with the top track's pixels winning where they overlap; the top track is removed.
- [ ] **Multi-track occupancy in ASCII view reproduces §4.4:** with two overlapping drawing tracks (different content in the same region), switch to ASCII view — the visually topmost track's characters win in overlapping grid cells (verify a few cells directly if in doubt: higher-track content should never be silently overwritten by a lower track's coverage).
- [ ] **Hidden drawing tracks are excluded from ASCII conversion**, not just visually hidden — hide a track that would otherwise claim some cells, and confirm the layer below now shows through in those cells in ASCII view too.
- [ ] **Import a reference image, primary path:** File → "Import image…", the menu-bar toolbar icon (the small photo icon next to Layers), or the Layers panel's "Import image as reference…" button — each opens the native iPad Photos/Camera/Files picker; picking a photo lands it on a new reference track (or the current one, if it's already a reference track) with a default "Fit" transform, faded to ~50% opacity. This is the reliable path — start here.
- [ ] **Import a reference image, secondary paths:** drag-and-drop an image onto the canvas from Photos/Files in Split View; Edit → "Paste image as reference" after copying a photo, or a real ⌘V with a keyboard attached. If clipboard paste doesn't work on your iPad/browser (iPadOS Safari's image-clipboard support is inconsistent), you should see a clear dialog saying so and pointing back at Import — not silence. That dialog appearing (rather than nothing happening) is itself a pass.
- [ ] **Bulk multi-image import and video import are not built yet** (Phase 7) — File → "Import video…" stays disabled, and image import only ever takes one file at a time. This is expected, not a bug to report.
- [ ] **Reference transform handles:** with a reference track current and the Select tool active, drag inside the image to move it, drag a corner handle to scale (uniformly, from center), drag the handle above the image to rotate. Handles should now be comfortably tappable (they stay a constant ~32px on screen regardless of zoom or the image's own scale — previously they could shrink to a few px and were very hard to grab).
- [ ] **Pan/pinch-zoom work normally with a reference track selected:** this was completely broken (two-finger gestures did nothing) whenever the current track was a reference track — confirm two-finger drag pans and pinch zooms the canvas the same as with a drawing track selected.
- [ ] **A second finger during a transform drag hands off cleanly:** start dragging a corner handle with one finger, then rest or add a second finger elsewhere on the canvas — the transform drag should stop reacting (no jump/fight) and the two fingers should smoothly take over as a pinch/pan gesture instead.
- [ ] **Transform handles keep working across repeated attempts, not just the first, at any image size:** move, then scale, then rotate, then move again, several times in a row — including after shrinking the image well below canvas size. The actual bug (found and fixed this round): a drawing track stacked *above* the reference track in the layer order was silently intercepting taps landing inside the canvas bounds, since its read-only preview canvas had no reason not to. If you still see this fail with only one reference/drawing track (no stacking), that's a different bug — say so specifically.
- [ ] **Fit / Fill / Reset / Apply to all cels in track:** in a reference track's menu, each button visibly changes the transform as expected; "Apply to all cels in track" copies the current frame's transform to every other frame's reference cel on that track.
- [ ] **Reference opacity slider** (per-track, in its menu) visibly fades the image in real time.
- [ ] **Select tool auto-enables only for reference tracks:** switching the current track to a reference track auto-switches the active tool to Select (and Pen/Eraser become disabled); switching to a drawing track switches back to Pen.
- [ ] **Locked drawing tracks can't be drawn on:** lock a drawing track, try to draw on it — no mark appears; Pen/Eraser show disabled while it's current.
- [ ] **One tap hides all references:** the menu-bar eye icon, `R` key, or View → Hide all references hides every reference track's image at once, without changing any individual track's own eye state — toggling it back restores exactly what was visible before.
- [ ] **References never show up as ASCII characters** — with a reference track visible and overlapping some drawing content, switch to ASCII view: the reference image may still be faintly visible underneath (for tracing), but no part of it is ever converted into characters.
- [ ] **Everything above survives a reload** — force-quit and reopen (or just reload): track order, visibility, lock, static/animated, names, reference images and their transforms are all exactly as left.
- [ ] `npm run test` passes (Vitest — includes `occupancy.test.ts`'s reproduction of the §4.4 worked example).

## Phase 4 — Animation

- [ ] **Add / duplicate / delete a frame:** Frame menu or the timeline's transport bar. New frame inserts blank right after the current one and selects it. Duplicate copies every animated track's current cel (drawing and reference) into a new frame right after. Delete removes the current frame and its cels; deleting down to the very last frame is blocked everywhere (Frame menu item disabled, timeline still shows one frame).
- [ ] **Frame navigation:** first/previous/next/last transport buttons, `,`/`.` keys (external keyboard), and tapping a frame chip in the timeline strip or a column in the expanded grid all move to the right frame and update the canvas.
- [ ] **Hold (duration):** Frame menu → Hold…, or long-press a frame's chip/header → Hold… — set it above 1 and confirm the timeline strip shows "×N" next to that frame's number, and that frame visibly stays put for N ticks during playback (at 12fps a hold of 3 should linger noticeably longer than a hold of 1 next to it).
- [ ] **Multi-select:** long-press a frame to start a selection (a small toolbar appears at the bottom: Duplicate / Hold… / Delete / Done), then tap another frame to extend the range — confirm the count shown matches how many frames are between the two taps inclusive. Duplicate/Delete/Hold… act on the whole selection at once; Done clears the selection without changing anything.
- [ ] **Reorder frames by dragging:** (**touch: long-press a frame until it lifts, then drag; a plain swipe scrolls the strip instead. Mouse: just drag.**) an insertion marker shows where it will land and the frame moves once on release — no lag, no frames shuffling under your finger; a plain tap that drifts a little must never reorder. Also try dragging near the strip's left/right end (it auto-scrolls) and with a held frame in the expanded grid (no overlap).  drag a frame chip (collapsed strip) or column header (expanded grid) to a new position — the frame list reorders and the dragged frame's *content* moves with it (its cels don't get reassigned to whatever frame number is now in that slot).
- [ ] **Timeline collapsed vs. expanded:** the expand/collapse button (▲/▼, bottom-right of the transport bar) and View → Expand timeline both toggle the same state. Expanded shows a grid: one row per track (with a "[S]" marker for static tracks, shown as one continuous bar spanning every frame) and one column per frame, with a dot in any cell that has content. The current frame's column and current track's row should be visually distinguishable. Portrait orientation should default to expanded; landscape to collapsed — and rotating the iPad should flip the toggle to match.
- [ ] **Playback — Loop (default):** press Play (▶, the timeline's play/stop button, or Return) — frames advance smoothly and continuously at the project's FPS, looping back to frame 1 after the last frame. Press Stop (■, or Return again) — playback halts on whatever frame it was showing, and that becomes the real current frame (navigating away and back should show the same frame, not reset to frame 1).
- [ ] **Playback — Ping-pong:** Frame menu (or the timeline's mode label, tap to cycle) → Ping-pong. Play from near the end of the animation — frames should count *down* after reaching the last frame, then count back *up* after reaching the first, indefinitely.
- [ ] **Playback — Once:** switch to Once, play from partway through — playback advances to the last frame and stops there on its own (no button press needed), rather than looping or bouncing.
- [ ] **FPS:** Frame menu → "FPS… (N)", or tap the "N fps" label in the timeline — a slider (1–60) plus presets (6/8/12/15/24/30). Changing it visibly speeds up or slows down playback.
- [ ] **Playback works in both views:** play once in Raster view, once in ASCII view — both should look smooth, not stuttery, and show the right content advancing.
- [ ] **A long animation (30-50+ frames) plays smoothly in Raster view, not just ASCII** — this was a real bug during development (only the first ~12 frames of a full-resolution 2048×1536 canvas fit the raster cache's memory budget; everything after played blank). If you have a large canvas and many frames, confirm the whole animation shows content throughout, not just the first several seconds.
- [ ] **Drawing stops playback:** while playing, start a stroke with the Pencil (or tap the canvas) — playback stops immediately rather than fighting with the draw.
- [ ] **Onion skin, Raster view:** View → Onion skin (or the onion toggle icon, or `O`) — with content on an adjacent frame, it should show through faintly, tinted **purple** for the frame(s) before and **orange** for the frame(s) after (the default colors), underneath the current frame's own (full-opacity, untinted) drawing.
- [ ] **Onion skin, ASCII view:** same toggle, switch to ASCII — neighboring frames' characters should appear (in the tinted onion color) only in grid cells that are *empty* in the current frame; cells with current-frame content are never covered by onion characters.
- [ ] **Onion settings:** View → Onion settings… — Frames before/after (0–5 each), the before/after colors (native color picker), opacity, falloff per frame, "wrap around the loop", and "All visible tracks" vs. "Current track only" scope. Each should visibly change the onion preview without needing to leave and reopen the window.
- [ ] **Onion skin is hidden during playback** — turn it on, then press Play: the tinted neighbor-frame preview should disappear while playing and reappear once stopped.
- [ ] **Static and reference tracks are never onion-skinned**, even with "All visible tracks" selected — only animated drawing tracks contribute to the onion preview.
- [ ] **Memory stays reasonable when scrubbing repeatedly**: jump rapidly back and forth across many frames (first → last → first, several times, or drag through the whole expanded-grid frame range) — the app should stay responsive with no crash, reload, or obvious slowdown building up over time.
- [ ] **Undo/redo covers frames:** after New/Duplicate/Delete frame (single and multi-select), Hold… (one step per dialog, not per slider tick) and a reorder, Undo (button, ⌘Z, two-finger tap) reverses each and Redo reapplies it; undoing a delete brings the drawing back. Undoing a stroke made on another frame jumps to that frame first.
- [ ] **Drawing is never lost on frame changes:** draw on a frame, and *immediately* (within a second) add a frame / tap another frame / duplicate / press Play — go back and the drawing is there. Repeat quickly across several frames.
- [ ] **ASCII-view playback shows only ASCII** (no raster ghost on top); Raster-view playback shows only raster.
- [ ] **Everything above survives a reload**: frame order, holds, FPS, playback mode, and onion settings are all exactly as left after a reload.
- [ ] `npm run test` passes (Vitest — includes `playbackMath.test.ts`'s reproduction of §9.2's "48 frames at 12fps" acceptance example, and Loop/Ping-pong/Once stepping).

## Phase 5 — Tools and color

Set up: a project with a few frames, at least two drawing tracks, and some line art. Tools act with the Pencil (or a finger if "Draw with finger" is on in App settings); with fingers only, navigation gestures stay as before.

**Fill**
- [ ] **Fill (G):** tap inside a closed shape — the region fills with the current color, exactly to the line (no leaks, no halo), including thin 1px outlines. A diagonal line is a solid boundary (fill never leaks through the corner of a diagonal).
- [ ] **Ink on one track, fill on the track below (§19 acceptance):** draw an outline on an upper track, select the track *below* it, Fill inside the outline — the color lands on the lower track (check in the Layers panel: hide the upper track and only the fill remains) and stops at the upper track's lines. The palette's **Edges** option: *All* (default) uses every visible drawing track as boundaries; *Track* uses only the current one (the fill then runs straight through the other track's lines).
- [ ] Fill in **ASCII view** works and the characters update; **Undo** removes exactly one fill; a fill on a locked or reference track is disabled.
- [ ] **Fill a big open area** (whole canvas) — instant on your iPad, no freeze.

**Eyedropper**
- [ ] **Tool (I):** tap a drawn color — it becomes the current color (a ring flashes at the spot) and is added to the color table if new. Tapping the paper picks the paper color.
- [ ] **Long-press (~0.4 s) with one finger** anywhere on the canvas, with any tool and *Draw with finger* off — same as the tool. It must not trigger while panning or during a two-finger gesture.
- [ ] **Sample from a reference photo:** with a visible reference track, the eyedropper picks the photo's color under the point (opacity and transform are honoured). Hidden references are not sampled.
- [ ] **In ASCII view** it picks the color of the character in that grid cell (paper if the cell is empty).
- [ ] Works on a locked track and on a reference track (it only reads).

**Select — rectangle & lasso**
- [ ] **Rectangle (M):** drag out a rectangle — marching ants (black/white dashes, animated) appear plus an action bar (⇋ ⇅ ↻ Copy Cut Delete Snap Done) and eight handles. **Lasso:** press **Lasso** in the tool options (or press **M** again) and drag a freehand loop — only pixels inside the loop are selected.
- [ ] **Move:** drag inside the selection — the pixels lift and follow your finger; release, then tap outside to commit. The whole move is **one** undo step (Undo puts everything back).
- [ ] **Scale:** drag a corner handle (keeps proportions) or an edge handle (stretches one axis) — hard-edged nearest-neighbour, never blurry or smoothed.
- [ ] **Flip ⇋ / ⇅ and rotate 90° ↻** each work in place (and stack). **Delete** clears the selected pixels; **Cut** = Copy + Delete; **Done** or **Esc** commits and deselects; tapping empty canvas commits too.
- [ ] **Commits on change:** floating selection is committed (not lost) when you change tool, track, or frame, start a stroke, press Undo/Redo, or send the app to the background.
- [ ] **Copy on frame 3, paste on frame 4 (§19 acceptance):** select + Copy, go to the next frame, Edit → Paste (or ⌘V with a keyboard) — the selection appears floating in exactly the same place; tap outside to commit. Also paste onto a *different track*.
- [ ] **Select all (⌘A / Edit menu)** selects the whole cel; **Delete** empties it in one undo step.
- [ ] **Snap to grid cells:** turn **Snap** on in the action bar (default: on in ASCII view, off in Raster) — moves jump in whole grid cells; in ASCII view the characters shift cleanly. Arrow keys nudge 1 px, Shift+arrow one cell (with a keyboard).
- [ ] **Colors travel with a paste:** copy pixels in one project, open another project, paste — the colors are added to the second project's table and look identical.
- [ ] **Select on a reference track** is still the image transform tool (move / scale / rotate handles) — unchanged from Phase 3. Switching back to a drawing track returns you to Pen.
- [ ] **Undo across frames:** draw on frame 1, go to frame 3, press Undo — it jumps to frame 1 and undoes there (this was silently doing nothing before Phase 5's fix).

**Palettes & colors**
- [ ] **Colors window:** tapping a swatch uses it; **+** adds the current color; **long-press** a swatch → *Replace color…* / *Remove from palette*; **drag** a swatch onto another to reorder. Palette edits are undoable.
- [ ] **Library:** *Load palette…* menu lists the starter palettes (Ink, Terminal, Sunset, Harbor); loading one replaces the *project's* palette copy only. **Save…** stores the current palette under a name (same name = overwrite). **Manage…** → Rename, Duplicate, Delete (asks twice), Load into project.
- [ ] **Import / export:** Manage… → *Export .hex* / *Export .gpl* downloads a file (check it opens as text / in GIMP); *Import file…* picks a `.hex` (Lospec: one color per line) or `.gpl` and adds it to the library. Try re-importing what you just exported. (On iPad Safari, exports go through the normal download prompt; the share sheet arrives in Phase 8.)
- [ ] **Replace color…** (Edit menu, or the long-press menu on a swatch): pick a color that's in the artwork, choose a new one — every pixel using it changes across **all frames and tracks** at once, in both views. **Undo** restores it.
- [ ] **Remove unused colors** (Edit menu, or the Colors window): tells you how many will go, warns it clears undo history, then compacts the table — artwork looks identical afterwards and after a reload. If nothing is unused it says so.
- [ ] **Color-table-full message** now points at *Remove unused colors*.
- [ ] Everything above survives a reload (palette library, project palette, replaced colors).
- [ ] `npm run test` passes (Vitest — includes `fill.test.ts`, `selection.test.ts`, `paletteFormats.test.ts`, `colorTable.test.ts`).

### Project isolation (regression checks — added after the "projects got mixed up" report)

- [ ] **Have 3+ projects** with visibly different drawings/frame counts. Open each one in turn, leave, open another — **each shows only its own drawing, frames and colors**, every time, including when you tap a card quickly right after coming back to the list.
- [ ] **The project list never re-orders after it appears.** Edit an older project, go back: it is at the top immediately and stays there (no shuffle a moment later).
- [ ] **Leave immediately after drawing** (within a second), then reopen: the stroke, new frames and any new color are all there.
- [ ] **Open a project while another was in ASCII view / had onion skin / a selection / was playing:** the new project starts clean — no ASCII characters, onion tint or selection from the previous one, even for a moment.
- [ ] **Duplicate a project that has a reference image**, then delete the *original*: the duplicate still has its reference image.
- [ ] Let a friend create a project and draw on it, then use yours as normal — nothing of hers appears in yours and vice versa.

## Phase 6 — Conversion styles

Set up: a project with a few different marks — a long horizontal line, a vertical line, two diagonals, a filled blob, and a small curve — on two drawing tracks, at least two frames. Open **ASCII menu → Open ASCII window**; switch to **ASCII view**.

**Style**
- [ ] **Shape:** horizontal lines read as `- - -`, vertical lines as `|`, diagonals as `/` and `\` chains, curves as `( )`. A tiny stray dot becomes a light mark (`.` `'` `,`), and raising **Threshold** slightly removes it. Draw the same line at a few different heights inside the cells — it should keep reading as a dash/bar, not turn into random symbols.
- [ ] **Hybrid:** strokes become shape characters while a filled blob becomes dense ramp characters; the **Hybrid cutoff** slider moves the boundary (higher = more shape).
- [ ] **Ramp** still works exactly as before (presets, custom ramp, Threshold, Density).
- [ ] **Shape characters** field: **Default** restores the tuned set; **+ Heavy** adds `+ x = o [ ] < > ^ v` (expect chunkier results); typing your own set works, and an empty/unusable set falls back to the ramp instead of blanking.
- [ ] Switching styles / dragging sliders at **320 columns** with lots of ink stays responsive (the conversion runs in a background worker; the previous frame stays on screen until the new one is ready).
- [ ] **Undo/redo, playback, onion skin** all look right in Shape and Hybrid (play a few frames in ASCII view; turn on onion skin).

**Character set, font, glyphs**
- [ ] **Character set → Extended:** the **Blocks** ramp preset appears (`░▒▓█`) and looks right; in Shape/Hybrid, box-drawing and block characters become candidates.
- [ ] **ASCII font → Smooth** swaps to JetBrains Mono (rounder glyphs); back to **Pixel** restores Departure Mono. Shape results re-adapt to whichever font is active.
- [ ] **Crisp glyphs** on = hard 1-bit edges; off = softer, anti-aliased glyph edges. Zoom in to compare.

**Characters by color**
- [ ] **Characters by color → Edit…:** every color in the project appears with a text box; type a character next to a color, tick the box — cells whose dominant color is that color now use that character in every style; unmapped colors use the style. **Threshold** still decides which cells are empty. **Clear all** empties the table.

**Settings cascade (Apply to: Project | Track | Cel)**
- [ ] With **Apply to → Track**, change Style/Ramp/Threshold: only the current track changes; other tracks still follow the project. A **●** appears beside each field overridden here (tap the ● to inherit that one field again); **Reset to inherited** clears the track's whole override. The track shows a **◆** in the timeline's row header and the Layers panel.
- [ ] With **Apply to → Cel**, change a setting: only the **current frame's** cel of that track changes (step to another frame — it uses the track/project settings). The cel gets a **◆** in the expanded timeline grid. **Reset to inherited** removes it. On a *static* track the single static cel is what's overridden.
- [ ] The cascade order is project → track → cel: set the track to Ramp and one cel to Hybrid — that cel is Hybrid, the rest of the track Ramp.
- [ ] **Layer menu → Conversion override…** opens the ASCII window already on **Track**.
- [ ] Project-only settings (Columns, Character set, ASCII font, Crisp glyphs, Characters by color) are dimmed with a hint unless **Apply to** is **Project**.
- [ ] **Everything survives a reload** — track overrides, cel overrides (and their timeline markers), character set, font, crisp glyphs, and the characters-by-color table.
- [ ] **Zoomed-out fills stay present:** fill a big area in Shape mode, then pinch out a long way — it becomes a pale texture (thin strokes averaged by display scaling) but is *not* blank: zoom back in and every character is there; toggle Hybrid and the fill reads as dense characters. (Crisp glyphs on and off both keep every glyph visible at small sizes.)
- [ ] `npm run test` passes (Vitest — includes `glyphMask.test.ts`, `shapeMatch.test.ts`, `shapeTargets.test.ts` (real pen strokes against the real Departure Mono glyph masks) and the extended `gridStats`/`occupancy` tests).

## Phase 7 — Import

Set up: on the iPad, have ~30 photos in Photos or Files (ideally named so a plain sort is wrong, e.g. `IMG_2`, `IMG_10`), and a short iPhone video (5–10 s, `.mov`).

**Bulk images**
- [ ] **File → Import images…** opens the native picker with multi-select (Photos, Camera, Files). Picking several opens the **Import images** dialog with a summary line, e.g. "30 images → frames 1–30 on new track ‘Reference 1’".
- [ ] **Order — By file name (default)** puts `IMG_2` before `IMG_10` (natural sort); **As selected** keeps the order you tapped them. Import 30 photos by name → **30 frames, in the right order** (step through them).
- [ ] **Size:** *Fit* (whole image, letterboxed), *Fill* (covers the canvas and is **cropped at the paper's edge** — nothing hangs outside), *Stretch* (distorted to the canvas shape), *Original* (native pixel size, centred; shrunk if bigger than the canvas). Try each on a portrait and a landscape photo.
- [ ] **Start at:** *Frame 1* (default if the project is one empty frame), *Current frame*, *After last frame* (default otherwise). Frames are created as needed with hold 1; existing drawings on other tracks are untouched.
- [ ] **Into:** *New reference track* or an existing reference track. Importing over frames that already have images on that track shows "⚠ Replaces N existing cels…" and asks to **confirm**; Undo restores the originals.
- [ ] **Progress bar with Cancel:** Cancel partway leaves the project *exactly* as it was (no extra frames, track or images). The whole import is **one undo step** (Undo removes every frame/track/image the import added; Redo brings them all back).
- [ ] A file that can't be read is skipped and reported afterwards; the rest import.
- [ ] **Quick paths unchanged:** the toolbar/Layers-panel photo button with *one* image still drops it straight onto a reference track (no dialog); with several images it opens the dialog. **Dragging several images** from Photos/Files onto the canvas (Split View) opens the dialog; a single dragged image goes straight onto the current reference track.
- [ ] Imported images are downscaled (never bigger than the canvas) — check Storage on the Projects screen stays sensible after 30 photos.

**Video**
- [ ] **File → Import video…** opens the dialog with a **preview thumbnail** and Start/End sliders (the preview follows whichever handle you move), **Sampling FPS** (default = project FPS) and a live readout like "4.2 s × 12 fps = 50 frames".
- [ ] A **5-second iPhone video at 12 fps → 60 frames** (§19 acceptance). Try trimming to a middle section and a different FPS.
- [ ] **Set project FPS to match** changes the project's FPS to the sampling FPS.
- [ ] Above **300 frames** the dialog warns about memory and storage.
- [ ] The frames really are successive moments of the video (step through them / press Play), sized per the Size option.
- [ ] Cancel during extraction rolls everything back; Undo after an import removes all its frames and the track.
- [ ] `.mov`/HEVC (iPhone default) and `.mp4` both open. **If frames come out blank, identical, or extraction is very slow, tell me the video's format and length** — extraction uses an HTMLVideoElement seek per frame (see DECISIONS.md), verified here only in a desktop browser.
- [ ] Everything above survives a reload.
- [ ] `npm run test` passes (Vitest — includes `importPlan.test.ts`).

### Long animations (added after the 189-frame report)

- [ ] **Import a video / ~150+ photos**, then **swipe the timeline strip left and right with one finger** — it scrolls smoothly and never reorders or selects anything. In the expanded grid, swiping scrolls both ways and doesn't select cells or tracks under your finger.
- [ ] **Reorder** now needs a deliberate **long-press**: hold a chip until it lifts (a tick + inverted look), then drag to the insertion marker and release. Release without moving keeps it as a multi-selection (tap another chip to extend the range). The strip auto-scrolls near its edges while you drag.
- [ ] **Multi-select is frame by frame:** long-press frame 10 (it lifts; release), then tap frame 17 — only 10 and 17 are selected ("2 selected"). Tap 17 again — it deselects. Tap 3 — 10 and 3 are selected, nothing else changes.
- [ ] **Range toggle:** in the selection bar, turn on "Range" (it highlights); the range starts from the last frame you selected (say 10): tap 17 — frames 10–17 are all selected. Tap 3 — the selection becomes 3–10. Turn Range off and taps go back to one by one. Done clears the selection and turns Range off.
- [ ] **|◀ ◀ ▶ ▶|** always bring the current frame into view: scroll the strip away by hand, press |◀ — frame 1 comes back into view (also when you were already on frame 1). Report it if any frame at the start can't be reached.
- [ ] **Playback of an imported video / photo sequence:** press Play — the timeline shows "Preparing n/N…" briefly, then **the reference image changes on every frame** (not frozen on the first). Check Raster view *and* ASCII view (references faintly under the characters), Loop / Ping-pong / Once, and a hold on one frame. Quality is reduced on very long animations (one shared memory budget) — smooth motion matters more here than sharpness.

## Phase 8 — Export

Set up: a project with a few drawn frames (ideally one with a hold, a reference photo on a track, and both a drawing and an ASCII look you like). Each export opens in another app — that's the acceptance test.

**Export dialog (File → Export…)**
- [ ] The dialog offers **Format** (PNG, PNG sequence, GIF, MP4, PDF, TXT, Copy text, HTML player, Sprite sheet), **Content** (ASCII view / Raster view), **Frames** (All / Current / Range from–to), **Size** (1× 2× 4× Custom width, with the resulting "W × H px" shown) and **Background** (Project color / Transparent) — each only where the format uses it. Your choices are remembered for the next export in the same session.
- [ ] **Export** shows a progress bar; **Cancel** stops it and returns to the options with nothing saved.
- [ ] A size the iPad can't render (for example 4× on a big canvas) shows a warning and disables Export.
- [ ] **After rendering, tap Share…** — the iPad share sheet opens (Save to Files, Save to Photos, AirDrop, Messages…). **Download** saves via Safari's download. Both work for every format.
- [ ] **Always excluded:** reference photos, hidden tracks, onion skin, the grid overlay and any selection never appear in an export (check with a reference photo and onion skin on).
- [ ] The last strokes you drew (within the last second or two) are in the export.

**Each format — open the result in another app**
- [ ] **PNG** (ASCII and Raster): opens in Photos/Files preview; ASCII lines are crisp and complete (including long straight lines); Transparent background shows through in an app that supports it. File name like `Walk cycle_ascii_f0004.png`.
- [ ] **PNG sequence:** a `.zip` (Files can unzip it) with `name_0001.png…`; a held frame appears once, or repeated when "Repeat held frames…" is on.
- [ ] **GIF:** plays in Safari/Messages at the right speed and loops; a held frame stays longer; "Once" stops after one run; Transparent shows the page behind it. With FPS above 50 the dialog warns.
- [ ] **MP4:** plays in Photos/Files at the right speed with the holds respected; "Repeat animation 3 times" gives a video three times as long. If the iPad can't encode it, the dialog says so and suggests GIF (report that message if you see it).
- [ ] **PDF:** *One per page* (A4, Letter, Fit artwork; orientation Automatic/Portrait/Landscape) and *Contact sheet* (frame numbers under each frame; many frames → several pages). In an ASCII PDF, try selecting/searching text on the page in Files/Books (it is a plain-text stand-in over the picture).
- [ ] **TXT:** opens in a text editor with the ASCII laid out as on screen; `--- frame N ---` between frames (or form feeds); "Trim trailing spaces" works; extended characters (box/block) display correctly.
- [ ] **Copy text:** shows the current frame's text and a Copy button; paste it into Notes and check it looks right (use a monospaced font). **File → Copy frame as text** copies in one tap.
- [ ] **HTML player:** open the `.html` in Safari — colored ASCII, correct FPS/holds/playback mode, Play/Pause works, text is selectable, background color is the project's. Works fully offline.
- [ ] **Sprite sheet:** one PNG grid of the frames; with the JSON option you get a `.zip` with the PNG and a JSON listing each frame's rectangle and duration (ms).

**Project files (.buddy)**
- [ ] **File → Export project file…** (in the editor) and **Export project file…** in a project's ⋯ menu on the Projects screen both produce `<name>.buddy` you can Share or Download. The ⋯ menu shows **Last backup: never / n days ago**, updated after an export.
- [ ] **Import project file** (Projects screen) opens the file picker; choosing that `.buddy` creates a **new project** ("… copy" if the name exists) that looks and animates identically — drawings, frames, holds, references, colors, ASCII settings including track/cel overrides. Importing the same file twice makes two copies.
- [ ] Airdrop the `.buddy` to another device/browser (or delete the project, then import) and check nothing is different. Choosing a file that isn't a project shows a clear message and changes nothing.
- [ ] **Storage full:** if a save ever fails, an alert appears in the editor offering **Export project file** (hard to test on purpose — report it if you see it).
- [ ] `npm run test` passes (new: `exportPlan`, `textExport` (incl. the golden drawing), `htmlPlayer`, `pdfWriter`, `gifPalette`, `projectFile` round trip, `backupLabel`).

## Phase 9 — Polish

**Icons** (the first thing to look at)
- [ ] **Projects screen:** the settings button is the **hammer and sickle** you supplied (crisp, not fuzzy); the About button is a centred, clean **i in a circle**; each project card's menu button is three dots.
- [ ] **Editor toolbar / menu bar:** the little heart opens the app menu; Raster/ASCII, reference eye, "+ photo" (import), **Layers** (a stack), onion skin (two sheets), undo, redo and focus mode are all clear and sharp. Undo/redo dim when unavailable.
- [ ] **Tool palette:** pencil, eraser, drop (fill), eyedropper, dashed select — recognisable at a glance, all the same visual weight.
- [ ] **Timeline:** first / previous / play (turns into a stop square) / next / last, "new frame" (a frame with a +), and the chevron that expands/collapses the timeline.
- [ ] **Layers panel:** pen / photo track type, eye (open ⇄ struck through), padlock (closed ⇄ open), settings (hammer and sickle again), and the three "add" buttons are distinguishable.
- [ ] Tell me any icon that still looks unclear, off-centre or inconsistent. (A contact sheet of every icon: `node tools/icon-sheet.mjs sheet.svg`.)

**Focus mode and layout**
- [ ] **F** (or View → Focus mode, or the toolbar button) hides the menu bar, tool palette, timeline and windows; only the canvas and a small exit button (top-right) remain. The Pencil still draws; two-finger pan/zoom and two-finger-tap undo still work. **F**, **Esc** or the button leave it.
- [ ] **Left-handed layout** (App settings) puts the tool palette on the right, with its divider on the correct side.
- [ ] Both orientations, Split View and the home-screen app still lay out correctly (safe areas respected).

**Shortcuts** (Magic Keyboard): go through the table in README.md. Also **⌘E** opens Export, **⌘S** saves, and letter keys do nothing while a dialog is open.

**App settings**
- [ ] **Autosave delay** can be changed; **Persistent storage** shows Granted / Request / Not supported (tapping Request may or may not be granted by Safari — either is fine); storage used shows.
- [ ] **Canvas rotation gesture** says "Not available yet" (known gap).

**More exports**
- [ ] **ANSI text:** export and `cat` the `.ans` file in a terminal (Mac Terminal, iTerm) — colored characters; with several frames it plays as a flip-book. "Paint the project's background color" toggles the background.
- [ ] **SVG:** opens in Safari / Illustrator / Figma / Inkscape; the text is real text, laid out on the same grid as the app; transparent background works.

**Offline** (hosted build only)
- [ ] Open the hosted app once online, then turn on airplane mode and open it from the Home Screen: it loads and your projects are there.
- [ ] After deploying a newer build, open the app online once, then close and reopen it: it's the new version.

**Performance on the iPad** (§18 — please note anything that feels slow)
- [ ] Pencil ink appears with no visible lag; ASCII catches up right after the stroke lifts (80 columns), and at 320 columns in Shape it's still smooth.
- [ ] Changing a setting (columns slider, style) at 80 columns updates instantly; at 320 columns Shape shows the busy state briefly.
- [ ] Playback at 30 fps in ASCII view at 160 columns with 3 drawing tracks is steady.
- [ ] Launch from the Home Screen to usable in about 2 seconds.
- [ ] A 100-frame project with 3 drawing tracks and a video-imported reference track opens, plays and exports without the tab reloading.

## 1.0 final pass

- [ ] **Projects screen:** every project card shows a **thumbnail of its first frame** (after you've opened and left it once; imported projects get one straight away). Long-press a card → its menu opens (and the project doesn't open); a normal tap opens it.
- [ ] **File → Project settings…** opens with General / Canvas / ASCII / Onion tabs; renaming, background, FPS and playback mode take effect; the Canvas tab shows the size and lets you change columns.
- [ ] The **struck-through eye** (hide references, hide a layer) is clear at a glance, both black-on-white and inverted on the selected layer row.
- [ ] About shows **Version 1.0.0**.
