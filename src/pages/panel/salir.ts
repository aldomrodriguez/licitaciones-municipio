import type { APIRoute } from 'astro';
import { db } from '../../lib/db';
import { COOKIE_SESION, borrarCookie, cerrarSesion } from '../../lib/auth';

export const POST: APIRoute = ({ cookies, redirect }) => {
  cerrarSesion(db(), cookies.get(COOKIE_SESION)?.value);
  borrarCookie(cookies);
  return redirect('/panel/login', 303);
};
