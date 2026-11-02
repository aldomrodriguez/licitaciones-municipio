/**
 * Crea (o reactiva y le cambia la contraseña a) un administrador.
 *   pnpm crear-admin "Nombre Apellido" email@lobos.gob.ar
 * La contraseña se pide por la variable CLAVE o se genera una al azar y se muestra una sola vez.
 */
import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '../src/lib/db';
import { usuarios } from '../src/lib/db/schema';
import { hashear, validarClave } from '../src/lib/auth';

const [nombre, email] = process.argv.slice(2);
if (!nombre || !email) {
  console.error('Uso: pnpm crear-admin "Nombre Apellido" email@lobos.gob.ar');
  process.exit(1);
}
const clave = process.env.CLAVE ?? randomBytes(9).toString('base64url');
const error = validarClave(clave);
if (error) {
  console.error(error);
  process.exit(1);
}
const conexion = db();
const hash = await hashear(clave);
const mail = email.trim().toLowerCase();
const existe = conexion.select().from(usuarios).where(eq(usuarios.email, mail)).get();
if (existe) {
  conexion.update(usuarios).set({ nombre, hash, rol: 'admin', activo: true }).where(eq(usuarios.id, existe.id)).run();
  console.log(`Actualizado ${mail} como administrador.`);
} else {
  conexion.insert(usuarios).values({ nombre, email: mail, hash, rol: 'admin' }).run();
  console.log(`Creado ${mail} como administrador.`);
}
if (!process.env.CLAVE) console.log(`Contraseña: ${clave}  (anotala, no se vuelve a mostrar)`);
