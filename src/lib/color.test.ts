import { describe, expect, it } from 'vitest';
import { NOCHE, contraste, derivarColores, problemaDeContraste, variablesCss } from './color';

describe('contraste', () => {
  it('blanco contra negro es 21:1', () => {
    expect(contraste('#ffffff', '#000000')).toBeCloseTo(21, 1);
  });
  it('el rojo de Lobos con blanco pasa AA', () => {
    expect(contraste('#d52027', '#ffffff')).toBeGreaterThan(4.5);
  });
});

describe('problemaDeContraste', () => {
  it('acepta colores oscuros', () => {
    expect(problemaDeContraste('#d52027')).toBeNull();
    expect(problemaDeContraste('#2b5d8a')).toBeNull();
  });
  it('rechaza colores claros con el contraste en el mensaje', () => {
    expect(problemaDeContraste('#ffcc00')).toMatch(/1\.\d:1/);
    expect(problemaDeContraste('#e5484d')).toMatch(/muy claro/);
  });
  it('rechaza formatos inválidos', () => {
    expect(problemaDeContraste('rojo')).toMatch(/#RRGGBB/);
    expect(problemaDeContraste('#fff')).toMatch(/#RRGGBB/);
  });
});

describe('derivarColores', () => {
  it.each(['#d52027', '#2b5d8a', '#0f6b5c', '#6b3fa0', '#3d4752', '#9a4a00'])('los tonos de %s se leen sobre sus fondos', (hex) => {
    const c = derivarColores(hex);
    expect(contraste(c.sobreOscuro, NOCHE)).toBeGreaterThanOrEqual(4.5);
    expect(contraste(c.sobreMarca, c.marca)).toBeGreaterThanOrEqual(4.5);
    expect(contraste('#ffffff', c.oscuro)).toBeGreaterThan(contraste('#ffffff', c.marca));
  });
});

describe('variablesCss', () => {
  it('no deja pasar nada que no sea un color', () => {
    const css = variablesCss({ ...derivarColores('#2b5d8a'), marca: 'red;}</style><script>' });
    expect(css).not.toContain('<');
    expect(css).toContain('--color-marca:#000000');
  });
});
