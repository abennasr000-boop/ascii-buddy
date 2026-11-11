# Ideas

Things that are not in ASCII_BUDDY_SPEC.md — not scheduled, just captured so they don't get built by accident.

- A shared "popover" utility for menus/dropdowns that always escapes ancestor `overflow` clipping (Home's project-card menu needed a one-off fixed-position fix for this; the Layers panel's per-track menu has the same issue — it can require scrolling the track list to see its lower items — worth generalizing now that a second instance exists).
- Visible keyboard focus rings for menu items and preset buttons, for external-keyboard users on iPad (Magic Keyboard) — spec doesn't call for this explicitly but it's cheap accessibility.
- Selection: a "lock proportions" toggle for corner handles (today corners always keep proportions and the edge handles stretch one axis), and arbitrary-angle rotation (spec keeps it out of v1).
- Eyedropper loupe/preview while long-pressing, showing the color that will be picked before release.
- Palette manager: drag-to-reorder library palettes; bulk export of the whole library as a zip.
- Shape matching: orientation-aware matching (edge direction per cell) to make half-offset diagonals read as clean `/` chains — today a diagonal that straddles two cells per row is broken into fragments like `_[`.
- A proper "Shape characters" picker (tap glyphs on/off from a grid) instead of a free-text field; per-glyph weights.
- Live "Preparing glyphs…" hint in the ASCII window while shape templates render after switching font/characters.
- Make ASCII-window setting changes undoable (they, like other project settings, currently are not).
- Video import: a scrubbable filmstrip for choosing the trim range, and reading video with WebCodecs/Mediabunny for faster, frame-exact extraction than seeking an HTMLVideoElement (worth trying if seeking proves slow for long clips on iPad).
- Import dialog: remember the last-used Size/Order/Start-at choices between imports.
- Reference tracks that keep the *whole* imported image when Fill (crop) is chosen (today the crop is baked in, so it can't be un-cropped later).

## From Phase 8 (export)

- **Vector text in PDF**: embed the ASCII font (needs TTF conversion of the woff2) and draw the art as real glyphs instead of a bitmap plus an invisible Courier layer.
- **Export in a Web Worker** (OffscreenCanvas + font loading in workers) so a very long export never touches the UI thread — today it yields between frames.
- **Project file as a stream** for very large projects (the whole `.buddy` is built in memory now).
- **Export presets** (remember "GIF 2×, transparent" per project), and an export **preview** with an estimated file size.
- **Playback mode in GIF/MP4** (ping-pong baked into the file) — the HTML player already honors the project's mode.

## From Phase 9

- **Canvas rotation gesture** (App setting, snaps to 0/90/180/270 within 10°): the setting is listed but nothing implements it. Needs a rotation in the viewport transform and the inverse in every screen→canvas mapping (drawing, selection, references, overlays, eyedropper).
- **Theme the icon hover/pressed states**, and an icon-only high-contrast mode.
