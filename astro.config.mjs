// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import node from '@astrojs/node';

// Dominio público del micrositio. Queda fijo en el build (ver Dockerfile).
const site = process.env.SITE_URL || 'http://localhost:4321';

export default defineConfig({
  site,
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  security: {
    // CSRF: rechaza POST de otros orígenes.
    checkOrigin: true,
    // Detrás del proxy de Coolify: confiar en X-Forwarded-Host solo para el dominio propio.
    allowedDomains: [{ hostname: new URL(site).hostname }],
  },
  vite: {
    plugins: [tailwindcss()],
    ssr: { external: ['better-sqlite3', '@node-rs/argon2'] },
  },
});
