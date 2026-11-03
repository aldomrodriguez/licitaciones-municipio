/** Utilidades de seguridad sin dependencias de Astro (se testean con Vitest). */

/**
 * JSON para incrustar en un `<script type="application/ld+json">`. `JSON.stringify` no escapa
 * `<`: un texto con `</script>` cerraría el bloque y lo que sigue se ejecutaría como HTML.
 */
export function jsonParaScript(valor: object): string {
  return JSON.stringify(valor)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/** A dónde volver después del login: solo rutas del panel, nunca otro sitio. */
export function destinoDespuesDeLogin(volver: string | null): string {
  if (!volver) return '/panel';
  const valido = /^\/panel(?:[/?#]|$)/.test(volver) && !volver.includes('//') && !volver.includes('\\');
  return valido ? volver : '/panel';
}

/**
 * Content-Security-Policy del sitio y el panel. Los scripts solo pueden venir del propio
 * dominio (Astro los compila a archivos), así que un texto inyectado no se ejecuta.
 * Los estilos admiten `unsafe-inline` porque los colores de la marca se escriben por pedido.
 */
export const POLITICA_CONTENIDO = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:", // blob: vista previa del logo antes de subirlo
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

/**
 * Si el pedido declara un cuerpo más grande que `maximo`, se rechaza antes de leerlo
 * (si no, `formData()` carga todo en memoria y recién después se valida el archivo).
 */
export function excedeTamano(request: Request, maximo: number): boolean {
  const largo = Number(request.headers.get('content-length'));
  return Number.isFinite(largo) && largo > maximo;
}

/** Margen para los campos y separadores del formulario multipart. */
export const MARGEN_FORMULARIO = 64 * 1024;
