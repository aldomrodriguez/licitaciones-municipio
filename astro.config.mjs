// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import node from '@astrojs/node';

// Dominio público del micrositio. Queda fijo en el build (ver Dockerfile).
const site = process.env.SITE_URL || 'http://localhost:4321';

export default defineConfig({
  site,
  output: 'server',
  // Tope de cualquier pedido: un documento de 25 MB más el sobre del formulario.
  adapter: node({ mode: 'standalone', bodySizeLimit: 27 * 1024 * 1024 }),
  security: {
    // CSRF: rechaza POST de otros orígenes.
    checkOrigin: true,
    // Detrás del proxy de Coolify: confiar en X-Forwarded-Host solo para el dominio propio.
    allowedDomains: [{ hostname: new URL(site).hostname }],
  },
  vite: {
    plugins: [tailwindcss()],
    // Ningún script en línea: la Content-Security-Policy solo permite scripts del propio dominio
    // (ver lib/seguridad.ts). Sin esto Astro incrusta en el HTML los scripts chicos.
    build: { assetsInlineLimit: 0 },
    ssr: { external: ['better-sqlite3', '@node-rs/argon2'] },
  },
});
