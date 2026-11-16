import { describe, expect, it } from 'vitest';
import { aFechaInput, desdeFechaInput, diaLocal, excesoPresupuesto, formatearMonto, montoAInput, parsearMonto } from './formato';

describe('parsearMonto', () => {
  it.each([
    ['$ 1.234.567,89', 123456789],
    ['1234567,89', 123456789],
    ['1234567.89', 123456789],
    ['1.234.567', 123456700],
    ['$112.500.000.-', 11250000000],
    ['$ 28.886.600,00.-', 2888660000],
    ['56.391.423,27', 5639142327],
    ['210000', 21000000],
    ['0,5', 50],
  ])('%s → %i centavos', (entrada, esperado) => {
    expect(parsearMonto(entrada)).toBe(esperado);
  });

  it('vacío es null y basura es NaN', () => {
    expect(parsearMonto('')).toBeNull();
    expect(parsearMonto('  ')).toBeNull();
    expect(parsearMonto('abc')).toBeNaN();
    expect(parsearMonto('12,345')).toBeNaN();
  });
});

describe('formatos', () => {
  it('formatea montos en pesos', () => {
    expect(formatearMonto(11250000000).replace(/\s/g, ' ')).toBe('$ 112.500.000,00');
    expect(formatearMonto(null)).toBe('—');
  });

  it('ida y vuelta del input de monto', () => {
    expect(parsearMonto(montoAInput(5639142327))).toBe(5639142327);
  });

  it('la fecha de apertura es un día: se guarda al mediodía en hora argentina', () => {
    const d = desdeFechaInput('2026-10-14');
    expect(d?.toISOString()).toBe('2026-10-14T15:00:00.000Z');
    expect(aFechaInput(d)).toBe('2026-10-14');
    expect(desdeFechaInput('14/10/2026')).toBeNull();
    expect(desdeFechaInput('2026-02-31')).toBeNull();
  });

  it('el día local no se corre por la zona horaria', () => {
    expect(diaLocal(new Date('2026-10-15T02:30:00Z'))).toBe('2026-10-14');
    expect(diaLocal(new Date('2026-10-15T03:00:00Z'))).toBe('2026-10-15');
  });
});

describe('excesoPresupuesto', () => {
  it('avisa cuánto se pasa del presupuesto oficial', () => {
    expect(excesoPresupuesto(1_500_000_000, 450_000_000)).toMatch(/supera el presupuesto oficial .* en 233 %/);
    expect(excesoPresupuesto(450_100_000, 450_000_000)).toContain('menos del 1 %');
  });
  it('no avisa si no lo supera o no hay presupuesto', () => {
    expect(excesoPresupuesto(450_000_000, 450_000_000)).toBeNull();
    expect(excesoPresupuesto(100, null)).toBeNull();
    expect(excesoPresupuesto(100, 0)).toBeNull();
  });
});
