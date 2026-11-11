import { describe, expect, it } from 'vitest';
import { buildPdf, compressRgb, contactSheetLayout, pdfString, PAGE_SIZES } from './pdfWriter';
import { unzlibSync } from 'fflate';

const latin1 = (b: Uint8Array) => new TextDecoder('latin1').decode(b);

describe('buildPdf', () => {
  const image = compressRgb(new Uint8ClampedArray(16).fill(200), 2, 2);
  const pdf = buildPdf(
    [
      {
        width: 200,
        height: 100,
        items: [
          { kind: 'image', image, x: 10, y: 10, w: 100, h: 50 },
          { kind: 'text', text: 'a (b) c', x: 10, y: 20, size: 8, font: 'Courier', visible: false, hScale: 90 },
          { kind: 'text', text: '1', x: 50, y: 90, size: 9, font: 'Helvetica', visible: true, gray: 0.4 },
        ],
      },
      { width: 200, height: 100, items: [{ kind: 'image', image, x: 0, y: 0, w: 10, h: 10 }] },
    ],
    { title: 'Test' },
  );
  const text = latin1(pdf);

  it('has the PDF header and trailer', () => {
    expect(text.startsWith('%PDF-1.4')).toBe(true);
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
  });

  it('startxref and every xref entry point at real objects', () => {
    const start = Number(/startxref\n(\d+)/.exec(text)![1]);
    expect(text.slice(start, start + 4)).toBe('xref');
    const entries = [...text.slice(start).matchAll(/(\d{10}) 00000 n /g)].map((m) => Number(m[1]));
    expect(entries.length).toBeGreaterThan(5);
    entries.forEach((offset, i) => expect(text.slice(offset, offset + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`));
  });

  it('shares one image object between pages and counts pages', () => {
    expect(text).toContain('/Count 2');
    expect(text.match(/\/Subtype \/Image/g)).toHaveLength(1);
  });

  it('writes invisible text with render mode 3 and escapes parentheses', () => {
    expect(text).toContain('3 Tr');
    expect(text).toContain('(a \\(b\\) c) Tj');
  });
});

describe('compressRgb', () => {
  it('keeps RGB and drops alpha', () => {
    const img = compressRgb(new Uint8ClampedArray([1, 2, 3, 255, 4, 5, 6, 0]), 2, 1);
    expect(Array.from(unzlibSync(img.flate))).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

describe('pdfString', () => {
  it('replaces non-printable-ASCII with spaces', () => expect(pdfString('aé\n')).toBe('(a  )'));
});

describe('contactSheetLayout', () => {
  it('puts every frame on a page inside the margins', () => {
    const l = contactSheetLayout(20, PAGE_SIZES.a4, 4 / 3);
    const all = l.pages.flat();
    expect(all).toHaveLength(20);
    for (const c of all) {
      expect(c.x).toBeGreaterThanOrEqual(36 - 0.001);
      expect(c.x + c.w).toBeLessThanOrEqual(PAGE_SIZES.a4.width - 36 + 0.001);
      expect(c.y + c.h).toBeLessThanOrEqual(PAGE_SIZES.a4.height - 36 + 0.001);
    }
  });
  it('uses several pages when the frames do not fit on one', () => {
    expect(contactSheetLayout(200, PAGE_SIZES.letter, 1).pages.length).toBeGreaterThan(1);
  });
  it('one frame gets a whole page cell', () => {
    const l = contactSheetLayout(1, PAGE_SIZES.a4, 1);
    expect(l.pages).toHaveLength(1);
    expect(l.pages[0][0].w).toBeGreaterThan(300);
  });
});
