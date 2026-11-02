import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parsearFecha, parsearInformacion, revisarConjunto } from './parser';

const html = readFileSync(new URL('../../informacion.html', import.meta.url), 'utf8');
const ahora = new Date('2026-11-02T12:00:00-03:00');
const items = parsearInformacion(html, ahora);
const buscar = (clave: string) => items.find((i) => i.clave === clave)!;

describe('parser de informacion.html', () => {
  it('lee todos los procedimientos publicados', () => {
    expect(items).toHaveLength(157);
  });

  it('separa adjudicatarios múltiples con su monto', () => {
    const p = buscar('privada-14-2026');
    expect(p.estado).toBe('adjudicada');
    expect(p.cantidadOfertantes).toBe(3);
    expect(p.adjudicaciones).toEqual([
      { proveedor: 'Bull Vial S.R.L.', monto: 3762900800 },
      { proveedor: 'Track-Mar S.A.C.I.', monto: 760680000 },
    ]);
  });

  it('adjudicatario único toma el monto adjudicado', () => {
    expect(buscar('privada-10-2026').adjudicaciones).toEqual([{ proveedor: 'Germano S.R.L.', monto: 5639142327 }]);
  });

  it('una pública con apertura pasada y sin resultado queda en evaluación', () => {
    const p = buscar('publica-7-2026');
    expect(p.estado).toBe('evaluacion');
    expect(p.presupuestoOficial).toBe(34591822675);
    expect(p.valorPliego).toBe(21000000);
    expect(p.fechaApertura?.toISOString()).toBe('2026-10-14T15:00:00.000Z');
    expect(p.documentos[0]?.categoria).toBe('Pliego de bases y condiciones');
  });

  it('respeta el estado explícito «En trámite de adjudicación»', () => {
    expect(buscar('privada-8-2026').estado).toBe('tramite');
  });

  it('detecta anulados y les pone motivo', () => {
    const p = buscar('concurso-4-2025');
    expect(p.estado).toBe('anulada');
    expect(p.motivoEstado).toBeTruthy();
    expect(p.adjudicaciones).toEqual([]);
  });

  it('corrige el typo «SAdquisición» y lo informa', () => {
    const p = buscar('privada-5-2026');
    expect(p.objeto.startsWith('Adquisición')).toBe(true);
    expect(p.advertencias.join()).toMatch(/S» inicial/);
  });

  it('avisa los registros copiados con el mismo adjudicatario y monto', () => {
    expect(revisarConjunto(items).join('\n')).toMatch(/privada-5-2026 y privada-4-2026|privada-4-2026 y privada-5-2026/);
  });

  it('fechas largas y cortas', () => {
    expect(parsearFecha('06 de octubre de 2026.-')?.toISOString()).toBe('2026-10-06T15:00:00.000Z');
    expect(parsearFecha('20/10/2023')?.toISOString()).toBe('2023-10-20T15:00:00.000Z');
  });
});
