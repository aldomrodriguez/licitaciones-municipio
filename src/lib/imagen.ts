/**
 * Lectura mínima de imágenes subidas para la marca (logo y favicon): tipo real por la
 * firma de bytes y dimensiones, sin dependencias. SVG no se acepta: puede traer scripts.
 */

export type TipoImagen = 'png' | 'jpg' | 'webp';

export interface InfoImagen {
  tipo: TipoImagen;
  ancho: number;
  alto: number;
}

export const MIME_IMAGEN: Record<TipoImagen, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  webp: 'image/webp',
};

const u16be = (b: Uint8Array, i: number) => (b[i]! << 8) | b[i + 1]!;
const u16le = (b: Uint8Array, i: number) => b[i]! | (b[i + 1]! << 8);
const u24le = (b: Uint8Array, i: number) => b[i]! | (b[i + 1]! << 8) | (b[i + 2]! << 16);
const u32be = (b: Uint8Array, i: number) => ((b[i]! << 24) >>> 0) + ((b[i + 1]! << 16) | (b[i + 2]! << 8) | b[i + 3]!);
const ascii = (b: Uint8Array, i: number, n: number) => String.fromCharCode(...b.subarray(i, i + n));

function png(b: Uint8Array): InfoImagen | null {
  const firma = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (b.length < 24 || !firma.every((x, i) => b[i] === x) || ascii(b, 12, 4) !== 'IHDR') return null;
  return { tipo: 'png', ancho: u32be(b, 16), alto: u32be(b, 20) };
}

function jpg(b: Uint8Array): InfoImagen | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) return null;
    const marcador = b[i + 1]!;
    // SOF0..SOF15 salvo DHT (C4), JPG (C8) y DAC (CC): ahí están las dimensiones.
    if (marcador >= 0xc0 && marcador <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marcador)) {
      return { tipo: 'jpg', alto: u16be(b, i + 5), ancho: u16be(b, i + 7) };
    }
    i += 2 + u16be(b, i + 2);
  }
  return null;
}

function webp(b: Uint8Array): InfoImagen | null {
  if (b.length < 30 || ascii(b, 0, 4) !== 'RIFF' || ascii(b, 8, 4) !== 'WEBP') return null;
  const trozo = ascii(b, 12, 4);
  if (trozo === 'VP8X') return { tipo: 'webp', ancho: u24le(b, 24) + 1, alto: u24le(b, 27) + 1 };
  if (trozo === 'VP8 ') return { tipo: 'webp', ancho: u16le(b, 26) & 0x3fff, alto: u16le(b, 28) & 0x3fff };
  if (trozo === 'VP8L') {
    const bits = b[21]! | (b[22]! << 8) | (b[23]! << 16) | (b[24]! << 24);
    return { tipo: 'webp', ancho: (bits & 0x3fff) + 1, alto: ((bits >> 14) & 0x3fff) + 1 };
  }
  return null;
}

/** Tipo y tamaño de una imagen PNG, JPG o WebP; null si no es ninguna (o está dañada). */
export function leerImagen(bytes: Uint8Array): InfoImagen | null {
  const info = png(bytes) ?? jpg(bytes) ?? webp(bytes);
  if (!info || info.ancho < 1 || info.alto < 1 || info.ancho > 10000 || info.alto > 10000) return null;
  return info;
}
