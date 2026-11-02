import { defineMiddleware } from 'astro:middleware';
import { COOKIE_SESION, validarSesion } from './lib/auth';
import { db } from './lib/db';

const PUBLICAS_DEL_PANEL = new Set(['/panel/login', '/panel/login/']);

export const onRequest = defineMiddleware(async (ctx, next) => {
  const { pathname } = ctx.url;
  const enPanel = pathname === '/panel' || pathname.startsWith('/panel/') || pathname.startsWith('/_actions/');
  ctx.locals.usuario = enPanel ? validarSesion(db(), ctx.cookies.get(COOKIE_SESION)?.value) : null;

  if (enPanel && !ctx.locals.usuario && !PUBLICAS_DEL_PANEL.has(pathname)) {
    if (pathname.startsWith('/_actions/') || pathname.startsWith('/panel/api/')) {
      return new Response('Sesión vencida. Volvé a ingresar.', { status: 401 });
    }
    return ctx.redirect(`/panel/login?volver=${encodeURIComponent(pathname + ctx.url.search)}`);
  }

  const res = await next();
  if (enPanel) {
    res.headers.set('Cache-Control', 'no-store');
    res.headers.set('X-Robots-Tag', 'noindex');
  }
  res.headers.set('X-Content-Type-Options', 'nosniff');
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.headers.set('X-Frame-Options', 'DENY');
  return res;
});
