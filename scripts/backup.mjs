/**
 * Backup de la base SQLite: copia consistente (VACUUM INTO) con fecha, conserva las últimas 30.
 * En Coolify: Scheduled Task diaria con el comando `node scripts/backup.mjs`.
 * Los documentos (/data/documentos) se respaldan con el backup de volumen de Coolify.
 */
import Database from 'better-sqlite3';
import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

const DATA_DIR = resolve(process.env.DATA_DIR ?? './data');
const CARPETA = join(DATA_DIR, 'backups');
const CONSERVAR = Number(process.env.BACKUPS_CONSERVAR ?? 30);

mkdirSync(CARPETA, { recursive: true });
const sello = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
const destino = join(CARPETA, `licitaciones-${sello}.db`);

const db = new Database(join(DATA_DIR, 'licitaciones.db'), { readonly: true });
db.prepare('VACUUM INTO ?').run(destino);
db.close();
console.log(`Backup creado: ${destino}`);

const viejos = readdirSync(CARPETA).filter((f) => /^licitaciones-.*\.db$/.test(f)).sort().slice(0, -CONSERVAR);
for (const f of viejos) {
  rmSync(join(CARPETA, f));
  console.log(`Borrado backup viejo: ${f}`);
}
