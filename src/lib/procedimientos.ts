/**
 * Operaciones sobre procedimientos. Toda mutación corre en una transacción
 * y deja su rastro en `historial`: no hay forma de cambiar algo sin registrarlo.
 */
import { and, asc, desc, eq, isNotNull, inArray, isNull, sql } from 'drizzle-orm';
import type { Db } from './db';
import {
  adjudicaciones,
  documentos,
  historial,
  invitados,
  procedimientos,
  type AccionHistorial,
  type Procedimiento,
  type Tipo,
} from './db/schema';
import {
  ESTADOS,
  TIPOS,
  esEstado,
  esVisiblePublico,
  motivoBloqueo,
  reglasEtapa,
  SOLO_ADJUDICADA,
  validarTransicion,
  type CampoEtapa,
  type Estado,
  type Rol,
} from './estados';
import { formatearFecha, formatearMonto, inicioDelDia, sumarMontos } from './formato';
import { errorCuit, formatearCuit } from './cuit';

export interface Actor {
  id: number | null;
  nombre: string;
  rol: Rol;
}

export class ErrorNegocio extends Error {
  constructor(public readonly errores: string[]) {
    super(errores.join(' '));
    this.name = 'ErrorNegocio';
  }
}

export interface DatosProcedimiento {
  tipo: Tipo;
  numero: number;
  anio: number;
  objeto: string;
  areaSolicitante: string | null;
  presupuestoOficial: number | null;
  valorPliego: number | null;
  fechaApertura: Date | null;
  lugarApertura: string | null;
  cantidadOfertantes: number | null;
  observacionesPublicas: string | null;
}

/** Los mismos campos que regula estados.ts por etapa. */
type CampoEditable = CampoEtapa;

/** Etiquetas y formato de cada campo para el historial y el diff de confirmación. */
export const CAMPOS: Record<CampoEditable, { etiqueta: string; formato: (v: DatosProcedimiento[CampoEditable]) => string }> = {
  numero: { etiqueta: 'Número', formato: texto },
  anio: { etiqueta: 'Año', formato: texto },
  objeto: { etiqueta: 'Objeto', formato: texto },
  areaSolicitante: { etiqueta: 'Área solicitante', formato: texto },
  presupuestoOficial: { etiqueta: 'Presupuesto oficial', formato: (v) => formatearMonto(v as number | null) },
  valorPliego: { etiqueta: 'Valor del pliego', formato: (v) => formatearMonto(v as number | null) },
  fechaApertura: { etiqueta: 'Fecha de apertura', formato: (v) => formatearFecha(v as Date | null, 'corta') },
  lugarApertura: { etiqueta: 'Lugar de apertura', formato: texto },
  cantidadOfertantes: { etiqueta: 'Ofertas recibidas', formato: texto },
  observacionesPublicas: { etiqueta: 'Observaciones', formato: texto },
};

function texto(v: unknown): string {
  if (v == null || v === '') return '—';
  return String(v);
}

function iguales(a: DatosProcedimiento[CampoEditable], b: DatosProcedimiento[CampoEditable]): boolean {
  if (a instanceof Date || b instanceof Date) {
    return (a instanceof Date ? a.getTime() : a) === (b instanceof Date ? b.getTime() : b);
  }
  return (a ?? null) === (b ?? null);
}

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

interface NuevaEntrada {
  accion: AccionHistorial;
  campo?: string | null;
  valorAnterior?: string | null;
  valorNuevo?: string | null;
  motivo?: string | null;
  publico?: boolean;
}

function registrar(tx: Tx, actor: Actor, procedimientoId: number, e: NuevaEntrada) {
  tx.insert(historial)
    .values({
      procedimientoId,
      usuarioId: actor.id,
      usuarioNombre: actor.nombre,
      fecha: new Date(),
      accion: e.accion,
      campo: e.campo ?? null,
      valorAnterior: e.valorAnterior ?? null,
      valorNuevo: e.valorNuevo ?? null,
      motivo: e.motivo ?? null,
      publico: e.publico ?? false,
    })
    .run();
}

function tocar(tx: Tx, id: number) {
  tx.update(procedimientos).set({ actualizadoEn: new Date() }).where(eq(procedimientos.id, id)).run();
}

function obtener(tx: Tx | Db, id: number): Procedimiento {
  const p = tx.select().from(procedimientos).where(eq(procedimientos.id, id)).get();
  if (!p) throw new ErrorNegocio(['El procedimiento no existe.']);
  return p;
}

function obtenerActivo(tx: Tx | Db, id: number): Procedimiento {
  const p = obtener(tx, id);
  if (p.eliminadoEn) throw new ErrorNegocio(['El procedimiento está en la papelera. Restauralo para editarlo.']);
  return p;
}

function estadoDe(p: Procedimiento): Estado {
  return esEstado(p.estado) ? p.estado : 'borrador';
}

export function nombreProcedimiento(p: Pick<Procedimiento, 'tipo' | 'numero' | 'anio'>): string {
  return `${TIPOS[p.tipo].nombre} n° ${p.numero}/${p.anio}`;
}

function validarDatos(datos: DatosProcedimiento): string[] {
  const errores: string[] = [];
  if (!Number.isInteger(datos.numero) || datos.numero < 1) errores.push('El número tiene que ser un entero mayor a 0.');
  if (!Number.isInteger(datos.anio) || datos.anio < 2000 || datos.anio > 2100) errores.push('El año no es válido.');
  if (datos.objeto.trim().length < 5) errores.push('Describí el objeto del procedimiento.');
  for (const campo of ['presupuestoOficial', 'valorPliego'] as const) {
    const v = datos[campo];
    if (v != null && (!Number.isInteger(v) || v < 0)) errores.push(`${CAMPOS[campo].etiqueta}: monto inválido.`);
  }
  const ofertas = datos.cantidadOfertantes;
  if (ofertas != null && (!Number.isInteger(ofertas) || ofertas < 0)) errores.push(`${CAMPOS.cantidadOfertantes.etiqueta}: tiene que ser un número entero.`);
  return errores;
}

function verificarDuplicado(tx: Tx, datos: Pick<DatosProcedimiento, 'tipo' | 'numero' | 'anio'>, excluirId?: number) {
  const existente = tx
    .select({ id: procedimientos.id })
    .from(procedimientos)
    .where(
      and(eq(procedimientos.tipo, datos.tipo), eq(procedimientos.numero, datos.numero), eq(procedimientos.anio, datos.anio)),
    )
    .get();
  if (existente && existente.id !== excluirId) {
    throw new ErrorNegocio([`Ya existe la ${nombreProcedimiento(datos)} (puede estar en la papelera).`]);
  }
}

/** Los campos que no son de la modalidad se guardan vacíos, aunque lleguen con valor. */
function limpiarPorModalidad(datos: DatosProcedimiento): DatosProcedimiento {
  const { camposModalidad: m } = reglasEtapa(datos.tipo, 'borrador', 'admin');
  return {
    ...datos,
    valorPliego: m.has('valorPliego') ? datos.valorPliego : null,
    lugarApertura: m.has('lugarApertura') ? datos.lugarApertura : null,
  };
}

export function crearProcedimiento(db: Db, actor: Actor, entrada: DatosProcedimiento): number {
  const datos = limpiarPorModalidad(entrada);
  const errores = validarDatos(datos);
  const { campos } = reglasEtapa(datos.tipo, 'borrador', actor.rol);
  for (const campo of Object.keys(CAMPOS) as CampoEtapa[]) {
    if (!campos.has(campo) && datos[campo] != null) {
      errores.push(`${CAMPOS[campo].etiqueta}: ${motivoBloqueo(datos.tipo, 'borrador', campo)}`);
    }
  }
  if (errores.length) throw new ErrorNegocio(errores);
  return db.transaction((tx) => {
    verificarDuplicado(tx, datos);
    const ahora = new Date();
    const { id } = tx
      .insert(procedimientos)
      .values({ ...datos, objeto: datos.objeto.trim(), estado: 'borrador', creadoEn: ahora, actualizadoEn: ahora })
      .returning({ id: procedimientos.id })
      .get();
    registrar(tx, actor, id, { accion: 'creado', valorNuevo: nombreProcedimiento(datos) });
    return id;
  });
}

export interface Cambio {
  campo: CampoEditable;
  etiqueta: string;
  anterior: string;
  nuevo: string;
}

/** Diferencias entre lo guardado y lo nuevo, ya formateadas (para confirmar y para el historial). */
export function calcularCambios(actual: Procedimiento, datos: DatosProcedimiento): Cambio[] {
  const cambios: Cambio[] = [];
  for (const campo of Object.keys(CAMPOS) as CampoEditable[]) {
    const antes = actual[campo];
    const despues = datos[campo];
    if (!iguales(antes, despues)) {
      const def = CAMPOS[campo];
      cambios.push({ campo, etiqueta: def.etiqueta, anterior: def.formato(antes), nuevo: def.formato(despues) });
    }
  }
  return cambios;
}

export function actualizarProcedimiento(db: Db, actor: Actor, id: number, entrada: DatosProcedimiento): Cambio[] {
  const datos = limpiarPorModalidad(entrada);
  const errores = validarDatos(datos);
  if (errores.length) throw new ErrorNegocio(errores);
  return db.transaction((tx) => {
    const actual = obtenerActivo(tx, id);
    if (datos.tipo !== actual.tipo) {
      throw new ErrorNegocio(['La modalidad no se puede cambiar. Si se cargó mal, eliminalo y crealo de nuevo.']);
    }
    const cambios = calcularCambios(actual, datos);
    if (cambios.length === 0) return cambios;
    const estado = estadoDe(actual);
    const { campos } = reglasEtapa(actual.tipo, estado, actor.rol);
    const bloqueados = cambios.filter((c) => !campos.has(c.campo));
    if (bloqueados.length) {
      throw new ErrorNegocio(bloqueados.map((c) => `${c.etiqueta}: ${motivoBloqueo(actual.tipo, estado, c.campo)}`));
    }
    if (datos.numero !== actual.numero || datos.anio !== actual.anio) verificarDuplicado(tx, datos, id);

    const publicado = esVisiblePublico(estadoDe(actual));
    tx.update(procedimientos)
      .set({ ...datos, objeto: datos.objeto.trim(), actualizadoEn: new Date() })
      .where(eq(procedimientos.id, id))
      .run();
    for (const c of cambios) {
      // Mover la apertura de un llamado ya publicado es una prórroga: se muestra al público.
      const esProrroga = c.campo === 'fechaApertura' && publicado && actual.fechaApertura != null;
      registrar(tx, actor, id, {
        accion: esProrroga ? 'prorroga' : 'campo',
        campo: c.etiqueta,
        valorAnterior: c.anterior,
        valorNuevo: c.nuevo,
        publico: esProrroga,
      });
    }
    return cambios;
  });
}

export function cambiarEstado(db: Db, actor: Actor, id: number, destino: Estado, motivo: string | null) {
  db.transaction((tx) => {
    const p = obtenerActivo(tx, id);
    const actual = estadoDe(p);
    const cantidadAdjudicaciones = tx
      .select({ n: sql<number>`count(*)` })
      .from(adjudicaciones)
      .where(eq(adjudicaciones.procedimientoId, id))
      .get()?.n ?? 0;
    const errores = validarTransicion(
      {
        tipo: p.tipo,
        estado: actual,
        fechaApertura: p.fechaApertura,
        cantidadAdjudicaciones,
        cantidadInvitados: contarInvitados(tx, p),
        cantidadDocumentosAdjudicacion: contarDocumentosAdjudicacion(tx, id),
      },
      destino,
      actor.rol,
      motivo,
    );
    if (errores.length) throw new ErrorNegocio(errores);
    const motivoLimpio = motivo?.trim() || null;
    tx.update(procedimientos)
      // El motivo que se publica junto al estado solo aplica a los cierres que lo piden.
      .set({ estado: destino, motivoEstado: ESTADOS[destino].pideMotivo ? motivoLimpio : null, actualizadoEn: new Date() })
      .where(eq(procedimientos.id, id))
      .run();
    registrar(tx, actor, id, {
      accion: 'estado',
      valorAnterior: ESTADOS[actual].nombre,
      valorNuevo: ESTADOS[destino].nombre,
      motivo: motivoLimpio,
      publico: esVisiblePublico(destino),
    });
  });
}

/** Los adjudicatarios se cargan solo con las ofertas abiertas (evaluación / trámite). */
function exigirAdjudicatarios(p: Procedimiento, actor: Actor) {
  const estado = estadoDe(p);
  if (reglasEtapa(p.tipo, estado, actor.rol).adjudicatarios) return;
  const etapa = p.tipo === 'publica' ? 'En evaluación' : 'En trámite de adjudicación';
  throw new ErrorNegocio([
    ESTADOS[estado].final
      ? 'El procedimiento está cerrado: para cambiar los adjudicatarios, un administrador tiene que reabrirlo.'
      : `Los adjudicatarios se cargan cuando el procedimiento está «${etapa}».`,
  ]);
}

export interface DatosAdjudicacion {
  proveedor: string;
  /** Obligatorio para los adjudicatarios nuevos (los históricos importados pueden no tenerlo). */
  cuit: string;
  monto: number;
}

export function agregarAdjudicacion(db: Db, actor: Actor, procedimientoId: number, datos: DatosAdjudicacion): number {
  const errores: string[] = [];
  if (datos.proveedor.trim().length < 2) errores.push('Indicá el nombre del proveedor.');
  if (!Number.isInteger(datos.monto) || datos.monto <= 0) errores.push('El monto adjudicado tiene que ser mayor a 0.');
  const fallaCuit = datos.cuit.trim() ? errorCuit(datos.cuit) : 'Indicá el CUIT del proveedor.';
  if (fallaCuit) errores.push(fallaCuit);
  if (errores.length) throw new ErrorNegocio(errores);
  return db.transaction((tx) => {
    exigirAdjudicatarios(obtenerActivo(tx, procedimientoId), actor);
    // Pedido de Compras: cada proveedor aparece una sola vez, con el total que se le adjudicó.
    const proveedor = datos.proveedor.trim();
    const cuit = formatearCuit(datos.cuit);
    const cargados = tx.select().from(adjudicaciones).where(eq(adjudicaciones.procedimientoId, procedimientoId)).all();
    const repetido = cargados.find((a) => a.cuit === cuit || a.proveedor.toLocaleLowerCase('es') === proveedor.toLocaleLowerCase('es'));
    if (repetido) {
      throw new ErrorNegocio([
        `${repetido.proveedor} ya es adjudicatario (${formatearMonto(repetido.monto)}). Si ganó varios renglones, cargalo una sola vez con el monto total: quitalo y volvé a agregarlo.`,
      ]);
    }
    const orden =
      tx
        .select({ m: sql<number>`coalesce(max(${adjudicaciones.orden}), -1)` })
        .from(adjudicaciones)
        .where(eq(adjudicaciones.procedimientoId, procedimientoId))
        .get()?.m ?? -1;
    const { id } = tx
      .insert(adjudicaciones)
      .values({ procedimientoId, proveedor, cuit, monto: datos.monto, orden: orden + 1 })
      .returning({ id: adjudicaciones.id })
      .get();
    registrar(tx, actor, procedimientoId, {
      accion: 'adjudicacion_agregada',
      valorNuevo: `${proveedor} (${formatearMonto(datos.monto)})`,
    });
    tocar(tx, procedimientoId);
    return id;
  });
}

export function quitarAdjudicacion(db: Db, actor: Actor, adjudicacionId: number) {
  db.transaction((tx) => {
    const a = tx.select().from(adjudicaciones).where(eq(adjudicaciones.id, adjudicacionId)).get();
    if (!a) throw new ErrorNegocio(['El adjudicatario no existe.']);
    exigirAdjudicatarios(obtenerActivo(tx, a.procedimientoId), actor);
    tx.delete(adjudicaciones).where(eq(adjudicaciones.id, adjudicacionId)).run();
    registrar(tx, actor, a.procedimientoId, {
      accion: 'adjudicacion_quitada',
      valorAnterior: `${a.proveedor} (${formatearMonto(a.monto)})`,
    });
    tocar(tx, a.procedimientoId);
  });
}

/** Órdenes de compra y ampliaciones activas (fuera de la papelera). */
function contarDocumentosAdjudicacion(tx: Tx | Db, procedimientoId: number): number {
  return (
    tx
      .select({ n: sql<number>`count(*)` })
      .from(documentos)
      .where(
        and(
          eq(documentos.procedimientoId, procedimientoId),
          isNull(documentos.eliminadoEn),
          inArray(documentos.categoria, [...SOLO_ADJUDICADA]),
        ),
      )
      .get()?.n ?? 0
  );
}

// ─── Proveedores invitados ───────────────────────────────────────────────────

/** Invitados con nombre; si no hay, la cantidad histórica importada. */
function contarInvitados(tx: Tx | Db, p: Procedimiento): number {
  const n = tx.select({ n: sql<number>`count(*)` }).from(invitados).where(eq(invitados.procedimientoId, p.id)).get()?.n ?? 0;
  return n > 0 ? n : (p.invitados ?? 0);
}

function exigirInvitadosEditables(p: Procedimiento, actor: Actor) {
  if (reglasEtapa(p.tipo, estadoDe(p), actor.rol).invitados) return;
  throw new ErrorNegocio(['El procedimiento está cerrado: para cambiar los invitados, un administrador tiene que reabrirlo.']);
}

export interface DatosInvitado {
  proveedor: string;
  /** Opcional: la invitación sale en papel y no siempre se tiene. */
  cuit: string | null;
}

export function agregarInvitado(db: Db, actor: Actor, procedimientoId: number, datos: DatosInvitado): number {
  const proveedor = datos.proveedor.trim();
  const cuit = datos.cuit?.trim() || null;
  const errores: string[] = [];
  if (proveedor.length < 2) errores.push('Indicá el nombre del proveedor.');
  const fallaCuit = cuit ? errorCuit(cuit) : null;
  if (fallaCuit) errores.push(fallaCuit);
  if (errores.length) throw new ErrorNegocio(errores);
  return db.transaction((tx) => {
    exigirInvitadosEditables(obtenerActivo(tx, procedimientoId), actor);
    const cargados = tx.select().from(invitados).where(eq(invitados.procedimientoId, procedimientoId)).all();
    const cuitFormateado = cuit ? formatearCuit(cuit) : null;
    if (cargados.some((i) => i.proveedor.toLocaleLowerCase('es') === proveedor.toLocaleLowerCase('es') || (cuitFormateado && i.cuit === cuitFormateado))) {
      throw new ErrorNegocio([`${proveedor} ya está en la lista de invitados.`]);
    }
    const orden = Math.max(-1, ...cargados.map((i) => i.orden)) + 1;
    const { id } = tx
      .insert(invitados)
      .values({ procedimientoId, proveedor, cuit: cuitFormateado, orden })
      .returning({ id: invitados.id })
      .get();
    registrar(tx, actor, procedimientoId, { accion: 'invitado_agregado', valorNuevo: proveedor });
    tocar(tx, procedimientoId);
    return id;
  });
}

function obtenerInvitado(tx: Tx, invitadoId: number) {
  const i = tx.select().from(invitados).where(eq(invitados.id, invitadoId)).get();
  if (!i) throw new ErrorNegocio(['El invitado no existe.']);
  return i;
}

export function quitarInvitado(db: Db, actor: Actor, invitadoId: number) {
  db.transaction((tx) => {
    const i = obtenerInvitado(tx, invitadoId);
    exigirInvitadosEditables(obtenerActivo(tx, i.procedimientoId), actor);
    tx.delete(invitados).where(eq(invitados.id, invitadoId)).run();
    registrar(tx, actor, i.procedimientoId, { accion: 'invitado_quitado', valorAnterior: i.proveedor });
    tocar(tx, i.procedimientoId);
  });
}

export function marcarPliegoComprado(db: Db, actor: Actor, invitadoId: number, compro: boolean) {
  db.transaction((tx) => {
    const i = obtenerInvitado(tx, invitadoId);
    exigirInvitadosEditables(obtenerActivo(tx, i.procedimientoId), actor);
    if (i.comproPliego === compro) return;
    tx.update(invitados).set({ comproPliego: compro }).where(eq(invitados.id, invitadoId)).run();
    registrar(tx, actor, i.procedimientoId, {
      accion: 'invitado_pliego',
      campo: i.proveedor,
      valorNuevo: compro ? 'compró el pliego' : 'no compró el pliego',
    });
    tocar(tx, i.procedimientoId);
  });
}

export interface DatosDocumento {
  titulo: string;
  categoria: string;
  archivo: string;
  nombreOriginal: string;
  mime: string;
  tamano: number;
  publico: boolean;
}

export function registrarDocumento(db: Db, actor: Actor, procedimientoId: number, datos: DatosDocumento): number {
  return db.transaction((tx) => {
    const p = obtenerActivo(tx, procedimientoId);
    const estado = estadoDe(p);
    if (!(reglasEtapa(p.tipo, estado, actor.rol).categorias as readonly string[]).includes(datos.categoria)) {
      throw new ErrorNegocio([`«${datos.categoria}» no se puede subir con el procedimiento en «${ESTADOS[estado].nombre}».`]);
    }
    const { id } = tx
      .insert(documentos)
      .values({ ...datos, procedimientoId, subidoPor: actor.id, subidoEn: new Date() })
      .returning({ id: documentos.id })
      .get();
    registrar(tx, actor, procedimientoId, {
      accion: 'documento_agregado',
      campo: datos.categoria,
      valorNuevo: datos.titulo,
      publico: datos.publico && esVisiblePublico(estadoDe(p)),
    });
    tocar(tx, procedimientoId);
    return id;
  });
}

function obtenerDocumento(tx: Tx, id: number) {
  const d = tx.select().from(documentos).where(eq(documentos.id, id)).get();
  if (!d) throw new ErrorNegocio(['El documento no existe.']);
  return d;
}

export function quitarDocumento(db: Db, actor: Actor, documentoId: number) {
  db.transaction((tx) => {
    const d = obtenerDocumento(tx, documentoId);
    if (d.eliminadoEn) return;
    tx.update(documentos).set({ eliminadoEn: new Date() }).where(eq(documentos.id, documentoId)).run();
    registrar(tx, actor, d.procedimientoId, { accion: 'documento_quitado', campo: d.categoria, valorAnterior: d.titulo });
    tocar(tx, d.procedimientoId);
  });
}

export function restaurarDocumento(db: Db, actor: Actor, documentoId: number) {
  db.transaction((tx) => {
    const d = obtenerDocumento(tx, documentoId);
    if (!d.eliminadoEn) return;
    obtenerActivo(tx, d.procedimientoId);
    tx.update(documentos).set({ eliminadoEn: null }).where(eq(documentos.id, documentoId)).run();
    registrar(tx, actor, d.procedimientoId, { accion: 'documento_restaurado', campo: d.categoria, valorNuevo: d.titulo });
    tocar(tx, d.procedimientoId);
  });
}

export function cambiarVisibilidadDocumento(db: Db, actor: Actor, documentoId: number, publico: boolean) {
  db.transaction((tx) => {
    const d = obtenerDocumento(tx, documentoId);
    if (d.publico === publico) return;
    tx.update(documentos).set({ publico }).where(eq(documentos.id, documentoId)).run();
    registrar(tx, actor, d.procedimientoId, {
      accion: 'campo',
      campo: `Visibilidad de «${d.titulo}»`,
      valorAnterior: d.publico ? 'Público' : 'Interno',
      valorNuevo: publico ? 'Público' : 'Interno',
    });
    tocar(tx, d.procedimientoId);
  });
}

/** Solo admin. Devuelve el nombre del archivo para borrarlo del disco después del commit. */
export function eliminarDocumentoDefinitivo(db: Db, actor: Actor, documentoId: number): string {
  if (actor.rol !== 'admin') throw new ErrorNegocio(['Solo un administrador puede eliminar definitivamente.']);
  return db.transaction((tx) => {
    const d = obtenerDocumento(tx, documentoId);
    if (!d.eliminadoEn) throw new ErrorNegocio(['Primero hay que enviar el documento a la papelera.']);
    tx.delete(documentos).where(eq(documentos.id, documentoId)).run();
    registrar(tx, actor, d.procedimientoId, {
      accion: 'documento_quitado',
      campo: d.categoria,
      valorAnterior: d.titulo,
      motivo: 'Eliminado definitivamente desde la papelera',
    });
    return d.archivo;
  });
}

export function eliminarProcedimiento(db: Db, actor: Actor, id: number) {
  db.transaction((tx) => {
    obtenerActivo(tx, id);
    tx.update(procedimientos).set({ eliminadoEn: new Date() }).where(eq(procedimientos.id, id)).run();
    registrar(tx, actor, id, { accion: 'eliminado' });
  });
}

export function restaurarProcedimiento(db: Db, actor: Actor, id: number) {
  db.transaction((tx) => {
    const p = obtener(tx, id);
    if (!p.eliminadoEn) return;
    tx.update(procedimientos).set({ eliminadoEn: null, actualizadoEn: new Date() }).where(eq(procedimientos.id, id)).run();
    registrar(tx, actor, id, { accion: 'restaurado' });
  });
}

/** Solo admin. Borra el procedimiento con todo lo asociado; devuelve los archivos a borrar del disco. */
export function eliminarProcedimientoDefinitivo(db: Db, actor: Actor, id: number): string[] {
  if (actor.rol !== 'admin') throw new ErrorNegocio(['Solo un administrador puede eliminar definitivamente.']);
  return db.transaction((tx) => {
    const p = obtener(tx, id);
    if (!p.eliminadoEn) throw new ErrorNegocio(['Primero hay que enviar el procedimiento a la papelera.']);
    const archivos = tx
      .select({ archivo: documentos.archivo })
      .from(documentos)
      .where(eq(documentos.procedimientoId, id))
      .all()
      .map((d) => d.archivo);
    tx.delete(procedimientos).where(eq(procedimientos.id, id)).run();
    return archivos;
  });
}

// ─── Consultas ───────────────────────────────────────────────────────────────

export function detalle(db: Db, id: number) {
  const p = obtener(db, id);
  const adj = db
    .select()
    .from(adjudicaciones)
    .where(eq(adjudicaciones.procedimientoId, id))
    .orderBy(asc(adjudicaciones.orden))
    .all();
  const docs = db
    .select()
    .from(documentos)
    .where(and(eq(documentos.procedimientoId, id), isNull(documentos.eliminadoEn)))
    .orderBy(asc(documentos.subidoEn))
    .all();
  const inv = db.select().from(invitados).where(eq(invitados.procedimientoId, id)).orderBy(asc(invitados.orden)).all();
  const hist = db
    .select()
    .from(historial)
    .where(eq(historial.procedimientoId, id))
    .orderBy(desc(historial.fecha), desc(historial.id))
    .all();
  return {
    procedimiento: p,
    estado: estadoDe(p),
    adjudicaciones: adj,
    invitados: inv,
    /** Los cargados con nombre o, si no hay, la cantidad histórica importada. */
    cantidadInvitados: inv.length > 0 ? inv.length : (p.invitados ?? 0),
    totalAdjudicado: sumarMontos(adj.flatMap((a) => (a.monto == null ? [] : [a.monto]))),
    documentos: docs,
    historial: hist,
  };
}

export interface FiltrosListado {
  anio?: number | undefined;
  tipo?: Tipo | undefined;
  estado?: Estado | undefined;
  q?: string | undefined;
}

function condicionesFiltro(f: FiltrosListado) {
  const conds = [isNull(procedimientos.eliminadoEn)];
  if (f.anio) conds.push(eq(procedimientos.anio, f.anio));
  if (f.tipo) conds.push(eq(procedimientos.tipo, f.tipo));
  if (f.estado) conds.push(eq(procedimientos.estado, f.estado));
  const q = f.q?.trim();
  if (q) {
    const comoNumero = /^\d+(\/\d{4})?$/.test(q) ? q.split('/') : null;
    if (comoNumero) {
      conds.push(eq(procedimientos.numero, Number(comoNumero[0])));
      if (comoNumero[1]) conds.push(eq(procedimientos.anio, Number(comoNumero[1])));
    } else {
      conds.push(sql`${procedimientos.objeto} like ${`%${q}%`}`);
    }
  }
  return conds;
}

// Subconsultas correlacionadas: la columna externa va calificada con la tabla, si no SQLite
// la resuelve contra la tabla interna y todas las filas dan el mismo resultado.
const totalSql = sql<number>`coalesce((select sum(a.monto) from adjudicaciones a where a.procedimiento_id = "procedimientos"."id"), 0)`;
const adjudicatariosSql = sql<string | null>`(select group_concat(a.proveedor, ', ') from adjudicaciones a where a.procedimiento_id = "procedimientos"."id")`;
const docsSql = sql<number>`(select count(*) from documentos d where d.procedimiento_id = "procedimientos"."id" and d.eliminado_en is null)`;

const ordenTipo = sql`case ${procedimientos.tipo} when 'publica' then 0 when 'privada' then 1 else 2 end`;

export function listarPanel(db: Db, f: FiltrosListado) {
  return db
    .select({
      p: procedimientos,
      total: totalSql,
      adjudicatarios: adjudicatariosSql,
      documentos: docsSql,
    })
    .from(procedimientos)
    .where(and(...condicionesFiltro(f)))
    .orderBy(desc(procedimientos.anio), ordenTipo, desc(procedimientos.numero))
    .all();
}

export function aniosDisponibles(db: Db, soloPublicos = false): number[] {
  const conds = [isNull(procedimientos.eliminadoEn)];
  if (soloPublicos) conds.push(sql`${procedimientos.estado} <> 'borrador'`);
  return db
    .selectDistinct({ anio: procedimientos.anio })
    .from(procedimientos)
    .where(and(...conds))
    .orderBy(desc(procedimientos.anio))
    .all()
    .map((r) => r.anio);
}

export function listarPublico(db: Db, f: FiltrosListado) {
  return db
    .select({ p: procedimientos, total: totalSql, adjudicatarios: adjudicatariosSql })
    .from(procedimientos)
    .where(and(...condicionesFiltro(f), sql`${procedimientos.estado} <> 'borrador'`))
    .orderBy(desc(procedimientos.anio), ordenTipo, desc(procedimientos.numero))
    .all();
}

/** Llamados con apertura hoy o más adelante, el más próximo primero. */
export function llamadosAbiertos(db: Db, ahora = new Date()) {
  return db
    .select()
    .from(procedimientos)
    .where(
      and(
        isNull(procedimientos.eliminadoEn),
        eq(procedimientos.estado, 'llamado'),
        sql`${procedimientos.fechaApertura} >= ${inicioDelDia(ahora).getTime()}`,
      ),
    )
    .orderBy(asc(procedimientos.fechaApertura))
    .all();
}

/** Ficha pública: null si no existe, está en borrador o en la papelera. */
export function detallePublico(db: Db, tipo: Tipo, anio: number, numero: number) {
  const p = db
    .select({ id: procedimientos.id })
    .from(procedimientos)
    .where(and(eq(procedimientos.tipo, tipo), eq(procedimientos.anio, anio), eq(procedimientos.numero, numero)))
    .get();
  if (!p) return null;
  const d = detalle(db, p.id);
  if (d.procedimiento.eliminadoEn || !esVisiblePublico(d.estado)) return null;
  // Los adjudicatarios solo se publican cuando hay adjudicación: antes son preadjudicaciones internas.
  const adjudicada = d.estado === 'adjudicada';
  return {
    ...d,
    adjudicaciones: adjudicada ? d.adjudicaciones : [],
    totalAdjudicado: adjudicada ? d.totalAdjudicado : 0,
    // De los invitados se publica solo la cantidad, como en la página anterior.
    invitados: [],
    documentos: d.documentos.filter((doc) => doc.publico),
    historial: d.historial.filter((h) => h.publico),
  };
}

export function papelera(db: Db) {
  const procs = db
    .select()
    .from(procedimientos)
    .where(isNotNull(procedimientos.eliminadoEn))
    .orderBy(desc(procedimientos.eliminadoEn))
    .all();
  const docs = db
    .select({ d: documentos, p: procedimientos })
    .from(documentos)
    .innerJoin(procedimientos, eq(documentos.procedimientoId, procedimientos.id))
    .where(and(isNotNull(documentos.eliminadoEn), isNull(procedimientos.eliminadoEn)))
    .orderBy(desc(documentos.eliminadoEn))
    .all();
  return { procedimientos: procs, documentos: docs };
}

export function documentoParaDescarga(db: Db, id: number, publico: boolean) {
  const r = db
    .select({ d: documentos, p: procedimientos })
    .from(documentos)
    .innerJoin(procedimientos, eq(documentos.procedimientoId, procedimientos.id))
    .where(eq(documentos.id, id))
    .get();
  if (!r) return null;
  if (publico) {
    const estado = estadoDe(r.p);
    if (!r.d.publico || r.d.eliminadoEn || r.p.eliminadoEn || !esVisiblePublico(estado)) return null;
  }
  return r;
}
