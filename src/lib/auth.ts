import { hash, verify } from '@node-rs/argon2';
import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt, lt } from 'drizzle-orm';
import type { AstroCookies } from 'astro';
import type { Db } from './db';
import { sesiones, usuarios, type Usuario } from './db/schema';

export const COOKIE_SESION = 'lic_sesion';
const DURACION_MS = 1000 * 60 * 60 * 12; // una jornada laboral larga

let hashFicticio: Promise<string> | undefined;

export type UsuarioSesion = Pick<Usuario, 'id' | 'nombre' | 'email' | 'rol'>;

export function hashear(clave: string): Promise<string> {
  return hash(clave);
}

/** El id de sesión se guarda hasheado: un dump de la base no permite robar sesiones. */
function idDeToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function iniciarSesion(db: Db, email: string, clave: string): Promise<{ token: string; usuario: UsuarioSesion } | null> {
  const u = db.select().from(usuarios).where(eq(usuarios.email, email.trim().toLowerCase())).get();
  // Siempre verificamos un hash para no revelar por tiempo si el email existe.
  hashFicticio ??= hash('clave-ficticia-para-igualar-tiempos');
  const ok = await verify(u?.hash ?? (await hashFicticio), clave).catch(() => false);
  if (!u || !u.activo || !ok) return null;
  const token = randomBytes(32).toString('base64url');
  db.delete(sesiones).where(lt(sesiones.expiraEn, new Date())).run();
  db.insert(sesiones).values({ id: idDeToken(token), usuarioId: u.id, expiraEn: new Date(Date.now() + DURACION_MS) }).run();
  return { token, usuario: { id: u.id, nombre: u.nombre, email: u.email, rol: u.rol } };
}

export function validarSesion(db: Db, token: string | undefined): UsuarioSesion | null {
  if (!token) return null;
  const id = idDeToken(token);
  const fila = db
    .select({ id: usuarios.id, nombre: usuarios.nombre, email: usuarios.email, rol: usuarios.rol, activo: usuarios.activo, expiraEn: sesiones.expiraEn })
    .from(sesiones)
    .innerJoin(usuarios, eq(sesiones.usuarioId, usuarios.id))
    .where(and(eq(sesiones.id, id), gt(sesiones.expiraEn, new Date())))
    .get();
  if (!fila || !fila.activo) return null;
  // Renovación deslizante: si queda menos de la mitad, se extiende.
  if (fila.expiraEn.getTime() - Date.now() < DURACION_MS / 2) {
    db.update(sesiones).set({ expiraEn: new Date(Date.now() + DURACION_MS) }).where(eq(sesiones.id, id)).run();
  }
  return { id: fila.id, nombre: fila.nombre, email: fila.email, rol: fila.rol };
}

export function cerrarSesion(db: Db, token: string | undefined) {
  if (token) db.delete(sesiones).where(eq(sesiones.id, idDeToken(token))).run();
}

export function cerrarSesionesDe(db: Db, usuarioId: number) {
  db.delete(sesiones).where(eq(sesiones.usuarioId, usuarioId)).run();
}

export function guardarCookie(cookies: AstroCookies, token: string) {
  cookies.set(COOKIE_SESION, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: import.meta.env.PROD,
    maxAge: DURACION_MS / 1000,
  });
}

export function borrarCookie(cookies: AstroCookies) {
  cookies.delete(COOKIE_SESION, { path: '/' });
}

export function validarClave(clave: string): string | null {
  if (clave.length < 10) return 'La contraseña tiene que tener al menos 10 caracteres.';
  return null;
}
