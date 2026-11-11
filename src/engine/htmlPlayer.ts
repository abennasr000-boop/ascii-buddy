// Builds the self-contained HTML player export (§15.2): the colored ASCII animation as real text in a
// <pre> with colour spans, the font embedded, and a tiny script for play/pause, FPS, holds and the
// playback mode. Pure string building — no DOM — so it can be unit tested.
import type { AsciiFrame, Hex } from '../types/model';

export interface PlayerFont {
  family: string; // CSS font-family name used in the page
  base64: string; // the woff2 file
}

export interface HtmlPlayerInput {
  title: string;
  background: Hex;
  colors: Hex[]; // the project colour table (index → hex)
  frames: AsciiFrame[];
  durations: number[]; // hold, in ticks, per frame
  fps: number;
  mode: 'loop' | 'pingpong' | 'once';
  fonts: PlayerFont[];
  fontStack: string; // CSS font-family list, e.g. "'Departure Mono', monospace"
  /** Advance width of the font as a fraction of its font size (used to fit the art to the window). */
  advanceEm: number;
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** One frame as HTML: runs of same-coloured characters become one <span class="cN">. Empty cells are spaces
 * that simply continue the current run, so the markup stays short. */
export function frameToHtml(frame: AsciiFrame): string {
  const rows: string[] = [];
  for (let row = 0; row < frame.rows; row++) {
    let html = '';
    let runColor = -1;
    let run = '';
    const flush = () => {
      if (!run) return;
      // spaces have no visible colour, so a run of only spaces needs no span
      html += runColor > 0 && run.trim() !== '' ? `<span class="c${runColor}">${escapeHtml(run)}</span>` : escapeHtml(run);
      run = '';
    };
    for (let col = 0; col < frame.columns; col++) {
      const i = row * frame.columns + col;
      const cp = frame.chars[i];
      if (!cp) {
        run += ' ';
        continue;
      }
      const color = frame.colors[i];
      if (color !== runColor) {
        // a run of only spaces has no visible colour, so it just joins the next run instead of splitting it
        if (run.trim() !== '') flush();
        runColor = color;
      }
      run += String.fromCodePoint(cp);
    }
    flush();
    rows.push(html);
  }
  return rows.join('\n');
}

/** Makes JSON safe to embed inside a <script> element. */
export function scriptJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(new RegExp('\\u2028', 'g'), '\\u2028')
    .replace(new RegExp('\\u2029', 'g'), '\\u2029');
}

export function buildHtmlPlayer(input: HtmlPlayerInput): string {
  const { frames } = input;
  const first = frames[0];
  const columns = first?.columns ?? 1;
  const rows = first?.rows ?? 1;
  const usedColors = new Set<number>();
  for (const f of frames) for (let i = 0; i < f.chars.length; i++) if (f.chars[i]) usedColors.add(f.colors[i]);
  const colorCss = [...usedColors]
    .filter((c) => c > 0 && input.colors[c])
    .sort((a, b) => a - b)
    .map((c) => `.c${c}{color:${input.colors[c]}}`)
    .join('');
  const fontFaces = input.fonts
    .map((f) => `@font-face{font-family:'${f.family}';src:url(data:font/woff2;base64,${f.base64}) format('woff2');}`)
    .join('');
  const frameHtml = frames.map(frameToHtml);
  const lineHeightEm = 2 * input.advanceEm; // grid cells are twice as tall as they are wide
  const artWidthEm = columns * input.advanceEm;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(input.title)}</title>
<style>
${fontFaces}
html,body{margin:0;height:100%;background:${input.background}}
body{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;font-family:${input.fontStack}}
#art{margin:0;font-family:${input.fontStack};line-height:${lineHeightEm};font-size:min(calc(92vw / ${artWidthEm}), calc((100vh - 90px) / ${rows * lineHeightEm}), 24px);white-space:pre;color:#000;-webkit-text-size-adjust:none}
#bar{display:flex;gap:10px;align-items:center;font:14px ui-monospace,monospace;color:#888;user-select:none}
#bar button{font:inherit;padding:6px 14px;border:1px solid #888;background:transparent;color:inherit;border-radius:3px;cursor:pointer}
${colorCss}
</style>
</head>
<body>
<pre id="art">${frameHtml[0] ?? ''}</pre>
<div id="bar"><button id="play" type="button">Pause</button><span id="info"></span></div>
<script>
(function(){
var frames=${scriptJson(frameHtml)};
var ticks=${scriptJson(input.durations)};
var fps=${Math.max(1, input.fps)};
var mode=${scriptJson(input.mode)};
var art=document.getElementById('art'),btn=document.getElementById('play'),info=document.getElementById('info');
var n=frames.length,i=0,dir=1,playing=n>1,timer=0;
info.textContent=n+' frame'+(n===1?'':'s')+' · '+fps+' fps · '+mode;
function show(k){i=k;art.innerHTML=frames[k];}
function next(){
  if(mode==='once'){if(i>=n-1){playing=false;btn.textContent='Replay';return false;}show(i+1);return true;}
  if(mode==='pingpong'){
    if(dir>0){if(i>=n-1){dir=-1;show(Math.max(0,n-2));}else show(i+1);}
    else{if(i<=0){dir=1;show(Math.min(n-1,1));}else show(i-1);}
    return true;
  }
  show((i+1)%n);return true;
}
function tick(){
  if(!playing)return;
  timer=setTimeout(function(){if(next())tick();},Math.max(1,ticks[i])/fps*1000);
}
btn.onclick=function(){
  if(playing){playing=false;clearTimeout(timer);btn.textContent='Play';return;}
  if(mode==='once'&&i>=n-1){show(0);}
  playing=true;btn.textContent='Pause';tick();
};
if(n<2){btn.style.display='none';}else{tick();}
})();
</script>
</body>
</html>
`;
}
