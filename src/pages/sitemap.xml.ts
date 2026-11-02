import type { APIRoute } from 'astro';
import { db } from '../lib/db';
import { listarPublico } from '../lib/procedimientos';
import { urlPublica } from '../lib/rutas';

export const GET: APIRoute = ({ site }) => {
  const base = site ?? new URL('https://licitaciones.municipiodelobos.gob.ar');
  const urls = [
    `<url><loc>${new URL('/', base)}</loc></url>`,
    ...listarPublico(db(), {}).map(
      ({ p }) => `<url><loc>${new URL(urlPublica(p), base)}</loc><lastmod>${p.actualizadoEn.toISOString().slice(0, 10)}</lastmod></url>`,
    ),
  ];
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join('')}</urlset>`, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
  });
};
