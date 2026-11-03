/**
 * Acciones del panel. Todas exigen sesión (el middleware ya corta sin sesión, pero se
 * vuelve a chequear acá) y delegan en lib/procedimientos.ts, que registra el historial.
 * La confirmación previa la hace el cliente; acá se valida igual por si alguien la saltea.
 */
import { ActionError, defineAction, type ActionAPIContext } from 'astro:actions';
import { z } from 'astro/zod';
import { eq } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import { db } from '../lib/db';
import { usuarios } from '../lib/db/schema';
import { esEstado, esTipo } from '../lib/estados';
import { desdeFechaInput, parsearMonto } from '../lib/formato';
import { borrarArchivo } from '../lib/archivos';
import { cerrarSesionesDe, hashear, validarClave } from '../lib/auth';
import * as P from '../lib/procedimientos';
import * as C from '../lib/configuracion';
import { derivarColores } from '../lib/color';
import { borrarImagenMarca } from '../lib/marca-archivos';

// Mensajes de validación genéricos en español.
z.config(z.locales.es());

function actor(ctx: ActionAPIContext): P.Actor {
  const u = ctx.locals.usuario;
  if (!u) throw new ActionError({ code: 'UNAUTHORIZED', message: 'Tu sesión venció. Volvé a ingresar.' });
  return { id: u.id, nombre: u.nombre, rol: u.rol };
}

function soloAdmin(ctx: ActionAPIContext): P.Actor {
  const a = actor(ctx);
  if (a.rol !== 'admin') throw new ActionError({ code: 'FORBIDDEN', message: 'Esta acción es solo para administradores.' });
  return a;
}

/** Convierte errores de negocio en errores legibles para el diálogo. */
function ejecutar<T>(fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    if (e instanceof P.ErrorNegocio) throw new ActionError({ code: 'BAD_REQUEST', message: e.errores.join('\n') });
    throw e;
  }
}

/** Listas que el editor del panel manda como JSON en un campo oculto. */
const json = z.string().transform((v, c) => {
  try {
    return JSON.parse(v) as unknown;
  } catch {
    c.addIssue({ code: 'custom', message: 'No se pudo leer la lista. Recargá la página y probá de nuevo.' });
    return z.NEVER;
  }
});

function configurar<T>(fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    if (e instanceof C.ErrorConfiguracion) throw new ActionError({ code: 'BAD_REQUEST', message: e.message });
    throw e;
  }
}

const id = z.coerce.number().int().positive();
const textoOpcional = z
  .string()
  .trim()
  .max(2000)
  .nullish()
  .transform((v) => (v ? v : null));

function monto(etiqueta: string) {
  return z
    .string()
    .nullish()
    .transform((v, ctx) => {
      const n = parsearMonto(v);
      if (Number.isNaN(n)) {
        ctx.addIssue({ code: 'custom', message: `${etiqueta}: no se entiende el monto. Escribilo como 1.234.567,89` });
        return z.NEVER;
      }
      return n;
    });
}

const enteroOpcional = z
  .string()
  .nullish()
  .transform((v, ctx) => {
    if (!v?.trim()) return null;
    const n = Number(v);
    if (!Number.isInteger(n) || n < 0) {
      ctx.addIssue({ code: 'custom', message: 'Invitados y ofertantes tienen que ser números enteros.' });
      return z.NEVER;
    }
    return n;
  });

const datosProcedimiento = z.object({
  tipo: z.string().refine(esTipo, 'Elegí la modalidad.'),
  numero: z.coerce.number({ error: 'Indicá el número.' }).int().positive('El número tiene que ser mayor a 0.'),
  anio: z.coerce.number().int().min(2000).max(2100),
  objeto: z.string().trim().min(5, 'Describí el objeto del procedimiento.').max(2000),
  areaSolicitante: textoOpcional,
  presupuestoOficial: monto('Presupuesto oficial'),
  valorPliego: monto('Valor del pliego'),
  fechaApertura: z
    .string()
    .nullish()
    .transform((v, ctx) => {
      if (!v) return null;
      const d = desdeFechaInput(v);
      if (!d) {
        ctx.addIssue({ code: 'custom', message: 'La fecha de apertura no es válida.' });
        return z.NEVER;
      }
      return d;
    }),
  lugarApertura: textoOpcional,
  invitados: enteroOpcional,
  cantidadOfertantes: enteroOpcional,
  observacionesPublicas: textoOpcional,
});

function aDatos(input: z.infer<typeof datosProcedimiento>): P.DatosProcedimiento {
  return { ...input, tipo: input.tipo as P.DatosProcedimiento['tipo'] };
}

export const server = {
  crearProcedimiento: defineAction({
    accept: 'form',
    input: datosProcedimiento,
    handler: (input, ctx) => ({ id: ejecutar(() => P.crearProcedimiento(db(), actor(ctx), aDatos(input))) }),
  }),

  actualizarProcedimiento: defineAction({
    accept: 'form',
    input: datosProcedimiento.extend({ id }),
    handler: ({ id: pid, ...input }, ctx) => {
      const cambios = ejecutar(() => P.actualizarProcedimiento(db(), actor(ctx), pid, aDatos(input)));
      return { cambios: cambios.length };
    },
  }),

  cambiarEstado: defineAction({
    accept: 'form',
    input: z.object({
      id,
      destino: z.string().refine(esEstado, 'Estado inválido.'),
      motivo: textoOpcional,
    }),
    handler: ({ id: pid, destino, motivo }, ctx) => {
      ejecutar(() => P.cambiarEstado(db(), actor(ctx), pid, destino as Parameters<typeof P.cambiarEstado>[3], motivo));
      return { ok: true };
    },
  }),

  agregarAdjudicacion: defineAction({
    accept: 'form',
    input: z.object({
      id,
      proveedor: z.string().trim().min(2, 'Indicá el proveedor.').max(300),
      cuit: z.string({ error: 'Indicá el CUIT del proveedor.' }).trim().min(1, 'Indicá el CUIT del proveedor.'),
      monto: monto('Monto adjudicado'),
    }),
    handler: ({ id: pid, proveedor, cuit, monto: m }, ctx) => {
      if (m == null) throw new ActionError({ code: 'BAD_REQUEST', message: 'Indicá el monto adjudicado.' });
      return { id: ejecutar(() => P.agregarAdjudicacion(db(), actor(ctx), pid, { proveedor, cuit, monto: m })) };
    },
  }),

  quitarAdjudicacion: defineAction({
    accept: 'form',
    input: z.object({ adjudicacionId: id }),
    handler: ({ adjudicacionId }, ctx) => {
      ejecutar(() => P.quitarAdjudicacion(db(), actor(ctx), adjudicacionId));
      return { ok: true };
    },
  }),

  quitarDocumento: defineAction({
    accept: 'form',
    input: z.object({ documentoId: id }),
    handler: ({ documentoId }, ctx) => {
      ejecutar(() => P.quitarDocumento(db(), actor(ctx), documentoId));
      return { ok: true };
    },
  }),

  restaurarDocumento: defineAction({
    accept: 'form',
    input: z.object({ documentoId: id }),
    handler: ({ documentoId }, ctx) => {
      ejecutar(() => P.restaurarDocumento(db(), actor(ctx), documentoId));
      return { ok: true };
    },
  }),

  cambiarVisibilidadDocumento: defineAction({
    accept: 'form',
    input: z.object({ documentoId: id, publico: z.enum(['si', 'no']) }),
    handler: ({ documentoId, publico }, ctx) => {
      ejecutar(() => P.cambiarVisibilidadDocumento(db(), actor(ctx), documentoId, publico === 'si'));
      return { ok: true };
    },
  }),

  eliminarDocumentoDefinitivo: defineAction({
    accept: 'form',
    input: z.object({ documentoId: id }),
    handler: async ({ documentoId }, ctx) => {
      const archivo = ejecutar(() => P.eliminarDocumentoDefinitivo(db(), soloAdmin(ctx), documentoId));
      await borrarArchivo(archivo);
      return { ok: true };
    },
  }),

  eliminarProcedimiento: defineAction({
    accept: 'form',
    input: z.object({ id }),
    handler: ({ id: pid }, ctx) => {
      ejecutar(() => P.eliminarProcedimiento(db(), actor(ctx), pid));
      return { ok: true };
    },
  }),

  restaurarProcedimiento: defineAction({
    accept: 'form',
    input: z.object({ id }),
    handler: ({ id: pid }, ctx) => {
      ejecutar(() => P.restaurarProcedimiento(db(), actor(ctx), pid));
      return { ok: true };
    },
  }),

  eliminarProcedimientoDefinitivo: defineAction({
    accept: 'form',
    input: z.object({ id, confirmacion: z.string() }),
    handler: async ({ id: pid, confirmacion }, ctx) => {
      const a = soloAdmin(ctx);
      const p = P.detalle(db(), pid).procedimiento;
      if (confirmacion.trim() !== `${p.numero}/${p.anio}`) {
        throw new ActionError({ code: 'BAD_REQUEST', message: `Para confirmar escribí ${p.numero}/${p.anio}.` });
      }
      const archivos = ejecutar(() => P.eliminarProcedimientoDefinitivo(db(), a, pid));
      await Promise.all(archivos.map(borrarArchivo));
      return { ok: true };
    },
  }),

  // ─── Usuarios ──────────────────────────────────────────────────────────────

  crearUsuario: defineAction({
    accept: 'form',
    input: z.object({
      nombre: z.string().trim().min(3, 'Indicá nombre y apellido.').max(120),
      email: z.email('El email no es válido.').transform((v) => v.trim().toLowerCase()),
      rol: z.enum(['admin', 'compras']),
    }),
    handler: async ({ nombre, email, rol }, ctx) => {
      soloAdmin(ctx);
      const existe = db().select({ id: usuarios.id }).from(usuarios).where(eq(usuarios.email, email)).get();
      if (existe) throw new ActionError({ code: 'CONFLICT', message: `Ya existe un usuario con ${email}.` });
      const clave = randomBytes(9).toString('base64url');
      db().insert(usuarios).values({ nombre, email, rol, hash: await hashear(clave) }).run();
      return { clave };
    },
  }),

  cambiarActivoUsuario: defineAction({
    accept: 'form',
    input: z.object({ usuarioId: id, activo: z.enum(['si', 'no']) }),
    handler: ({ usuarioId, activo }, ctx) => {
      const a = soloAdmin(ctx);
      if (usuarioId === a.id) throw new ActionError({ code: 'BAD_REQUEST', message: 'No podés darte de baja a vos mismo.' });
      db().update(usuarios).set({ activo: activo === 'si' }).where(eq(usuarios.id, usuarioId)).run();
      if (activo === 'no') cerrarSesionesDe(db(), usuarioId);
      return { ok: true };
    },
  }),

  resetearClave: defineAction({
    accept: 'form',
    input: z.object({ usuarioId: id }),
    handler: async ({ usuarioId }, ctx) => {
      soloAdmin(ctx);
      const clave = randomBytes(9).toString('base64url');
      db().update(usuarios).set({ hash: await hashear(clave) }).where(eq(usuarios.id, usuarioId)).run();
      cerrarSesionesDe(db(), usuarioId);
      return { clave };
    },
  }),

  cambiarMiClave: defineAction({
    accept: 'form',
    input: z.object({ nueva: z.string(), repetir: z.string() }),
    handler: async ({ nueva, repetir }, ctx) => {
      const a = actor(ctx);
      const error = validarClave(nueva) ?? (nueva !== repetir ? 'Las contraseñas no coinciden.' : null);
      if (error) throw new ActionError({ code: 'BAD_REQUEST', message: error });
      db().update(usuarios).set({ hash: await hashear(nueva) }).where(eq(usuarios.id, a.id!)).run();
      return { ok: true };
    },
  }),

  // ─── Configuración del sitio (solo admin) ──────────────────────────────────

  guardarIdentidad: defineAction({
    accept: 'form',
    input: z.object({ nombre: z.string(), color: z.string().trim().toLowerCase() }),
    handler: ({ nombre, color }, ctx) => {
      const a = soloAdmin(ctx);
      const actual = C.leerConfiguracion(db());
      // Si el color no cambió se conservan los tonos actuales (pueden venir ajustados a mano).
      const colores = color === actual.colores.marca ? actual.colores : derivarColores(color);
      return { cambios: configurar(() => C.guardarSeccion(db(), a.nombre, 'identidad', { nombre, colores })).length };
    },
  }),

  guardarEncabezado: defineAction({
    accept: 'form',
    input: z.object({
      direccion: z.string().nullish(),
      sitioUrl: z.string().nullish(),
      textoVolver: z.string().nullish(),
      migas: json,
      nav: json,
      destacadoTexto: z.string().nullish(),
      destacadoHref: z.string().nullish(),
      lema: z.string().nullish(),
      columnas: json,
    }),
    handler: (i, ctx) => {
      const a = soloAdmin(ctx);
      const texto = i.destacadoTexto?.trim() ?? '';
      const href = i.destacadoHref?.trim() ?? '';
      if (Boolean(texto) !== Boolean(href)) {
        throw new ActionError({ code: 'BAD_REQUEST', message: 'El botón destacado necesita texto y link, o ninguno de los dos.' });
      }
      const parcial = {
        direccion: i.direccion ?? '',
        sitioUrl: i.sitioUrl?.trim() ?? '',
        textoVolver: i.textoVolver?.trim() || C.CONFIG_GENERICA.textoVolver,
        migas: i.migas,
        nav: i.nav,
        destacado: texto ? { texto, href } : null,
        lema: i.lema ?? '',
        columnas: i.columnas,
      } as Partial<C.ConfigSitio>;
      return { cambios: configurar(() => C.guardarSeccion(db(), a.nombre, 'encabezado', parcial)).length };
    },
  }),

  guardarTextos: defineAction({
    accept: 'form',
    input: z.object({
      queEs: z.string(),
      publica: z.string(),
      privada: z.string(),
      concurso: z.string(),
      vigenciaMontos: z.string().nullish(),
    }),
    handler: (i, ctx) => {
      const a = soloAdmin(ctx);
      const parcial = {
        queEs: i.queEs,
        modalidades: { publica: i.publica, privada: i.privada, concurso: i.concurso },
        vigenciaMontos: i.vigenciaMontos ?? '',
      };
      return { cambios: configurar(() => C.guardarSeccion(db(), a.nombre, 'textos', parcial)).length };
    },
  }),

  quitarImagenMarca: defineAction({
    accept: 'form',
    input: z.object({ clase: z.enum(['logo', 'favicon']) }),
    handler: async ({ clase }, ctx) => {
      const a = soloAdmin(ctx);
      const anterior = C.leerConfiguracion(db())[clase];
      configurar(() => C.guardarSeccion(db(), a.nombre, 'identidad', { [clase]: null }));
      await borrarImagenMarca(anterior?.archivo);
      return { ok: true };
    },
  }),
};
