import { expect, test } from './fixtures';
import type { Page } from '@playwright/test';
import { ADMIN, URL_BASE } from '../../playwright.config';

const origen = { Origin: URL_BASE };

async function ingresar(page: Page) {
  await page.goto('/panel/login');
  await page.getByLabel('Email').fill(ADMIN.email);
  await page.getByLabel('Contraseña').fill(ADMIN.clave);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page.getByRole('heading', { name: 'Procedimientos', level: 1 })).toBeVisible();
}

/** Las acciones responden serializadas con devalue: `[{"id":1}, 42]`. */
function idDeRespuesta(cuerpo: unknown): number {
  const filas = cuerpo as [{ id: number }, ...number[]];
  return filas[filas[0].id] as number;
}

test('el sitio y el panel mandan la Content-Security-Policy', async ({ page }) => {
  for (const ruta of ['/', '/panel/login']) {
    const res = await page.request.get(ruta);
    expect(res.headers()['content-security-policy']).toContain("script-src 'self'");
  }
});

test('un objeto con </script> no ejecuta nada en la ficha pública', async ({ page }) => {
  await ingresar(page);
  const anio = new Date().getFullYear();
  const numero = 900 + Math.floor(Math.random() * 99);
  const alta = await page.request.post('/_actions/crearProcedimiento', {
    multipart: { tipo: 'concurso', numero: String(numero), anio: String(anio), objeto: 'Prueba </script><script>window.__inyectado = 1</script> fin' },
    headers: origen,
  });
  expect(alta.ok()).toBe(true);
  const id = idDeRespuesta(await alta.json());
  const estado = await page.request.post('/_actions/cambiarEstado', { multipart: { id: String(id), destino: 'tramite' }, headers: origen });
  expect(estado.ok()).toBe(true);

  await page.goto(`/concurso/${anio}/${numero}`);
  await expect(page.locator('main')).toContainText('window.__inyectado');
  expect(await page.evaluate(() => (window as Window & { __inyectado?: number }).__inyectado)).toBeUndefined();
});

test('el login se bloquea después de 5 intentos fallidos', async ({ page }) => {
  const email = `nadie${Date.now()}@ejemplo.org`;
  const intentar = () => page.request.post('/panel/login', { form: { email, clave: 'clave-incorrecta' }, headers: origen, maxRedirects: 0 });
  for (let i = 0; i < 5; i++) expect((await intentar()).status()).toBe(401);
  const bloqueado = await intentar();
  expect(bloqueado.status()).toBe(429);
  expect(await bloqueado.text()).toContain('Demasiados intentos fallidos');
});

test('el footer público lleva al panel, que pide ingresar', async ({ page }) => {
  await page.goto('/');
  await page.locator('footer').getByRole('link', { name: 'Ingresar al panel' }).click();
  await expect(page).toHaveURL(/\/panel\/login/);
});
