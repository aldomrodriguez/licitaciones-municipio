/** Logo y favicon subidos desde el panel. Viven en DATA_DIR/marca con nombre único por subida. */
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DATA_DIR } from './db';
import { MIME_IMAGEN, leerImagen, type TipoImagen } from './imagen';
import type { ImagenMarca } from './configuracion';

export const CARPETA_MARCA = join(DATA_DIR, 'marca');
export const TAMANO_MAXIMO_MARCA = 2 * 1024 * 1024;
const NOMBRE_VALIDO = /^[\w-]+\.(png|jpg|webp)$/;

export type ClaseImagen = 'logo' | 'favicon';

/** Valida (firma de bytes, tamaño, proporción del favicon) y guarda. Devuelve el error para el operador o la imagen. */
export async function guardarImagenMarca(clase: ClaseImagen, bytes: Uint8Array, nombreOriginal: string): Promise<{ error: string } | { imagen: ImagenMarca }> {
  if (bytes.length === 0) return { error: `«${nombreOriginal}» está vacío.` };
  if (bytes.length > TAMANO_MAXIMO_MARCA) return { error: `«${nombreOriginal}» supera los 2 MB.` };
  const info = leerImagen(bytes);
  if (!info) return { error: `«${nombreOriginal}» no es una imagen PNG, JPG o WebP válida. SVG no se acepta.` };
  if (clase === 'favicon') {
    const proporcion = info.ancho / info.alto;
    if (proporcion < 0.9 || proporcion > 1.1) return { error: `El ícono tiene que ser cuadrado. Esta imagen mide ${info.ancho} × ${info.alto} px.` };
  }
  await mkdir(CARPETA_MARCA, { recursive: true });
  const archivo = `${clase}-${randomUUID()}.${info.tipo}`;
  await writeFile(join(CARPETA_MARCA, archivo), bytes);
  return { imagen: { archivo, ancho: info.ancho, alto: info.alto } };
}

export async function borrarImagenMarca(archivo: string | undefined) {
  if (!archivo || !NOMBRE_VALIDO.test(archivo)) return;
  await rm(join(CARPETA_MARCA, archivo), { force: true });
}

/** Respuesta para /marca/[archivo]: el nombre cambia en cada subida, así que se cachea para siempre. */
export async function respuestaImagenMarca(archivo: string): Promise<Response> {
  if (!NOMBRE_VALIDO.test(archivo)) return new Response('No encontrado', { status: 404 });
  try {
    const bytes = await readFile(join(CARPETA_MARCA, archivo));
    const tipo = archivo.split('.').pop() as TipoImagen;
    return new Response(new Uint8Array(bytes), {
      headers: { 'Content-Type': MIME_IMAGEN[tipo], 'Cache-Control': 'public, max-age=31536000, immutable' },
    });
  } catch {
    return new Response('No encontrado', { status: 404 });
  }
}
