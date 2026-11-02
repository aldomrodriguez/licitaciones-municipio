import type { APIRoute } from 'astro';
import { db } from '../../lib/db';
import { documentoParaDescarga, nombreProcedimiento } from '../../lib/procedimientos';
import { nombreDescarga, respuestaDescarga } from '../../lib/archivos';

/** Descarga pública: solo documentos públicos de procedimientos publicados. */
export const GET: APIRoute = async ({ params }) => {
  const id = Number(params.id);
  if (!Number.isInteger(id)) return new Response('No encontrado', { status: 404 });
  const r = documentoParaDescarga(db(), id, true);
  if (!r) return new Response('El documento no existe o no es público.', { status: 404 });
  return respuestaDescarga(r.d.archivo, nombreDescarga(nombreProcedimiento(r.p), r.d.titulo, r.d.archivo), r.d.mime);
};
