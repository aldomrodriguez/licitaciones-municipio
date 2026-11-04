/**
 * Estados de los procedimientos y sus transiciones, por modalidad.
 *
 * Es el único lugar donde se definen: si Compras pide cambiar el circuito,
 * se ajusta acá y el panel, el sitio público y las validaciones lo siguen.
 */
import type { Tipo } from './db/schema';
import { CATEGORIAS, type Categoria } from './categorias';
import { diaLobos } from './formato';

export const TIPOS = {
  publica: { nombre: 'Licitación Pública', corto: 'Pública', slug: 'publica' },
  privada: { nombre: 'Licitación Privada', corto: 'Privada', slug: 'privada' },
  concurso: { nombre: 'Concurso de precios', corto: 'Concurso', slug: 'concurso' },
} as const satisfies Record<Tipo, { nombre: string; corto: string; slug: string }>;

export const LISTA_TIPOS = Object.keys(TIPOS) as Tipo[];

export function esTipo(valor: string): valor is Tipo {
  return valor in TIPOS;
}

export type Tono = 'neutro' | 'abierto' | 'proceso' | 'exito' | 'alerta' | 'peligro';

interface DefEstado {
  nombre: string;
  descripcion: string;
  tono: Tono;
  /** Estado de cierre: no admite más cambios salvo corrección de un admin. */
  final: boolean;
  /** Exige motivo al pasar a este estado (se publica). */
  pideMotivo: boolean;
}

export const ESTADOS = {
  borrador: {
    nombre: 'Borrador',
    descripcion: 'En carga. No se muestra en el sitio público.',
    tono: 'neutro',
    final: false,
    pideMotivo: false,
  },
  llamado: {
    nombre: 'Llamado abierto',
    descripcion: 'Publicado. Se reciben ofertas hasta la fecha y hora de apertura.',
    tono: 'abierto',
    final: false,
    pideMotivo: false,
  },
  evaluacion: {
    nombre: 'En evaluación',
    descripcion: 'Se realizó la apertura de sobres y se están evaluando las ofertas.',
    tono: 'proceso',
    final: false,
    pideMotivo: false,
  },
  tramite: {
    nombre: 'En trámite de adjudicación',
    descripcion: 'Ofertas recibidas, en proceso de adjudicación.',
    tono: 'proceso',
    final: false,
    pideMotivo: false,
  },
  adjudicada: {
    nombre: 'Adjudicada',
    descripcion: 'Se adjudicó a uno o más proveedores.',
    tono: 'exito',
    final: true,
    pideMotivo: false,
  },
  desierta: {
    nombre: 'Desierta',
    descripcion: 'No se presentaron ofertas.',
    tono: 'alerta',
    final: true,
    pideMotivo: true,
  },
  fracasada: {
    nombre: 'Fracasada',
    descripcion: 'Ninguna oferta resultó admisible o conveniente.',
    tono: 'alerta',
    final: true,
    pideMotivo: true,
  },
  anulada: {
    nombre: 'Anulada',
    descripcion: 'El procedimiento se dejó sin efecto.',
    tono: 'peligro',
    final: true,
    pideMotivo: true,
  },
} as const satisfies Record<string, DefEstado>;

export type Estado = keyof typeof ESTADOS;

export function esEstado(valor: string): valor is Estado {
  return valor in ESTADOS;
}

/** Transiciones normales que puede hacer cualquier usuario de Compras. */
const FLUJOS: Record<Tipo, Partial<Record<Estado, readonly Estado[]>>> = {
  publica: {
    borrador: ['llamado'],
    llamado: ['evaluacion', 'desierta', 'anulada'],
    evaluacion: ['adjudicada', 'desierta', 'fracasada', 'anulada'],
  },
  // Las privadas se publican solo con su resultado (para que no se presente nadie sin invitación):
  // se cargan en borrador y pasan directo al cierre. Las importadas «En trámite» siguen desde ahí.
  privada: {
    borrador: ['adjudicada', 'desierta', 'fracasada', 'anulada'],
    tramite: ['adjudicada', 'desierta', 'fracasada', 'anulada'],
  },
  concurso: {
    borrador: ['tramite', 'anulada'],
    tramite: ['adjudicada', 'desierta', 'fracasada', 'anulada'],
  },
};

/** Estados por los que pasa cada modalidad, en orden (para filtros y leyendas). */
export const ESTADOS_POR_TIPO: Record<Tipo, readonly Estado[]> = {
  publica: ['borrador', 'llamado', 'evaluacion', 'adjudicada', 'desierta', 'fracasada', 'anulada'],
  privada: ['borrador', 'tramite', 'adjudicada', 'desierta', 'fracasada', 'anulada'],
  concurso: ['borrador', 'tramite', 'adjudicada', 'desierta', 'fracasada', 'anulada'],
};

/** Estado al que vuelve un admin para corregir un cierre por error. */
const REAPERTURA: Record<Tipo, Estado> = {
  publica: 'evaluacion',
  privada: 'tramite',
  concurso: 'tramite',
};

/** Mínimo legal de proveedores invitados por modalidad. */
export const MINIMO_INVITADOS: Record<Tipo, number> = { publica: 5, privada: 5, concurso: 3 };

export type Rol = 'admin' | 'compras';

export interface Transicion {
  destino: Estado;
  /** Corrección de un estado final: solo admin, siempre con motivo. */
  correccion: boolean;
}

export function transicionesPosibles(tipo: Tipo, actual: Estado, rol: Rol): Transicion[] {
  const normales = (FLUJOS[tipo][actual] ?? []).map((destino) => ({ destino, correccion: false }));
  if (ESTADOS[actual].final && rol === 'admin') {
    return [...normales, { destino: REAPERTURA[tipo], correccion: true }];
  }
  return normales;
}

export interface DatosValidacion {
  tipo: Tipo;
  estado: Estado;
  fechaApertura: Date | null;
  cantidadAdjudicaciones: number;
  cantidadInvitados: number;
}

/** Devuelve los motivos por los que no se puede pasar a `destino` (vacío = se puede). */
export function validarTransicion(
  datos: DatosValidacion,
  destino: Estado,
  rol: Rol,
  motivo: string | null | undefined,
  ahora = new Date(),
): string[] {
  const errores: string[] = [];
  const posible = transicionesPosibles(datos.tipo, datos.estado, rol).find((t) => t.destino === destino);

  if (!posible) {
    errores.push(
      `No se puede pasar de «${ESTADOS[datos.estado].nombre}» a «${ESTADOS[destino].nombre}» en una ${TIPOS[datos.tipo].nombre}.`,
    );
    return errores;
  }

  const sinMotivo = !motivo || motivo.trim().length < 5;
  if ((ESTADOS[destino].pideMotivo || posible.correccion) && sinMotivo) {
    errores.push('Indicá el motivo del cambio (al menos 5 caracteres).');
  }
  if (destino === 'llamado' && !datos.fechaApertura) {
    errores.push('Para abrir el llamado hay que cargar la fecha de apertura.');
  } else if (destino === 'llamado' && datos.fechaApertura && diaLobos(datos.fechaApertura) < diaLobos(ahora)) {
    errores.push('La fecha de apertura ya pasó: corregila antes de abrir el llamado.');
  }
  // El mínimo se exige al salir del borrador: los importados y las reaperturas no lo vuelven a pedir.
  // Anular no lo pide: se puede dejar sin efecto antes de invitar a nadie.
  const minimo = MINIMO_INVITADOS[datos.tipo];
  if (datos.estado === 'borrador' && destino !== 'anulada' && datos.cantidadInvitados < minimo) {
    errores.push(
      `Hay que cargar al menos ${minimo} proveedores invitados (mínimo legal para una ${TIPOS[datos.tipo].nombre}).` +
        (datos.cantidadInvitados > 0 ? ` Hay ${datos.cantidadInvitados}.` : ''),
    );
  }
  if (destino === 'adjudicada' && datos.cantidadAdjudicaciones === 0) {
    errores.push('Para adjudicar hay que cargar al menos un adjudicatario con su monto.');
  }
  return errores;
}

export function esVisiblePublico(estado: Estado): boolean {
  return estado !== 'borrador';
}

/** Mensaje de consecuencias para el diálogo de confirmación de un cambio de estado. */
export function consecuencias(
  datos: DatosValidacion,
  destino: Estado,
  correccion: boolean,
  ahora = new Date(),
): string[] {
  const { tipo, estado: actual } = datos;
  const out: string[] = [];
  if (actual === 'borrador' && esVisiblePublico(destino)) {
    out.push('El procedimiento se va a publicar en el sitio y cualquiera podrá verlo.');
  }
  if (destino === 'llamado') {
    out.push('Aparecerá destacado en «Llamados abiertos» hasta la fecha de apertura.');
    out.push('Después ya no se pueden cambiar el número ni el año (forman la dirección pública).');
  }
  if (destino === 'evaluacion' && !correccion && datos.fechaApertura && diaLobos(datos.fechaApertura) > diaLobos(ahora)) {
    out.push('Atención: la fecha de apertura cargada todavía no llegó. Si se adelantó, corregí la fecha.');
  }
  if (ESTADOS[destino].final) {
    out.push('Es un estado de cierre: después solo un administrador podrá corregirlo, y los datos quedan bloqueados salvo las observaciones y la documentación.');
  }
  if (destino === 'adjudicada' && datos.cantidadAdjudicaciones > 0) {
    out.push(`Se publican los ${datos.cantidadAdjudicaciones === 1 ? 'datos del adjudicatario' : `${datos.cantidadAdjudicaciones} adjudicatarios`} con sus montos.`);
  }
  if (ESTADOS[destino].final && destino !== 'adjudicada' && datos.cantidadAdjudicaciones > 0) {
    out.push('Los adjudicatarios cargados no se publican, porque no hubo adjudicación.');
  }
  if (ESTADOS[destino].pideMotivo) {
    out.push('El motivo se publica junto al estado.');
  }
  if (correccion) {
    out.push(`Se reabre como «${ESTADOS[destino].nombre}». Queda registrado en el historial.`);
  }
  if (tipo === 'publica' && destino === 'evaluacion' && !correccion) {
    out.push('A partir de acá se cargan las ofertas recibidas, el acta de apertura y los adjudicatarios.');
  }
  if (tipo !== 'publica' && destino === 'tramite') {
    out.push('A partir de acá se cargan las ofertas recibidas y los adjudicatarios.');
  }
  return out;
}

// ─── Qué se puede cargar en cada etapa ───────────────────────────────────────

export type CampoEtapa =
  | 'numero'
  | 'anio'
  | 'objeto'
  | 'areaSolicitante'
  | 'presupuestoOficial'
  | 'valorPliego'
  | 'fechaApertura'
  | 'lugarApertura'
  | 'cantidadOfertantes'
  | 'observacionesPublicas';

/** Campos que solo tienen sentido en ciertas modalidades. */
const CAMPOS_POR_TIPO: Record<Tipo, readonly CampoEtapa[]> = {
  publica: ['numero', 'anio', 'objeto', 'areaSolicitante', 'presupuestoOficial', 'valorPliego', 'fechaApertura', 'lugarApertura', 'cantidadOfertantes', 'observacionesPublicas'],
  privada: ['numero', 'anio', 'objeto', 'areaSolicitante', 'presupuestoOficial', 'fechaApertura', 'cantidadOfertantes', 'observacionesPublicas'],
  concurso: ['numero', 'anio', 'objeto', 'areaSolicitante', 'presupuestoOficial', 'fechaApertura', 'cantidadOfertantes', 'observacionesPublicas'],
};

/**
 * Etapa del procedimiento, independiente de la modalidad:
 * 0 preparación (borrador) · 1 llamado publicado · 2 ofertas abiertas (evaluación / trámite) · 3 cerrado.
 */
type Etapa = 0 | 1 | 2 | 3;
const ETAPA: Record<Estado, Etapa> = {
  borrador: 0,
  llamado: 1,
  evaluacion: 2,
  tramite: 2,
  adjudicada: 3,
  desierta: 3,
  fracasada: 3,
  anulada: 3,
};

/**
 * Modalidades que se cargan ya terminadas: en borrador se completa todo lo de la etapa 2
 * (ofertas, adjudicatarios, actas y decretos), para publicarlas directo con su resultado.
 */
const CARGA_AL_FINAL: readonly Tipo[] = ['privada'];

/** Etapas cuyas reglas de carga valen en este estado. */
function etapasDeCarga(tipo: Tipo, estado: Estado): readonly Etapa[] {
  const etapa = ETAPA[estado];
  return etapa === 0 && CARGA_AL_FINAL.includes(tipo) ? [0, 2] : [etapa];
}

/** Etapas en que se puede modificar cada campo. */
const CAMPOS_POR_ETAPA: Record<CampoEtapa, readonly Etapa[]> = {
  numero: [0],
  anio: [0],
  objeto: [0, 1, 2],
  areaSolicitante: [0, 1, 2],
  presupuestoOficial: [0, 1, 2],
  valorPliego: [0, 1],
  fechaApertura: [0, 1, 2], // en el llamado, moverla es una prórroga
  lugarApertura: [0, 1],
  cantidadOfertantes: [2],
  observacionesPublicas: [0, 1, 2, 3],
};

/** Desde qué etapa tiene sentido cada tipo de documento (antes no se puede subir; después sí, para completar). */
const DOCUMENTO_DESDE: Record<Categoria, Etapa> = {
  'Pliego de bases y condiciones': 0,
  'Circular / aclaración': 0,
  'Prórroga': 1,
  'Acta de apertura': 2,
  'Dictamen / preadjudicación': 2,
  'Decreto de adjudicación': 2,
  'Orden de compra / contrato': 3,
  'Ampliación': 3,
  'Expediente': 2,
  'Imagen': 0,
  'Otro': 0,
};
/** Documentos que solo existen si hubo adjudicación. */
const SOLO_ADJUDICADA: readonly Categoria[] = ['Orden de compra / contrato', 'Ampliación'];

export interface ReglasEtapa {
  /** Campos editables ahora. */
  campos: ReadonlySet<CampoEtapa>;
  /** Campos de la modalidad (editables o no), para saber qué mostrar. */
  camposModalidad: ReadonlySet<CampoEtapa>;
  adjudicatarios: boolean;
  /** Lista de invitados y si compraron el pliego: hasta el cierre. */
  invitados: boolean;
  categorias: readonly Categoria[];
  /** Qué se hace en esta etapa, para orientar a quien carga. */
  guia: string;
}

const GUIAS: Record<Tipo, Record<Etapa, string>> = {
  publica: {
    0: 'Completá los datos del llamado y la fecha de apertura, cargá los proveedores invitados (mínimo 5) y subí el pliego. Cuando esté listo, abrí el llamado.',
    1: 'El llamado está publicado. Podés subir circulares y prórrogas, o mover la fecha de apertura. Después de la apertura, pasalo a «En evaluación».',
    2: 'Cargá la cantidad de ofertas, el acta de apertura, el dictamen y los adjudicatarios. Después adjudicá o cerrá el procedimiento.',
    3: 'Procedimiento cerrado. Solo se pueden agregar observaciones y documentación (decreto, orden de compra, ampliaciones).',
  },
  privada: {
    0: 'Cargá todo junto: datos, proveedores invitados (mínimo 5), ofertas recibidas, documentación y adjudicatarios. No se publica hasta que elijas el resultado (adjudicada, desierta, fracasada o anulada).',
    1: '',
    2: 'Cargá la cantidad de ofertas, la documentación y los adjudicatarios. Después adjudicá o cerrá el procedimiento.',
    3: 'Procedimiento cerrado. Solo se pueden agregar observaciones y documentación (decreto, orden de compra, ampliaciones).',
  },
  concurso: {
    0: 'Completá los datos y los proveedores invitados (mínimo 3). Cuando tengas los presupuestos, pasalo a «En trámite de adjudicación».',
    1: '',
    2: 'Cargá la cantidad de presupuestos recibidos, la documentación y los adjudicatarios. Después adjudicá o cerrá el concurso.',
    3: 'Concurso cerrado. Solo se pueden agregar observaciones y documentación.',
  },
};

export function reglasEtapa(tipo: Tipo, estado: Estado, rol: Rol): ReglasEtapa {
  const etapas = etapasDeCarga(tipo, estado);
  const ultima = Math.max(...etapas);
  const camposModalidad = new Set(CAMPOS_POR_TIPO[tipo]);
  const campos = new Set(
    CAMPOS_POR_TIPO[tipo].filter((c) => {
      // Un admin puede corregir número y año aunque ya esté publicado (cambia la dirección pública).
      if (rol === 'admin' && (c === 'numero' || c === 'anio')) return true;
      return CAMPOS_POR_ETAPA[c].some((e) => etapas.includes(e));
    }),
  );
  const categorias = CATEGORIAS.filter(
    (c) => DOCUMENTO_DESDE[c] <= ultima && (!SOLO_ADJUDICADA.includes(c) || estado === 'adjudicada'),
  );
  return { campos, camposModalidad, adjudicatarios: etapas.includes(2), invitados: ultima < 3, categorias, guia: GUIAS[tipo][ETAPA[estado]] };
}

/** Por qué un campo no se puede editar ahora (para mostrar al lado del campo). */
export function motivoBloqueo(tipo: Tipo, estado: Estado, campo: CampoEtapa): string {
  const etapa = ETAPA[estado];
  const etapas = CAMPOS_POR_ETAPA[campo];
  if (etapa < Math.min(...etapas)) {
    const primera = Math.min(...etapas);
    const nombre = primera === 2 ? (tipo === 'publica' ? 'En evaluación' : 'En trámite de adjudicación') : 'Llamado abierto';
    return `Se completa desde «${nombre}».`;
  }
  if (etapa === 3) return 'Bloqueado: el procedimiento está cerrado.';
  if (campo === 'numero' || campo === 'anio') return 'Bloqueado: ya está publicado (forma la dirección pública).';
  return `No se modifica en «${ESTADOS[estado].nombre}».`;
}

/** Etapa desde la que se puede subir una categoría (para explicar por qué no aparece). */
export function categoriasNoDisponibles(tipo: Tipo, estado: Estado, rol: Rol): Categoria[] {
  const permitidas = reglasEtapa(tipo, estado, rol).categorias;
  return CATEGORIAS.filter((c) => !permitidas.includes(c));
}
