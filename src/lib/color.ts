/**
 * Colores de marca: a partir de un solo color se calculan los tonos que usa el sitio,
 * y se verifica el contraste (WCAG 2.x) para que el texto siga siendo legible.
 */

export interface Colores {
  /** Color principal: botones con texto blanco, links, franja de la portada. */
  marca: string;
  /** Hover de los botones. */
  oscuro: string;
  /** Fondos suaves (resaltados). */
  claro: string;
  /** Títulos sobre el footer oscuro. */
  sobreOscuro: string;
  /** Texto de la bajada sobre la franja de color de la portada. */
  sobreMarca: string;
}

/** Fondo del footer y de la barra superior (`--color-noche`). */
export const NOCHE = '#141517';
const PAPEL = '#f4f6f9';
export const CONTRASTE_MINIMO = 4.5;

const HEX = /^#[0-9a-f]{6}$/;

export function esHex(valor: string): boolean {
  return HEX.test(valor.toLowerCase());
}

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function aHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b].map((c) => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, '0')).join('')}`;
}

/** Mezcla `hex` con `con` en la proporción `t` (0 = hex, 1 = con). */
function mezclar(hex: string, con: string, t: number): string {
  const a = rgb(hex);
  const b = rgb(con);
  return aHex([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
}

function luminancia(hex: string): number {
  const [r, g, b] = rgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contraste(a: string, b: string): number {
  const [l1, l2] = [luminancia(a), luminancia(b)].sort((x, y) => y - x) as [number, number];
  return (l1 + 0.05) / (l2 + 0.05);
}

/** Aclara hacia el blanco hasta lograr el contraste pedido contra `fondo`. */
function aclararHasta(hex: string, fondo: string, minimo: number, desde: number): string {
  for (let t = desde; t <= 1; t += 0.02) {
    const c = mezclar(hex, '#ffffff', t);
    if (contraste(c, fondo) >= minimo) return c;
  }
  return '#ffffff';
}

/**
 * Por qué un color no sirve como color de marca, o null si sirve.
 * Tiene que leerse texto blanco encima (botones, franja) y el color sobre fondo claro (links).
 */
export function problemaDeContraste(marca: string): string | null {
  if (!esHex(marca)) return 'Elegí un color válido (formato #RRGGBB).';
  const conBlanco = contraste(marca, '#ffffff');
  const conPapel = contraste(marca, PAPEL);
  if (Math.min(conBlanco, conPapel) < CONTRASTE_MINIMO) {
    return `Es muy claro: el texto blanco encima tiene un contraste de ${conBlanco.toFixed(1)}:1 y se necesita al menos ${CONTRASTE_MINIMO}:1 para que se lea bien. Probá con un tono más oscuro.`;
  }
  return null;
}

/** Tonos derivados de un color de marca (que ya pasó `problemaDeContraste`). */
export function derivarColores(marca: string): Colores {
  const base = marca.toLowerCase();
  return {
    marca: base,
    oscuro: mezclar(base, '#000000', 0.21),
    claro: mezclar(base, '#ffffff', 0.92),
    sobreOscuro: aclararHasta(base, NOCHE, CONTRASTE_MINIMO, 0.3),
    sobreMarca: contraste(mezclar(base, '#ffffff', 0.9), base) >= CONTRASTE_MINIMO ? mezclar(base, '#ffffff', 0.9) : '#ffffff',
  };
}

/** Variables CSS que pisan los tokens de Tailwind (`--color-marca`, etc.). */
export function variablesCss(c: Colores): string {
  const v = (x: string) => (esHex(x) ? x : '#000000');
  return `:root{--color-marca:${v(c.marca)};--color-marca-oscuro:${v(c.oscuro)};--color-marca-claro:${v(c.claro)};--color-marca-sobre-oscuro:${v(c.sobreOscuro)};--color-marca-sobre-marca:${v(c.sobreMarca)}}`;
}
