import type { APIRoute } from 'astro';
import { db } from '../../../../lib/db';
import { documentoParaDescarga, nombreProcedimiento } from '../../../../lib/procedimientos';
import { nombreDescarga, respuestaDescarga } from '../../../../lib/archivos';

/** Ver o descargar desde el panel: incluye internos y los que están en la papelera. */
export const GET: APIRoute = async ({ params, url }) => {
  const id = Number(params.id);
  const r = Number.isInteger(id) ? documentoParaDescarga(db(), id, false) : null;
  if (!r) return new Response('No encontrado', { status: 404 });
  const inline = url.searchParams.has('ver') && (r.d.mime === 'application/pdf' || r.d.mime.startsWith('image/'));
  const res = await respuestaDescarga(r.d.archivo, nombreDescarga(nombreProcedimiento(r.p), r.d.titulo, r.d.archivo), r.d.mime, inline);
  res.headers.set('Cache-Control', 'private, no-store');
  return res;
};
