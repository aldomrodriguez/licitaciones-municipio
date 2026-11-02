import type { EntradaHistorial } from './db/schema';

/** Frase legible de una entrada del historial (la misma en el panel y en el sitio público). */
export function describirEntrada(h: EntradaHistorial): string {
  switch (h.accion) {
    case 'creado':
      return 'Se creó el procedimiento.';
    case 'estado':
      return `Cambió de «${h.valorAnterior}» a «${h.valorNuevo}».`;
    case 'prorroga':
      return `Se prorrogó la apertura del ${h.valorAnterior} al ${h.valorNuevo}.`;
    case 'campo':
      return `${h.campo}: «${h.valorAnterior}» → «${h.valorNuevo}».`;
    case 'documento_agregado':
      return `Se agregó el documento «${h.valorNuevo}» (${h.campo}).`;
    case 'documento_quitado':
      return `Se quitó el documento «${h.valorAnterior}» (${h.campo}).`;
    case 'documento_restaurado':
      return `Se restauró el documento «${h.valorNuevo}» desde la papelera.`;
    case 'adjudicacion_agregada':
      return `Se agregó el adjudicatario ${h.valorNuevo}.`;
    case 'adjudicacion_quitada':
      return `Se quitó el adjudicatario ${h.valorAnterior}.`;
    case 'eliminado':
      return 'Se envió a la papelera.';
    case 'restaurado':
      return 'Se restauró desde la papelera.';
  }
}

/** Versión pública: sin detalles internos. */
export function describirEntradaPublica(h: EntradaHistorial): string {
  if (h.accion === 'estado') return `Pasó a «${h.valorNuevo}».`;
  if (h.accion === 'documento_agregado') return `Se publicó «${h.valorNuevo}».`;
  return describirEntrada(h);
}
