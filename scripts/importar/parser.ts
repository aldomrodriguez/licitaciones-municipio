/**
 * Parser de `informacion.html` (la página manual que se usó hasta 2026).
 * Es puro: no toca la base ni la red, para poder testearlo.
 */
import type { Tipo } from '../../src/lib/db/schema';
import type { Estado } from '../../src/lib/estados';
import type { Categoria } from '../../src/lib/categorias';
import { parsearMonto } from '../../src/lib/formato';

export interface DocumentoImportado {
  url: string;
  titulo: string;
  categoria: Categoria;
}

export interface Importado {
  clave: string;
  tipo: Tipo;
  numero: number;
  anio: number;
  objeto: string;
  presupuestoOficial: number | null;
  valorPliego: number | null;
  fechaApertura: Date | null;
  invitados: number | null;
  cantidadOfertantes: number | null;
  observacionesPublicas: string | null;
  estado: Estado;
  motivoEstado: string | null;
  adjudicaciones: { proveedor: string; monto: number | null }[];
  documentos: DocumentoImportado[];
  advertencias: string[];
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function limpiar(s: string): string {
  return s
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/** La apertura es un día, sin hora: mediodía de Lobos (igual que desdeFechaInput). */
function fechaLobos(anio: number, mes: number, dia: number): Date {
  const p = (n: number) => String(n).padStart(2, '0');
  return new Date(`${anio}-${p(mes)}-${p(dia)}T12:00:00-03:00`);
}

/** "14 de octubre de 2026.-" o "20/10/2023". La hora publicada se descarta. */
export function parsearFecha(texto: string): Date | null {
  const larga = texto.toLowerCase().match(/(\d{1,2})\s+de\s+([a-zé]+)\s+(?:de\s+)?(\d{4})/);
  if (larga) {
    const mes = MESES.indexOf(larga[2]!.replace('setiembre', 'septiembre')) + 1;
    if (mes > 0) return fechaLobos(Number(larga[3]), mes, Number(larga[1]));
  }
  const corta = texto.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (corta) return fechaLobos(Number(corta[3]), Number(corta[2]), Number(corta[1]));
  return null;
}

/** Primer monto que aparece en el texto ("$210.308.326,32.- (equivalentes a ...)"). */
function primerMonto(texto: string): number | null {
  const m = texto.match(/\$\s*([\d.]+(?:,\d{1,2})?)/);
  if (!m) return null;
  const v = parsearMonto(m[1]!);
  return v == null || Number.isNaN(v) ? null : v;
}

function entero(texto: string | undefined): number | null {
  if (!texto) return null;
  const m = texto.match(/^\d+$/);
  return m ? Number(texto) : null;
}

function tipoDe(nombre: string): Tipo | null {
  const n = nombre.toLowerCase();
  if (n.includes('pública') || n.includes('publica')) return 'publica';
  if (n.includes('privada')) return 'privada';
  if (n.includes('concurso')) return 'concurso';
  return null;
}

function categoriaDe(url: string, texto: string, tipo: Tipo): Categoria {
  const t = `${url} ${texto}`.toLowerCase();
  if (t.includes('ampliacion') || t.includes('ampliación')) return 'Ampliación';
  if (t.includes('pliego') || (tipo === 'publica' && t.includes('documentación'))) return 'Pliego de bases y condiciones';
  return 'Expediente';
}

const ESTADOS_TEXTO: Record<string, Estado> = {
  'adjudicada.': 'adjudicada',
  'anulada.': 'anulada',
  'desestimada.': 'fracasada',
  'en trámite de adjudicación': 'tramite',
};

export function parsearInformacion(html: string, ahora = new Date()): Importado[] {
  const bloques = [...html.matchAll(/<div class="licitacion[^"]*">([\s\S]*?)<\/div>\s*<\/div>/g)].map((m) => m[1]!);
  return bloques.map((b) => parsearBloque(b, ahora)).filter((x): x is Importado => x !== null);
}

function parsearBloque(bloque: string, ahora: Date): Importado | null {
  const advertencias: string[] = [];
  const nombre = limpiar(bloque.match(/class="lic-nombre">([\s\S]*?)<\/span>/)?.[1] ?? '');
  const num = nombre.match(/n[°º]\s*:?\s*(\d+)\s*\/\s*(\d{4})/i);
  const tipo = tipoDe(nombre);
  if (!num || !tipo) return null;
  const numero = Number(num[1]);
  const anio = Number(num[2]);

  let objeto = limpiar(bloque.match(/class="lic-objeto">([\s\S]*?)<\/p>/)?.[1] ?? '');
  if (/^S[A-ZÁÉÍÓÚ]/.test(objeto)) {
    advertencias.push(`El objeto empezaba con «${objeto.slice(0, 12)}…»: se quitó la «S» inicial (parece un error de tipeo).`);
    objeto = objeto.slice(1);
  }

  const datos = new Map<string, string>();
  for (const m of bloque.matchAll(/lic-label">([^<]+)<\/span>([\s\S]*?)<\/span>/g)) {
    datos.set(limpiar(m[1]!).replace(/:$/, '').toLowerCase(), limpiar(m[2]!));
  }

  const presupuestoOficial = primerMonto(datos.get('presupuesto oficial total') ?? datos.get('presupuesto oficial') ?? '');
  const valorPliego = primerMonto(datos.get('valor del pliego') ?? '');
  const textoFecha = datos.get('fecha de apertura') ?? datos.get('fecha');
  const fechaApertura = textoFecha ? parsearFecha(textoFecha) : null;
  if (textoFecha && !fechaApertura) advertencias.push(`No se pudo leer la fecha «${textoFecha}».`);

  const textoInvitados = datos.get('invitados');
  const invitados = entero(textoInvitados);
  const ofertantes = entero(datos.get('cantidad de ofertantes'));

  // Adjudicatarios: "Nombre ($monto.-) Otro ($monto.-)" o un único nombre con el monto total aparte.
  const textoAdj = datos.get('adjudicatario') ?? '';
  const textoMonto = datos.get('monto total con ampliación') ?? datos.get('monto adjudicado') ?? '';
  const montoTotal = primerMonto(datos.get('monto adjudicado') ?? '');
  const adjudicaciones: Importado['adjudicaciones'] = [];
  const anulado = /anulad[oa]/i.test(`${textoAdj} ${textoMonto} ${textoInvitados ?? ''}`);
  const multiples = [...textoAdj.matchAll(/([^()]+?)\s*\(\s*\$\s*([\d.,]+?)\.?-?\s*\)/g)];
  if (multiples.length > 0) {
    for (const m of multiples) {
      const monto = parsearMonto(m[2]!);
      if (monto && !Number.isNaN(monto)) adjudicaciones.push({ proveedor: m[1]!.trim(), monto });
    }
    const suma = adjudicaciones.reduce((a, x) => a + (x.monto ?? 0), 0);
    if (montoTotal != null && suma !== montoTotal) {
      advertencias.push(`La suma de los adjudicatarios (${suma / 100}) no coincide con el monto publicado (${montoTotal / 100}).`);
    }
  } else if (textoAdj && !anulado && textoAdj !== '-') {
    adjudicaciones.push({ proveedor: textoAdj, monto: montoTotal });
    if (montoTotal == null) advertencias.push('Adjudicatario sin monto adjudicado: se cargó con monto «no informado».');
  }

  let observaciones: string | null = null;
  for (const [k, v] of datos) {
    if (k.startsWith('ampliación')) {
      observaciones = `${k.charAt(0).toUpperCase()}${k.slice(1)}: ${v}`;
      const total = primerMonto(datos.get('monto total con ampliación') ?? '');
      if (total) observaciones += ` Monto total con ampliación: ${datos.get('monto total con ampliación')}`;
    }
  }

  // Estado: el explícito manda; si no hay, se infiere de lo publicado.
  const textoEstado = (datos.get('estado') ?? '').toLowerCase();
  let estado: Estado;
  let motivoEstado: string | null = null;
  if (ESTADOS_TEXTO[textoEstado]) {
    estado = ESTADOS_TEXTO[textoEstado]!;
    if (textoEstado === 'desestimada.') motivoEstado = 'Desestimada.';
  } else if (anulado) {
    estado = 'anulada';
  } else if (adjudicaciones.length > 0) {
    estado = 'adjudicada';
  } else if (tipo === 'publica' && fechaApertura && fechaApertura > ahora) {
    estado = 'llamado';
  } else {
    estado = tipo === 'publica' ? 'evaluacion' : 'tramite';
    if (textoEstado && textoEstado !== 'en proceso.') advertencias.push(`Estado desconocido «${datos.get('estado')}».`);
  }
  if (estado === 'adjudicada' && adjudicaciones.length === 0) {
    advertencias.push('Figuraba como adjudicada pero sin adjudicatario ni monto: quedó en evaluación/trámite.');
    estado = tipo === 'publica' ? 'evaluacion' : 'tramite';
  }
  if (['anulada', 'fracasada', 'desierta'].includes(estado) && !motivoEstado) {
    motivoEstado = 'Informado en la publicación anterior, sin detalle del motivo.';
  }
  if (tipo === 'publica' && estado === 'evaluacion' && fechaApertura && fechaApertura < ahora && anio < ahora.getFullYear()) {
    advertencias.push('Pública de un año anterior sin resultado publicado: confirmar el estado con Compras.');
  }

  const documentos: DocumentoImportado[] = [...bloque.matchAll(/<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => {
    const url = m[1]!.replace(/^http:/, 'https:');
    const texto = limpiar(m[2]!);
    const categoria = categoriaDe(url, texto, tipo);
    return { url, categoria, titulo: texto === 'Ver documentación' ? categoria : texto };
  });
  if (documentos.length === 0) advertencias.push('Sin documentación publicada.');

  return {
    clave: `${tipo}-${numero}-${anio}`,
    tipo,
    numero,
    anio,
    objeto,
    presupuestoOficial,
    valorPliego,
    fechaApertura,
    invitados,
    cantidadOfertantes: ofertantes,
    observacionesPublicas: observaciones,
    estado,
    motivoEstado,
    adjudicaciones,
    documentos,
    advertencias,
  };
}

/** Detecta duplicados de clave y registros sospechosamente iguales (mismo adjudicatario y monto). */
export function revisarConjunto(items: Importado[]): string[] {
  const avisos: string[] = [];
  const claves = new Map<string, number>();
  for (const it of items) claves.set(it.clave, (claves.get(it.clave) ?? 0) + 1);
  for (const [k, n] of claves) if (n > 1) avisos.push(`${k} aparece ${n} veces: se importa solo la primera.`);

  const firmas = new Map<string, string[]>();
  for (const it of items) {
    if (it.adjudicaciones.length === 0) continue;
    const f = `${it.anio}|${it.adjudicaciones.map((a) => `${a.proveedor}:${a.monto}`).join(',')}`;
    firmas.set(f, [...(firmas.get(f) ?? []), it.clave]);
  }
  for (const [, ks] of firmas) if (ks.length > 1) avisos.push(`Mismo adjudicatario y monto en ${ks.join(' y ')}: posible copia mal editada.`);
  return avisos;
}
