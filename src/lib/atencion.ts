/**
 * «Requieren atención»: procedimientos que probablemente están trabados o incompletos.
 * Las reglas son orientativas (no bloquean nada) y se calculan sobre el día de Lobos.
 */
import { and, eq, isNull } from 'drizzle-orm';
import type { Db } from './db';
import { documentos, type Procedimiento } from './db/schema';
import { diaLobos } from './formato';

export const DIAS_DEMORA_EVALUACION = 90;
export const DIAS_BORRADOR_OLVIDADO = 30;

export const REGLAS_ATENCION = {
  'llamado-vencido': {
    titulo: 'Llamados con la apertura vencida',
    ayuda: 'La fecha de apertura ya pasó y siguen como «Llamado abierto». Pasalos a «En evaluación» o registrá la prórroga.',
  },
  'llamado-sin-pliego': {
    titulo: 'Llamados abiertos sin pliego',
    ayuda: 'Se ven en el sitio pero no tienen el pliego de bases y condiciones para descargar.',
  },
  'apertura-futura': {
    titulo: 'En evaluación con la apertura todavía por venir',
    ayuda: 'Las ofertas no se pueden estar evaluando antes de la apertura: revisá la fecha o el estado.',
  },
  'evaluacion-demorada': {
    titulo: `Sin resolver a más de ${DIAS_DEMORA_EVALUACION} días de la apertura`,
    ayuda: 'Siguen en evaluación o en trámite. Si ya se resolvieron, cargá la adjudicación o el cierre.',
  },
  'borrador-olvidado': {
    titulo: `Borradores de hace más de ${DIAS_BORRADOR_OLVIDADO} días`,
    ayuda: 'No se ven en el sitio. Publicalos o mandalos a la papelera.',
  },
} as const;

export type ReglaAtencion = keyof typeof REGLAS_ATENCION;
export const LISTA_REGLAS = Object.keys(REGLAS_ATENCION) as ReglaAtencion[];

export function esReglaAtencion(v: string): v is ReglaAtencion {
  return v in REGLAS_ATENCION;
}

const DIA_MS = 24 * 60 * 60 * 1000;
const sumarDias = (d: Date, dias: number) => new Date(d.getTime() + dias * DIA_MS);

/** Reglas que cumple un procedimiento. `hoy` es el día de Lobos (AAAA-MM-DD). */
export function reglasQueAplican(
  p: Pick<Procedimiento, 'estado' | 'fechaApertura' | 'creadoEn'>,
  tienePliego: boolean,
  hoy: string,
): ReglaAtencion[] {
  const reglas: ReglaAtencion[] = [];
  const apertura = p.fechaApertura ? diaLobos(p.fechaApertura) : null;
  if (p.estado === 'llamado') {
    if (apertura && apertura < hoy) reglas.push('llamado-vencido');
    if (!tienePliego) reglas.push('llamado-sin-pliego');
  }
  if (p.estado === 'evaluacion' && apertura && apertura > hoy) reglas.push('apertura-futura');
  if ((p.estado === 'evaluacion' || p.estado === 'tramite') && p.fechaApertura && diaLobos(sumarDias(p.fechaApertura, DIAS_DEMORA_EVALUACION)) < hoy) {
    reglas.push('evaluacion-demorada');
  }
  if (p.estado === 'borrador' && diaLobos(sumarDias(p.creadoEn, DIAS_BORRADOR_OLVIDADO)) < hoy) reglas.push('borrador-olvidado');
  return reglas;
}

/** Ids de los procedimientos que tienen un pliego vigente (fuera de la papelera). */
export function idsConPliego(db: Db): Set<number> {
  const filas = db
    .selectDistinct({ id: documentos.procedimientoId })
    .from(documentos)
    .where(and(eq(documentos.categoria, 'Pliego de bases y condiciones'), isNull(documentos.eliminadoEn)))
    .all();
  return new Set(filas.map((f) => f.id));
}
