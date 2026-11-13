import { defineConfig, devices } from '@playwright/test';

/**
 * E2E contra el build de producción, con una base vacía en `.e2e-data`
 * que se borra en cada corrida. El admin lo crea el primer arranque.
 */
const PUERTO = 4600;
export const URL_BASE = `http://localhost:${PUERTO}`;
export const ADMIN = { email: 'e2e@municipio.gob.ar', clave: 'clave-e2e-segura-123' };

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  reporter: [['list']],
  use: {
    baseURL: URL_BASE,
    locale: 'es-AR',
    timezoneId: 'America/Argentina/Buenos_Aires',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command:
      'node -e "require(\'fs\').rmSync(\'.e2e-data\',{recursive:true,force:true})" && pnpm build && node dist/server/entry.mjs',
    url: `${URL_BASE}/salud`,
    timeout: 180_000,
    reuseExistingServer: false,
    env: {
      HOST: '127.0.0.1',
      PORT: String(PUERTO),
      DATA_DIR: './.e2e-data',
      SITE_URL: URL_BASE,
      ADMIN_EMAIL: ADMIN.email,
      ADMIN_CLAVE: ADMIN.clave,
      ADMIN_NOMBRE: 'Prueba E2E',
    },
  },
});
