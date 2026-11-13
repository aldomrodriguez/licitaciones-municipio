import { defineMiddleware } from 'astro:middleware';
import { COOKIE_SESION, validarSesion } from './lib/auth';
import { db } from './lib/db';
import { leerConfiguracion } from './lib/configuracion';
import { POLITICA_CONTENIDO } from './lib/seguridad';

const PUBLICAS_DEL_PANEL = new Set(['/panel/login']);
/** Lo único que puede usar alguien que todavía tiene la contraseña generada por el sistema. */
const PERMITIDAS_CON_CLAVE_PROVISORIA = new Set(['/panel/cuenta', '/panel/salir', '/_actions/cambiarMiClave']);
const HTTPS = import.meta.env.SITE?.startsWith('https:') ?? false;

export const onRequest = defineMiddleware(async (ctx, next) => {
  const { pathname } = ctx.url;
  // En producción el cliente de las acciones agrega la barra final (/_actions/x/): se compara sin ella.
  const ruta = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  const enPanel = pathname === '/panel' || pathname.startsWith('/panel/') || pathname.startsWith('/_actions/');
  const esApi = pathname.startsWith('/_actions/') || pathname.startsWith('/panel/api/');
  ctx.locals.sitio = leerConfiguracion(db());
  ctx.locals.usuario = enPanel ? validarSesion(db(), ctx.cookies.get(COOKIE_SESION)?.value) : null;

  if (enPanel && !ctx.locals.usuario && !PUBLICAS_DEL_PANEL.has(ruta)) {
    if (esApi) return new Response('Sesión vencida. Volvé a ingresar.', { status: 401 });
    return ctx.redirect(`/panel/login?volver=${encodeURIComponent(pathname + ctx.url.search)}`);
  }

  if (ctx.locals.usuario?.debeCambiarClave && !PERMITIDAS_CON_CLAVE_PROVISORIA.has(ruta)) {
    if (esApi) return new Response('Antes de seguir tenés que cambiar la contraseña provisoria.', { status: 403 });
    return ctx.redirect('/panel/cuenta');
  }

  const res = await next();
  if (enPanel) {
    res.headers.set('Cache-Control', 'no-store');
    res.headers.set('X-Robots-Tag', 'noindex');
  }
  res.headers.set('X-Content-Type-Options', 'nosniff');
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.headers.set('X-Frame-Options', 'DENY');
  // En desarrollo Vite inyecta scripts en línea: la política se aplica solo al build.
  if (import.meta.env.PROD) res.headers.set('Content-Security-Policy', POLITICA_CONTENIDO);
  if (HTTPS) res.headers.set('Strict-Transport-Security', 'max-age=31536000');
  return res;
});
