import type { APIRoute } from 'astro';
import { sql } from 'drizzle-orm';
import { db } from '../lib/db';

/** Healthcheck para Docker/Coolify: verifica que la base responda. */
export const GET: APIRoute = () => {
  try {
    db().run(sql`select 1`);
    return new Response('ok', { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return new Response('base no disponible', { status: 503 });
  }
};
