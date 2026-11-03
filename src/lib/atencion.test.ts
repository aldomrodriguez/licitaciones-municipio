import { describe, expect, it } from 'vitest';
import { reglasQueAplican } from './atencion';
import { desdeFechaInput } from './formato';

const HOY = '2026-11-03';
const dia = (v: string) => desdeFechaInput(v)!;
const p = (estado: string, apertura: string | null, creado = '2026-11-01') => ({ estado, fechaApertura: apertura ? dia(apertura) : null, creadoEn: dia(creado) });

describe('reglasQueAplican', () => {
  it('un llamado sigue en regla hasta el mismo día de la apertura', () => {
    expect(reglasQueAplican(p('llamado', '2026-11-03'), true, HOY)).toEqual([]);
    expect(reglasQueAplican(p('llamado', '2026-11-02'), true, HOY)).toEqual(['llamado-vencido']);
  });

  it('un llamado sin pliego se marca', () => {
    expect(reglasQueAplican(p('llamado', '2026-12-01'), false, HOY)).toEqual(['llamado-sin-pliego']);
  });

  it('en evaluación con la apertura futura es una inconsistencia', () => {
    expect(reglasQueAplican(p('evaluacion', '2026-11-20'), true, HOY)).toEqual(['apertura-futura']);
    // Una privada en trámite puede tener la apertura por delante.
    expect(reglasQueAplican(p('tramite', '2026-11-20'), true, HOY)).toEqual([]);
  });

  it('marca lo que lleva más de 90 días sin resolverse', () => {
    expect(reglasQueAplican(p('evaluacion', '2026-08-05'), true, HOY)).toEqual([]);
    expect(reglasQueAplican(p('evaluacion', '2026-08-03'), true, HOY)).toEqual(['evaluacion-demorada']);
    expect(reglasQueAplican(p('tramite', '2026-03-11'), true, HOY)).toEqual(['evaluacion-demorada']);
  });

  it('marca los borradores olvidados y nunca lo cerrado', () => {
    expect(reglasQueAplican(p('borrador', null, '2026-09-01'), false, HOY)).toEqual(['borrador-olvidado']);
    expect(reglasQueAplican(p('borrador', null, '2026-10-20'), false, HOY)).toEqual([]);
    expect(reglasQueAplican(p('adjudicada', '2020-01-01'), false, HOY)).toEqual([]);
  });
});
