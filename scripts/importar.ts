/**
 * Importa procedimientos anteriores al sistema desde un JSON (formato en scripts/importar/formato.ts,
 * ejemplo en ejemplos/importacion.json).
 *
 *   pnpm importar <archivo.json>                    → simulación: solo genera el reporte, no toca la base
 *   pnpm importar <archivo.json> --aplicar          → importa y baja los documentos de sus URLs
 *   pnpm importar <archivo.json> --aplicar --sin-documentos
 *
 * Los que ya existen (mismo tipo/número/año) se saltean: se puede correr de nuevo sin duplicar.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { and, eq } from 'drizzle-orm';
import { DATA_DIR, db } from '../src/lib/db';
import { adjudicaciones, documentos, historial, procedimientos } from '../src/lib/db/schema';
import { ESTADOS, TIPOS } from '../src/lib/estados';
import { guardarArchivo } from '../src/lib/archivos';
import { leerImportacion, revisarConjunto, type Importado } from './importar/formato';

const args = new Set(process.argv.slice(2));
const APLICAR = args.has('--aplicar');
const CON_DOCUMENTOS = !args.has('--sin-documentos');
const ORIGEN = process.argv.slice(2).find((a) => !a.startsWith('--'));
const ACTOR = 'Importación inicial';

if (!ORIGEN) {
  console.error('Uso: pnpm importar <archivo.json> [--aplicar] [--sin-documentos]   (ej. pnpm importar ejemplos/importacion.json)');
  process.exit(1);
}

async function bajar(url: string): Promise<File> {
  const r = await fetch(url, { redirect: 'follow' });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const nombre = decodeURIComponent(url.split('/').pop() ?? 'documento.pdf');
  return new File([await r.arrayBuffer()], /\.\w{2,4}$/.test(nombre) ? nombre : `${nombre}.pdf`);
}

function nombre(it: Pick<Importado, 'tipo' | 'numero' | 'anio'>) {
  return `${TIPOS[it.tipo].nombre} n° ${it.numero}/${it.anio}`;
}

async function main() {
  const { items, errores } = leerImportacion(await readFile(ORIGEN!, 'utf8'));
  const avisosGenerales = revisarConjunto(items);
  const conexion = db();
  const vistos = new Set<string>();
  const lineas: string[] = [];
  const fallidos: string[] = [];
  let creados = 0;
  let salteados = 0;
  let docsOk = 0;

  for (const it of items) {
    if (vistos.has(it.clave)) continue;
    vistos.add(it.clave);

    const existe = conexion
      .select({ id: procedimientos.id })
      .from(procedimientos)
      .where(and(eq(procedimientos.tipo, it.tipo), eq(procedimientos.numero, it.numero), eq(procedimientos.anio, it.anio)))
      .get();
    if (existe) {
      salteados++;
      continue;
    }
    if (it.advertencias.length) {
      lineas.push(`- **${nombre(it)}** (${ESTADOS[it.estado].nombre})`, ...it.advertencias.map((a) => `  - ${a}`));
    }
    if (!APLICAR) {
      creados++;
      continue;
    }

    const ahora = new Date();
    const id = conexion.transaction((tx) => {
      const { id } = tx
        .insert(procedimientos)
        .values({
          tipo: it.tipo,
          numero: it.numero,
          anio: it.anio,
          objeto: it.objeto,
          presupuestoOficial: it.presupuestoOficial,
          valorPliego: it.valorPliego,
          fechaApertura: it.fechaApertura,
          invitados: it.invitados,
          cantidadOfertantes: it.cantidadOfertantes,
          observacionesPublicas: it.observacionesPublicas,
          estado: it.estado,
          motivoEstado: it.motivoEstado,
          creadoEn: ahora,
          actualizadoEn: ahora,
        })
        .returning({ id: procedimientos.id })
        .get();
      it.adjudicaciones.forEach((a, orden) =>
        tx.insert(adjudicaciones).values({ procedimientoId: id, proveedor: a.proveedor, monto: a.monto, orden }).run(),
      );
      tx.insert(historial)
        .values({
          procedimientoId: id,
          usuarioNombre: ACTOR,
          accion: 'creado',
          valorNuevo: `${nombre(it)}, estado ${ESTADOS[it.estado].nombre}`,
          motivo: 'Cargado desde la publicación anterior al sistema.',
        })
        .run();
      return id;
    });
    creados++;

    if (!CON_DOCUMENTOS) continue;
    for (const d of it.documentos) {
      try {
        const g = await guardarArchivo(await bajar(d.url));
        conexion.insert(documentos).values({ procedimientoId: id, titulo: d.titulo, categoria: d.categoria, ...g, publico: true }).run();
        docsOk++;
      } catch (e) {
        fallidos.push(`- ${nombre(it)}: ${d.url} (${(e as Error).message})`);
      }
    }
  }

  const reporte = [
    `# Reporte de importación (${APLICAR ? 'aplicada' : 'simulación'})`,
    '',
    `Origen: \`${ORIGEN}\` · ${items.length} registros válidos · ${errores.length} rechazados · ${creados} ${APLICAR ? 'importados' : 'a importar'} · ${salteados} ya existían.`,
    APLICAR && CON_DOCUMENTOS ? `Documentos descargados: ${docsOk}. Fallidos: ${fallidos.length}.` : '',
    '',
    ...(errores.length ? ['## Registros rechazados (no se importan)', '', ...errores.map((e) => `- ${e}`), ''] : []),
    '## Para revisar con Compras',
    '',
    ...avisosGenerales.map((a) => `- ${a}`),
    '',
    '## Advertencias por procedimiento',
    '',
    ...lineas,
    ...(fallidos.length ? ['', '## Documentos que no se pudieron descargar', '', ...fallidos] : []),
    '',
  ].join('\n');
  await mkdir(DATA_DIR, { recursive: true });
  const ruta = join(DATA_DIR, 'reporte-importacion.md');
  await writeFile(ruta, reporte);
  console.log(reporte.split('\n').slice(0, 4).join('\n'));
  console.log(`\nReporte completo: ${ruta}`);
}

main().catch((e: Error) => {
  console.error(e);
  process.exit(1);
});
