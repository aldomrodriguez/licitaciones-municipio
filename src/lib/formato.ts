/** Formatos y parseos en español de Argentina. Montos siempre en centavos (enteros). */

const ZONA = 'America/Argentina/Buenos_Aires';
/** Argentina no usa horario de verano desde 2009: offset fijo. */
const OFFSET = '-03:00';

const moneda = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatearMonto(centavos: number | null | undefined): string {
  if (centavos == null) return '—';
  return moneda.format(centavos / 100);
}

/** Valor para un <input> de monto: "1234567,89". */
export function montoAInput(centavos: number | null | undefined): string {
  if (centavos == null) return '';
  const entero = Math.trunc(centavos / 100);
  const dec = Math.abs(centavos % 100).toString().padStart(2, '0');
  return `${entero.toLocaleString('es-AR')},${dec}`;
}

/**
 * Convierte lo que escribe el usuario a centavos.
 * Acepta "$ 1.234.567,89", "1234567,89", "1234567.89", "1.234.567", "112500000.-".
 * Devuelve null si está vacío y NaN si no se puede interpretar.
 */
export function parsearMonto(texto: string | null | undefined): number | null {
  if (texto == null) return null;
  let s = texto.replace(/\$|\s|\.-$|-$/g, '').trim();
  if (s === '') return null;
  const ultimaComa = s.lastIndexOf(',');
  const ultimoPunto = s.lastIndexOf('.');
  if (ultimaComa > -1) {
    // Formato argentino: puntos de miles, coma decimal.
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (ultimoPunto > -1) {
    // Solo puntos: si hay uno con 1 o 2 decimales es decimal, si no son miles.
    const decimales = s.length - ultimoPunto - 1;
    const puntos = s.split('.').length - 1;
    if (!(puntos === 1 && decimales > 0 && decimales <= 2)) s = s.replace(/\./g, '');
  }
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return Number.NaN;
  const [ent, dec = ''] = s.split('.');
  return Number(ent) * 100 + Number(dec.padEnd(2, '0'));
}

export function sumarMontos(montos: readonly number[]): number {
  return montos.reduce((a, b) => a + b, 0);
}

/**
 * Aviso si el total adjudicado supera el presupuesto oficial (pedido de Compras: avisar, no bloquear).
 * Null si no lo supera o si no hay presupuesto cargado.
 */
export function excesoPresupuesto(total: number, presupuesto: number | null | undefined): string | null {
  if (!presupuesto || presupuesto <= 0 || total <= presupuesto) return null;
  const porcentaje = ((total - presupuesto) / presupuesto) * 100;
  const cuanto = porcentaje < 1 ? 'menos del 1 %' : `${Math.round(porcentaje).toLocaleString('es-AR')} %`;
  return `El total adjudicado (${formatearMonto(total)}) supera el presupuesto oficial (${formatearMonto(presupuesto)}) en ${cuanto}. Revisá que el monto esté bien.`;
}

const fechaLarga = new Intl.DateTimeFormat('es-AR', { timeZone: ZONA, day: 'numeric', month: 'long', year: 'numeric' });
const fechaCorta = new Intl.DateTimeFormat('es-AR', { timeZone: ZONA, day: '2-digit', month: '2-digit', year: 'numeric' });
const hora = new Intl.DateTimeFormat('es-AR', { timeZone: ZONA, hour: '2-digit', minute: '2-digit', hour12: false });

export function formatearFecha(d: Date | null | undefined, estilo: 'larga' | 'corta' = 'larga'): string {
  if (!d) return '—';
  return (estilo === 'larga' ? fechaLarga : fechaCorta).format(d);
}

export function formatearFechaHora(d: Date | null | undefined): string {
  if (!d) return '—';
  return `${fechaCorta.format(d)} ${hora.format(d)}`;
}

/**
 * La fecha de apertura es un día, sin hora. Se guarda como el mediodía de ese día en hora argentina (UTC-3):
 * así ningún cambio de zona horaria la mueve al día anterior o siguiente.
 */
export function desdeFechaInput(valor: string | null | undefined): Date | null {
  if (!valor || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return null;
  const d = new Date(`${valor}T12:00:00${OFFSET}`);
  if (Number.isNaN(d.getTime()) || diaLocal(d) !== valor) return null; // descarta 2026-02-31
  return d;
}

/** Date → "2026-10-14" (día en hora argentina), para el selector de fecha. */
export function aFechaInput(d: Date | null | undefined): string {
  return d ? diaLocal(d) : '';
}

/** Día calendario en hora argentina (UTC-3), "AAAA-MM-DD" (comparable como texto). */
export function diaLocal(d: Date): string {
  return new Date(d.getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** Inicio del día de hoy en hora argentina (para «apertura hoy o después»). */
export function inicioDelDia(d = new Date()): Date {
  return new Date(`${diaLocal(d)}T00:00:00${OFFSET}`);
}

export function formatearTamano(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}

const DIA_MS = 24 * 60 * 60 * 1000;

/** Días calendario (hora argentina) entre hoy y la fecha. */
export function diasHasta(fecha: Date, ahora = new Date()): number {
  const dia = (d: Date) => Math.floor((d.getTime() - 3 * 60 * 60 * 1000) / DIA_MS);
  return dia(fecha) - dia(ahora);
}

export function textoCuentaRegresiva(fecha: Date, ahora = new Date()): string {
  const dias = diasHasta(fecha, ahora);
  if (dias <= 0) return 'La apertura es hoy';
  if (dias === 1) return 'La apertura es mañana';
  return `Faltan ${dias} días para la apertura`;
}

/** Partes de una fecha para el bloque de calendario. */
export function partesFecha(d: Date) {
  const f = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('es-AR', { timeZone: ZONA, ...o }).format(d);
  return { dia: f({ day: 'numeric' }), mes: f({ month: 'long' }), anio: f({ year: 'numeric' }), diaSemana: f({ weekday: 'long' }) };
}
