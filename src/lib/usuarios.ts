/**
 * Gestión de usuarios del panel. Toda mutación queda en `cambios_usuarios` con quién la hizo.
 * Los permisos (solo admin) los chequean las acciones; acá van las reglas que no dependen del rol.
 */
import { randomBytes } from 'node:crypto';
import { desc, eq } from 'drizzle-orm';
import type { Db } from './db';
import { cambiosUsuarios, usuarios, type CambioUsuario, type Usuario } from './db/schema';
import { cerrarOtrasSesiones, cerrarSesionesDe, hashear, validarClave, verificarClave } from './auth';

export class ErrorUsuario extends Error {}

interface Quien {
  id: number;
  nombre: string;
}

type Accion = CambioUsuario['accion'];
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

function registrar(db: Db | Tx, actor: Quien, u: Pick<Usuario, 'id' | 'nombre' | 'email'>, accion: Accion, detalle: string | null = null) {
  db.insert(cambiosUsuarios).values({ actorNombre: actor.nombre, usuarioId: u.id, usuarioNombre: u.nombre, usuarioEmail: u.email, accion, detalle }).run();
}

function buscar(db: Db, id: number): Usuario {
  const u = db.select().from(usuarios).where(eq(usuarios.id, id)).get();
  if (!u) throw new ErrorUsuario('El usuario no existe.');
  return u;
}

/** Contraseña al azar para altas y reseteos. La persona la tiene que cambiar al entrar. */
export function claveAlAzar(): string {
  return randomBytes(9).toString('base64url');
}

export async function crearUsuario(db: Db, actor: Quien, datos: { nombre: string; email: string; rol: Usuario['rol'] }): Promise<string> {
  const email = datos.email.trim().toLowerCase();
  if (db.select({ id: usuarios.id }).from(usuarios).where(eq(usuarios.email, email)).get()) {
    throw new ErrorUsuario(`Ya existe un usuario con ${email}.`);
  }
  const clave = claveAlAzar();
  const hash = await hashear(clave);
  db.transaction((tx) => {
    const u = tx.insert(usuarios).values({ nombre: datos.nombre, email, rol: datos.rol, hash, debeCambiarClave: true }).returning().get();
    registrar(tx, actor, u, 'alta', datos.rol === 'admin' ? 'Administrador' : 'Compras');
  });
  return clave;
}

export function cambiarActivo(db: Db, actor: Quien, usuarioId: number, activo: boolean) {
  if (usuarioId === actor.id) throw new ErrorUsuario('No podés darte de baja a vos mismo.');
  const u = buscar(db, usuarioId);
  if (u.activo === activo) return;
  db.transaction((tx) => {
    tx.update(usuarios).set({ activo }).where(eq(usuarios.id, usuarioId)).run();
    registrar(tx, actor, u, activo ? 'reactivacion' : 'baja');
  });
  if (!activo) cerrarSesionesDe(db, usuarioId);
}

export async function resetearClave(db: Db, actor: Quien, usuarioId: number): Promise<string> {
  const u = buscar(db, usuarioId);
  const clave = claveAlAzar();
  const hash = await hashear(clave);
  db.transaction((tx) => {
    tx.update(usuarios).set({ hash, debeCambiarClave: true }).where(eq(usuarios.id, usuarioId)).run();
    registrar(tx, actor, u, 'reseteo_clave');
  });
  cerrarSesionesDe(db, usuarioId);
  return clave;
}

/**
 * La persona cambia su propia contraseña. Pide la actual (una sesión robada no alcanza para
 * quedarse con la cuenta) y cierra las demás sesiones abiertas.
 */
export async function cambiarClavePropia(
  db: Db,
  usuarioId: number,
  datos: { actual: string; nueva: string; repetir: string },
  tokenActual: string | undefined,
) {
  const u = buscar(db, usuarioId);
  if (!(await verificarClave(db, usuarioId, datos.actual))) throw new ErrorUsuario('La contraseña actual no es correcta.');
  const error = validarClave(datos.nueva) ?? (datos.nueva !== datos.repetir ? 'Las contraseñas nuevas no coinciden.' : null);
  if (error) throw new ErrorUsuario(error);
  if (datos.nueva === datos.actual) throw new ErrorUsuario('La contraseña nueva tiene que ser distinta de la actual.');
  const hash = await hashear(datos.nueva);
  db.transaction((tx) => {
    tx.update(usuarios).set({ hash, debeCambiarClave: false }).where(eq(usuarios.id, usuarioId)).run();
    registrar(tx, u, u, 'cambio_clave');
  });
  cerrarOtrasSesiones(db, usuarioId, tokenActual);
}

export function ultimosCambiosUsuarios(db: Db, limite = 50): CambioUsuario[] {
  return db.select().from(cambiosUsuarios).orderBy(desc(cambiosUsuarios.fecha), desc(cambiosUsuarios.id)).limit(limite).all();
}

export const TEXTO_ACCION_USUARIO: Record<Accion, string> = {
  alta: 'Alta',
  baja: 'Baja',
  reactivacion: 'Reactivación',
  reseteo_clave: 'Contraseña restablecida',
  cambio_clave: 'Cambió su contraseña',
};
