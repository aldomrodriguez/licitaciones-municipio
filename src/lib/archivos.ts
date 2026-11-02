import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { Readable } from 'node:stream';
import { DATA_DIR } from './db';
import { TAMANO_MAXIMO_CLIENTE } from './archivos-cliente';

export const CARPETA_DOCUMENTOS = join(DATA_DIR, 'documentos');
export const TAMANO_MAXIMO = TAMANO_MAXIMO_CLIENTE;

/** Extensiones aceptadas y su tipo MIME canónico (no confiamos en el que manda el navegador). */
export const TIPOS_PERMITIDOS: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.odt': 'application/vnd.oasis.opendocument.text',
  '.ods': 'application/vnd.oasis.opendocument.spreadsheet',
  '.zip': 'application/zip',
};

/** Firmas de los primeros bytes, para no aceptar un ejecutable renombrado a .pdf. */
const FIRMAS: Record<string, number[][]> = {
  'application/pdf': [[0x25, 0x50, 0x44, 0x46]],
  'image/jpeg': [[0xff, 0xd8, 0xff]],
  'image/png': [[0x89, 0x50, 0x4e, 0x47]],
  'image/webp': [[0x52, 0x49, 0x46, 0x46]],
  'application/msword': [[0xd0, 0xcf, 0x11, 0xe0]],
  'application/vnd.ms-excel': [[0xd0, 0xcf, 0x11, 0xe0]],
};
const ZIP = [[0x50, 0x4b, 0x03, 0x04]];

function coincideFirma(mime: string, bytes: Uint8Array): boolean {
  const firmas = FIRMAS[mime] ?? ZIP; // docx, xlsx, odt, ods y zip son ZIP por dentro
  return firmas.some((f) => f.every((b, i) => bytes[i] === b));
}

export interface ArchivoGuardado {
  archivo: string;
  nombreOriginal: string;
  mime: string;
  tamano: number;
}

export function validarArchivo(nombre: string, tamano: number): string | null {
  const ext = extname(nombre).toLowerCase();
  if (!TIPOS_PERMITIDOS[ext]) return `«${nombre}»: formato no admitido. Se aceptan PDF, imágenes, Word, Excel, OpenDocument y ZIP.`;
  if (tamano === 0) return `«${nombre}» está vacío.`;
  if (tamano > TAMANO_MAXIMO) return `«${nombre}» supera los 25 MB.`;
  return null;
}

export async function guardarArchivo(file: File): Promise<ArchivoGuardado> {
  const error = validarArchivo(file.name, file.size);
  if (error) throw new Error(error);
  const ext = extname(file.name).toLowerCase();
  const mime = TIPOS_PERMITIDOS[ext]!;
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!coincideFirma(mime, bytes)) throw new Error(`«${file.name}» no parece ser un ${ext.slice(1).toUpperCase()} válido.`);
  await mkdir(CARPETA_DOCUMENTOS, { recursive: true });
  const archivo = `${randomUUID()}${ext}`;
  await writeFile(join(CARPETA_DOCUMENTOS, archivo), bytes);
  return { archivo, nombreOriginal: file.name.slice(0, 200), mime, tamano: file.size };
}

export async function borrarArchivo(archivo: string) {
  if (!/^[\w-]+\.\w+$/.test(archivo)) return;
  await rm(join(CARPETA_DOCUMENTOS, archivo), { force: true });
}

/** Respuesta de descarga en streaming. `inline` para previsualizar imágenes/PDF en el panel. */
export async function respuestaDescarga(archivo: string, nombre: string, mime: string, inline = false): Promise<Response> {
  if (!/^[\w-]+\.\w+$/.test(archivo)) return new Response('No encontrado', { status: 404 });
  const ruta = join(CARPETA_DOCUMENTOS, archivo);
  const info = await stat(ruta).catch(() => null);
  if (!info) return new Response('El archivo no está disponible.', { status: 404 });
  const cuerpo = Readable.toWeb(createReadStream(ruta)) as ReadableStream<Uint8Array>;
  const disposicion = inline ? 'inline' : 'attachment';
  return new Response(cuerpo, {
    headers: {
      'Content-Type': mime,
      'Content-Length': String(info.size),
      'Content-Disposition': `${disposicion}; filename="${nombre.replace(/[^\w.\- ]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(nombre)}`,
      'Cache-Control': 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

/** Nombre de descarga legible: "Licitacion-Publica-07-2026 - Pliego.pdf". */
export function nombreDescarga(base: string, titulo: string, archivo: string): string {
  const limpio = (s: string) =>
    s.replace(/ n° /g, ' ').replace(/\//g, '-').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w\- ]+/g, '').trim();
  return `${limpio(base)} - ${limpio(titulo)}${extname(archivo)}`;
}
