import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { leerImportacion, revisarConjunto } from './formato';

const registro = (extra: object) => JSON.stringify({ procedimientos: [{ tipo: 'publica', numero: 1, anio: 2025, objeto: 'Algo', estado: 'adjudicada', ...extra }] });

describe('leerImportacion', () => {
  it('el ejemplo del repo es válido completo', () => {
    const { items, errores } = leerImportacion(readFileSync('ejemplos/importacion.json', 'utf8'));
    expect(errores).toEqual([]);
    expect(items.map((i) => i.clave)).toEqual(['publica-3-2025', 'privada-8-2025', 'concurso-2-2024']);
  });

  it('completa los opcionales y guarda la apertura al mediodía en hora argentina', () => {
    const [p] = leerImportacion(registro({ fechaApertura: '2025-06-12' })).items;
    expect(p?.fechaApertura?.toISOString()).toBe('2025-06-12T15:00:00.000Z');
    expect(p?.adjudicaciones).toEqual([]);
    expect(p?.presupuestoOficial).toBeNull();
  });

  it('rechaza el registro con el motivo, sin frenar al resto', () => {
    const json = JSON.stringify({
      procedimientos: [
        { tipo: 'publica', numero: 1, anio: 2025, objeto: 'Bien', estado: 'llamado' },
        { tipo: 'privada', numero: 2, anio: 2025, objeto: 'Mal', estado: 'llamado' },
      ],
    });
    const { items, errores } = leerImportacion(json);
    expect(items).toHaveLength(1);
    expect(errores[0]).toMatch(/Registro 2: estado: .*no pasa por «Llamado/);
  });

  it('exige montos en centavos enteros, fechas AAAA-MM-DD y URLs http(s)', () => {
    expect(leerImportacion(registro({ presupuestoOficial: 10.5 })).errores[0]).toMatch(/centavos/);
    expect(leerImportacion(registro({ fechaApertura: '12/06/2025' })).errores[0]).toMatch(/AAAA-MM-DD/);
    expect(leerImportacion(registro({ documentos: [{ url: 'javascript:alert(1)', titulo: 'x', categoria: 'Otro' }] })).errores).toHaveLength(1);
  });

  it('avisa si falta la lista de procedimientos', () => {
    expect(leerImportacion('[]').errores[0]).toMatch(/procedimientos/);
  });
});

describe('revisarConjunto', () => {
  it('avisa duplicados y copias con el mismo adjudicatario y monto', () => {
    const adj = { adjudicaciones: [{ proveedor: 'Proveedor S.A.', monto: 100 }] };
    const json = JSON.stringify({
      procedimientos: [
        { tipo: 'privada', numero: 4, anio: 2026, objeto: 'A', estado: 'adjudicada', ...adj },
        { tipo: 'privada', numero: 5, anio: 2026, objeto: 'B', estado: 'adjudicada', ...adj },
        { tipo: 'privada', numero: 5, anio: 2026, objeto: 'C', estado: 'tramite' },
      ],
    });
    const avisos = revisarConjunto(leerImportacion(json).items).join('\n');
    expect(avisos).toMatch(/privada-5-2026 aparece 2 veces/);
    expect(avisos).toMatch(/privada-4-2026 y privada-5-2026/);
  });
});
