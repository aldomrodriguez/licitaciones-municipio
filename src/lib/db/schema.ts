import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

const ahora = sql`(unixepoch() * 1000)`;

export const usuarios = sqliteTable('usuarios', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  nombre: text('nombre').notNull(),
  email: text('email').notNull().unique(),
  hash: text('hash').notNull(),
  rol: text('rol', { enum: ['admin', 'compras'] }).notNull().default('compras'),
  activo: integer('activo', { mode: 'boolean' }).notNull().default(true),
  /** La contraseña la generó el sistema (alta o reseteo): hay que cambiarla al entrar. */
  debeCambiarClave: integer('debe_cambiar_clave', { mode: 'boolean' }).notNull().default(false),
  creadoEn: integer('creado_en', { mode: 'timestamp_ms' }).notNull().default(ahora),
});

export const sesiones = sqliteTable('sesiones', {
  id: text('id').primaryKey(),
  usuarioId: integer('usuario_id')
    .notNull()
    .references(() => usuarios.id, { onDelete: 'cascade' }),
  expiraEn: integer('expira_en', { mode: 'timestamp_ms' }).notNull(),
});

export const procedimientos = sqliteTable(
  'procedimientos',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    tipo: text('tipo', { enum: ['publica', 'privada', 'concurso'] }).notNull(),
    numero: integer('numero').notNull(),
    anio: integer('anio').notNull(),
    objeto: text('objeto').notNull(),
    areaSolicitante: text('area_solicitante'),
    /** Montos en centavos. */
    presupuestoOficial: integer('presupuesto_oficial'),
    valorPliego: integer('valor_pliego'),
    fechaApertura: integer('fecha_apertura', { mode: 'timestamp_ms' }),
    lugarApertura: text('lugar_apertura'),
    /** Cantidad histórica importada, sin nombres. Lo nuevo se carga en la tabla `invitados`. */
    invitados: integer('invitados'),
    cantidadOfertantes: integer('cantidad_ofertantes'),
    estado: text('estado').notNull().default('borrador'),
    motivoEstado: text('motivo_estado'),
    observacionesPublicas: text('observaciones_publicas'),
    creadoEn: integer('creado_en', { mode: 'timestamp_ms' }).notNull().default(ahora),
    actualizadoEn: integer('actualizado_en', { mode: 'timestamp_ms' }).notNull().default(ahora),
    eliminadoEn: integer('eliminado_en', { mode: 'timestamp_ms' }),
  },
  (t) => [
    uniqueIndex('procedimientos_tipo_numero_anio').on(t.tipo, t.numero, t.anio),
    index('procedimientos_anio').on(t.anio),
  ],
);

export const adjudicaciones = sqliteTable('adjudicaciones', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  procedimientoId: integer('procedimiento_id')
    .notNull()
    .references(() => procedimientos.id, { onDelete: 'cascade' }),
  proveedor: text('proveedor').notNull(),
  cuit: text('cuit'),
  /** Centavos. Null solo en registros históricos importados que no informaban el monto. */
  monto: integer('monto'),
  orden: integer('orden').notNull().default(0),
});

/** Proveedores invitados (la invitación sale en papel; acá solo se registra). No se publican los nombres. */
export const invitados = sqliteTable('invitados', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  procedimientoId: integer('procedimiento_id')
    .notNull()
    .references(() => procedimientos.id, { onDelete: 'cascade' }),
  proveedor: text('proveedor').notNull(),
  cuit: text('cuit'),
  comproPliego: integer('compro_pliego', { mode: 'boolean' }).notNull().default(false),
  orden: integer('orden').notNull().default(0),
});

export const documentos = sqliteTable('documentos', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  procedimientoId: integer('procedimiento_id')
    .notNull()
    .references(() => procedimientos.id, { onDelete: 'cascade' }),
  titulo: text('titulo').notNull(),
  categoria: text('categoria').notNull(),
  archivo: text('archivo').notNull(),
  nombreOriginal: text('nombre_original').notNull(),
  mime: text('mime').notNull(),
  tamano: integer('tamano').notNull(),
  publico: integer('publico', { mode: 'boolean' }).notNull().default(true),
  subidoPor: integer('subido_por').references(() => usuarios.id),
  subidoEn: integer('subido_en', { mode: 'timestamp_ms' }).notNull().default(ahora),
  eliminadoEn: integer('eliminado_en', { mode: 'timestamp_ms' }),
});

export const historial = sqliteTable(
  'historial',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    procedimientoId: integer('procedimiento_id')
      .notNull()
      .references(() => procedimientos.id, { onDelete: 'cascade' }),
    usuarioId: integer('usuario_id').references(() => usuarios.id),
    /** Nombre del usuario al momento del cambio (sobrevive a bajas). */
    usuarioNombre: text('usuario_nombre').notNull(),
    fecha: integer('fecha', { mode: 'timestamp_ms' }).notNull().default(ahora),
    accion: text('accion', {
      enum: [
        'creado',
        'estado',
        'campo',
        'prorroga',
        'documento_agregado',
        'documento_quitado',
        'documento_restaurado',
        'adjudicacion_agregada',
        'adjudicacion_quitada',
        'invitado_agregado',
        'invitado_quitado',
        'invitado_pliego',
        'eliminado',
        'restaurado',
      ],
    }).notNull(),
    campo: text('campo'),
    valorAnterior: text('valor_anterior'),
    valorNuevo: text('valor_nuevo'),
    motivo: text('motivo'),
    /** Si se muestra en la línea de tiempo pública. */
    publico: integer('publico', { mode: 'boolean' }).notNull().default(false),
  },
  (t) => [index('historial_procedimiento').on(t.procedimientoId, t.fecha)],
);

export type Procedimiento = typeof procedimientos.$inferSelect;
export type Adjudicacion = typeof adjudicaciones.$inferSelect;
export type Invitado = typeof invitados.$inferSelect;
export type Documento = typeof documentos.$inferSelect;
export type EntradaHistorial = typeof historial.$inferSelect;
export type Usuario = typeof usuarios.$inferSelect;
export type Tipo = Procedimiento['tipo'];
export type AccionHistorial = EntradaHistorial['accion'];

/** Configuración del sitio (identidad, header, footer y textos). Una sola fila, id = 1. */
export const configuracion = sqliteTable('configuracion', {
  id: integer('id').primaryKey(),
  datos: text('datos').notNull(),
  actualizadoEn: integer('actualizado_en', { mode: 'timestamp_ms' }).notNull().default(ahora),
  actualizadoPor: text('actualizado_por'),
});

/** Registro de cambios de la configuración: quién, cuándo y qué cambió. */
export const cambiosConfiguracion = sqliteTable('cambios_configuracion', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  fecha: integer('fecha', { mode: 'timestamp_ms' }).notNull().default(ahora),
  usuarioNombre: text('usuario_nombre').notNull(),
  seccion: text('seccion').notNull(),
  /** JSON: [{ campo, antes, despues }] */
  cambios: text('cambios').notNull(),
});

export type CambioConfiguracion = typeof cambiosConfiguracion.$inferSelect;

/** Registro de cambios de usuarios: altas, bajas, reactivaciones y contraseñas. */
export const cambiosUsuarios = sqliteTable('cambios_usuarios', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  fecha: integer('fecha', { mode: 'timestamp_ms' }).notNull().default(ahora),
  /** Quién hizo el cambio (nombre copiado, para sobrevivir a bajas). */
  actorNombre: text('actor_nombre').notNull(),
  usuarioId: integer('usuario_id').references(() => usuarios.id),
  /** Nombre y email del usuario afectado al momento del cambio. */
  usuarioNombre: text('usuario_nombre').notNull(),
  usuarioEmail: text('usuario_email').notNull(),
  accion: text('accion', { enum: ['alta', 'baja', 'reactivacion', 'reseteo_clave', 'cambio_clave'] }).notNull(),
  detalle: text('detalle'),
});

export type CambioUsuario = typeof cambiosUsuarios.$inferSelect;
