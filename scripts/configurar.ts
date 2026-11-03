/**
 * Carga la configuración del sitio desde una carpeta (ver ejemplos/lobos):
 *   configuracion.json   campos de la configuración (los que falten quedan como están)
 *   logo.png|jpg|webp    opcional
 *   favicon.png|jpg|webp opcional, cuadrado
 *
 *   pnpm configurar ejemplos/lobos
 *
 * Es lo mismo que completar /panel/configuracion, pero de una vez. Queda en el registro
 * de cambios como «Configuración inicial».
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { db } from '../src/lib/db';
import { SECCIONES, guardarSeccion, leerConfiguracion, type ConfigSitio, type Seccion } from '../src/lib/configuracion';
import { borrarImagenMarca, guardarImagenMarca, type ClaseImagen } from '../src/lib/marca-archivos';

const carpeta = process.argv[2];
if (!carpeta) {
  console.error('Uso: pnpm configurar <carpeta>   (ej. pnpm configurar ejemplos/lobos)');
  process.exit(1);
}
const raiz = resolve(carpeta);
const rutaJson = join(raiz, 'configuracion.json');
if (!existsSync(rutaJson)) {
  console.error(`No existe ${rutaJson}`);
  process.exit(1);
}

const QUIEN = 'Configuración inicial';
const conexion = db();
const datos = JSON.parse(readFileSync(rutaJson, 'utf8')) as Partial<ConfigSitio>;

for (const seccion of Object.keys(SECCIONES) as Seccion[]) {
  const campos = SECCIONES[seccion].campos as readonly (keyof ConfigSitio)[];
  const parcial = Object.fromEntries(Object.entries(datos).filter(([k]) => campos.includes(k as keyof ConfigSitio)));
  if (Object.keys(parcial).length === 0) continue;
  const cambios = guardarSeccion(conexion, QUIEN, seccion, parcial);
  console.log(`  ✓ ${SECCIONES[seccion].nombre}: ${cambios.length ? cambios.map((c) => c.campo).join(', ') : 'sin cambios'}`);
}

for (const clase of ['logo', 'favicon'] as ClaseImagen[]) {
  const ext = ['png', 'jpg', 'webp'].find((e) => existsSync(join(raiz, `${clase}.${e}`)));
  if (!ext) continue;
  const archivo = join(raiz, `${clase}.${ext}`);
  const r = await guardarImagenMarca(clase, new Uint8Array(readFileSync(archivo)), `${clase}.${ext}`);
  if ('error' in r) {
    console.error(`  ✗ ${r.error}`);
    process.exitCode = 1;
    continue;
  }
  const anterior = leerConfiguracion(conexion)[clase];
  guardarSeccion(conexion, QUIEN, 'identidad', { [clase]: r.imagen });
  await borrarImagenMarca(anterior?.archivo);
  console.log(`  ✓ ${clase}: ${r.imagen.ancho} × ${r.imagen.alto} px`);
}
