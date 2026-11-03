import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { leerImagen } from './imagen';

describe('leerImagen', () => {
  it('lee el PNG del logo de ejemplo', () => {
    expect(leerImagen(new Uint8Array(readFileSync('ejemplos/lobos/logo.png')))).toEqual({ tipo: 'png', ancho: 520, alto: 306 });
  });
  it('lee un JPEG (marcador SOF0)', () => {
    const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x40, 0x00, 0x80, 0x03, 0, 0, 0, 0]);
    expect(leerImagen(jpg)).toEqual({ tipo: 'jpg', ancho: 128, alto: 64 });
  });
  it('lee un WebP VP8X', () => {
    const b = new Uint8Array(30);
    b.set([...'RIFF'].map((c) => c.charCodeAt(0)), 0);
    b.set([...'WEBPVP8X'].map((c) => c.charCodeAt(0)), 8);
    b.set([199, 0, 0, 99, 0, 0], 24); // 200 × 100
    expect(leerImagen(b)).toEqual({ tipo: 'webp', ancho: 200, alto: 100 });
  });
  it('rechaza SVG, PDF y basura', () => {
    expect(leerImagen(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'))).toBeNull();
    expect(leerImagen(new Uint8Array(readFileSync('tests/fixtures/Pliego_LP7-2026.pdf')))).toBeNull();
    expect(leerImagen(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBeNull();
  });
});
