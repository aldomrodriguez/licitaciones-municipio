import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { hashSync } from '@node-rs/argon2';
import { sql } from 'drizzle-orm';
import * as schema from './schema';

export const DATA_DIR = resolve(process.env.DATA_DIR ?? './data');
const CARPETA_MIGRACIONES = resolve(process.env.MIGRATIONS_DIR ?? './drizzle');

export function crearDb(ruta: string) {
  const sqlite = new Database(ruta);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: CARPETA_MIGRACIONES });
  return db;
}

/**
 * Primer arranque en el servidor: si no hay usuarios y están ADMIN_EMAIL y ADMIN_CLAVE,
 * crea ese administrador. Después conviene borrar ADMIN_CLAVE de Coolify.
 */
function crearAdminInicial(conexion: Db) {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const clave = process.env.ADMIN_CLAVE;
  if (!email || !clave) return;
  const hay = conexion.select({ n: sql<number>`count(*)` }).from(schema.usuarios).get()?.n ?? 0;
  if (hay > 0) return;
  conexion
    .insert(schema.usuarios)
    .values({ nombre: process.env.ADMIN_NOMBRE ?? 'Administrador', email, hash: hashSync(clave), rol: 'admin' })
    .run();
  console.log(`Administrador inicial creado: ${email}`);
}

export type Db = ReturnType<typeof crearDb>;

let instancia: Db | undefined;

/** Conexión única de la app (se crea y migra en el primer uso). */
export function db(): Db {
  if (!instancia) {
    mkdirSync(DATA_DIR, { recursive: true });
    instancia = crearDb(join(DATA_DIR, 'licitaciones.db'));
    crearAdminInicial(instancia);
  }
  return instancia;
}
