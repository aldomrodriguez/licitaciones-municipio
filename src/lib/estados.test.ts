import { describe, expect, it } from 'vitest';
import { categoriasNoDisponibles, reglasEtapa, transicionesPosibles, validarTransicion, type DatosValidacion } from './estados';

const futuro = new Date('2099-01-01T13:00:00Z');
const base: DatosValidacion = { tipo: 'publica', estado: 'borrador', fechaApertura: futuro, cantidadAdjudicaciones: 0 };

describe('transiciones', () => {
  it('una pública no puede saltar de borrador a adjudicada', () => {
    expect(validarTransicion(base, 'adjudicada', 'admin', null)).toHaveLength(1);
  });

  it('una privada pasa por «En trámite» antes de adjudicarse', () => {
    const d = { ...base, tipo: 'privada' as const, cantidadAdjudicaciones: 1 };
    expect(validarTransicion(d, 'adjudicada', 'compras', null)).toHaveLength(1);
    expect(validarTransicion(d, 'tramite', 'compras', null)).toEqual([]);
    expect(validarTransicion({ ...d, estado: 'tramite' }, 'adjudicada', 'compras', null)).toEqual([]);
  });

  it('no se abre un llamado con la fecha de apertura vencida', () => {
    const d = { ...base, fechaApertura: new Date('2020-01-01T13:00:00Z') };
    expect(validarTransicion(d, 'llamado', 'compras', null)).toEqual(['La fecha de apertura ya pasó: corregila antes de abrir el llamado.']);
  });

  it('abrir el llamado exige fecha de apertura', () => {
    expect(validarTransicion({ ...base, fechaApertura: null }, 'llamado', 'compras', null)).toEqual([
      'Para abrir el llamado hay que cargar la fecha de apertura.',
    ]);
  });

  it('adjudicar exige al menos un adjudicatario', () => {
    const d = { ...base, estado: 'evaluacion' as const };
    expect(validarTransicion(d, 'adjudicada', 'compras', null)).toHaveLength(1);
    expect(validarTransicion({ ...d, cantidadAdjudicaciones: 2 }, 'adjudicada', 'compras', null)).toEqual([]);
  });

  it('anular, declarar desierta o fracasada exige motivo', () => {
    const d = { ...base, estado: 'evaluacion' as const };
    expect(validarTransicion(d, 'anulada', 'compras', '')).toHaveLength(1);
    expect(validarTransicion(d, 'fracasada', 'compras', 'ok')).toHaveLength(1);
    expect(validarTransicion(d, 'desierta', 'compras', 'No se presentaron ofertas')).toEqual([]);
  });

  it('los estados finales solo los reabre un admin, con motivo', () => {
    expect(transicionesPosibles('publica', 'adjudicada', 'compras')).toEqual([]);
    expect(transicionesPosibles('publica', 'adjudicada', 'admin')).toEqual([{ destino: 'evaluacion', correccion: true }]);
    const d = { ...base, estado: 'adjudicada' as const };
    expect(validarTransicion(d, 'evaluacion', 'admin', null)).toHaveLength(1);
    expect(validarTransicion(d, 'evaluacion', 'admin', 'Error de carga del adjudicatario')).toEqual([]);
  });

  it('el concurso no tiene llamado abierto', () => {
    const destinos = transicionesPosibles('concurso', 'borrador', 'admin').map((t) => t.destino);
    expect(destinos).not.toContain('llamado');
  });
});

describe('qué se puede cargar en cada etapa', () => {
  it('los adjudicatarios solo con las ofertas abiertas', () => {
    expect(reglasEtapa('publica', 'borrador', 'admin').adjudicatarios).toBe(false);
    expect(reglasEtapa('publica', 'llamado', 'admin').adjudicatarios).toBe(false);
    expect(reglasEtapa('publica', 'evaluacion', 'compras').adjudicatarios).toBe(true);
    expect(reglasEtapa('privada', 'tramite', 'compras').adjudicatarios).toBe(true);
    expect(reglasEtapa('publica', 'adjudicada', 'admin').adjudicatarios).toBe(false);
  });

  it('las ofertas recibidas se cargan después de la apertura', () => {
    expect(reglasEtapa('publica', 'llamado', 'compras').campos.has('cantidadOfertantes')).toBe(false);
    expect(reglasEtapa('publica', 'evaluacion', 'compras').campos.has('cantidadOfertantes')).toBe(true);
  });

  it('número y año se bloquean al publicar, salvo para un admin', () => {
    expect(reglasEtapa('publica', 'borrador', 'compras').campos.has('numero')).toBe(true);
    expect(reglasEtapa('publica', 'llamado', 'compras').campos.has('numero')).toBe(false);
    expect(reglasEtapa('publica', 'llamado', 'admin').campos.has('numero')).toBe(true);
  });

  it('cerrado solo deja observaciones', () => {
    const campos = [...reglasEtapa('privada', 'adjudicada', 'compras').campos];
    expect(campos).toEqual(['observacionesPublicas']);
  });

  it('los campos respetan la modalidad', () => {
    expect(reglasEtapa('privada', 'borrador', 'compras').camposModalidad.has('valorPliego')).toBe(false);
    expect(reglasEtapa('publica', 'borrador', 'compras').camposModalidad.has('invitados')).toBe(false);
  });

  it('los documentos siguen el orden del procedimiento', () => {
    expect(categoriasNoDisponibles('publica', 'borrador', 'compras')).toContain('Decreto de adjudicación');
    expect(categoriasNoDisponibles('publica', 'borrador', 'compras')).toContain('Acta de apertura');
    expect(reglasEtapa('publica', 'llamado', 'compras').categorias).toContain('Prórroga');
    expect(reglasEtapa('publica', 'evaluacion', 'compras').categorias).toContain('Acta de apertura');
    expect(reglasEtapa('publica', 'adjudicada', 'compras').categorias).toContain('Orden de compra / contrato');
    expect(reglasEtapa('publica', 'desierta', 'compras').categorias).not.toContain('Orden de compra / contrato');
    // Lo de etapas anteriores se puede seguir subiendo (publicación a destiempo).
    expect(reglasEtapa('publica', 'adjudicada', 'compras').categorias).toContain('Pliego de bases y condiciones');
  });
});
