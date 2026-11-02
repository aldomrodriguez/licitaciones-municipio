import { describe, expect, it } from 'vitest';
import { errorCuit, formatearCuit } from './cuit';

describe('CUIT', () => {
  it('pone los guiones a medida que se escribe', () => {
    expect(formatearCuit('3')).toBe('3');
    expect(formatearCuit('30')).toBe('30');
    expect(formatearCuit('301')).toBe('30-1');
    expect(formatearCuit('3012345678')).toBe('30-12345678');
    expect(formatearCuit('30123456781')).toBe('30-12345678-1');
    expect(formatearCuit('30-12345678-1999')).toBe('30-12345678-1');
    expect(formatearCuit('30 1234.5678/1')).toBe('30-12345678-1');
  });

  it('valida el dígito verificador', () => {
    expect(errorCuit('30-12345678-1')).toBeNull();
    expect(errorCuit('20-12345678-6')).toBeNull();
    expect(errorCuit('30-12345678-9')).toMatch(/verificador/);
    expect(errorCuit('30-1234')).toMatch(/11 dígitos/);
  });
});
