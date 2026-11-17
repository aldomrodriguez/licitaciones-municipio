import { expect, test } from './fixtures';
import type { Page } from '@playwright/test';
import { ADMIN, URL_BASE } from '../../playwright.config';

/** El celular más angosto en uso (iPhone SE de primera generación): nada puede desbordar a los costados. */
test.use({ viewport: { width: 320, height: 700 }, isMobile: true, hasTouch: true });

const anchoPagina = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth);

test('a 320 px ninguna página tiene scroll horizontal, ni con el calendario o un desplegable abiertos', async ({ page }) => {
  await page.goto('/');
  expect(await anchoPagina(page)).toBe(320);

  // Desplegable de la columna derecha de los filtros: se corre para quedar dentro de la pantalla.
  await page.getByRole('combobox', { name: 'Estado' }).click();
  const lista = page.getByRole('listbox', { name: 'Estado' });
  await expect(lista).toBeVisible();
  expect((await lista.boundingBox())!.x + (await lista.boundingBox())!.width).toBeLessThanOrEqual(320);
  expect(await anchoPagina(page)).toBe(320);

  await page.goto('/panel/login');
  await page.getByLabel('Email').fill(ADMIN.email);
  await page.getByLabel('Contraseña').fill(ADMIN.clave);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page.getByRole('heading', { name: 'Procedimientos', level: 1 })).toBeVisible();

  const alta = await page.request.post('/_actions/crearProcedimiento', {
    multipart: { tipo: 'publica', numero: String(700 + Math.floor(Math.random() * 99)), anio: '2026', objeto: 'Pública para revisar el celular' },
    headers: { Origin: URL_BASE },
  });
  const filas = (await alta.json()) as [{ id: number }, ...number[]];
  const ficha = `/panel/procedimientos/${filas[filas[0].id]}`;

  for (const ruta of ['/panel', '/panel/nuevo', ficha, '/panel/usuarios', '/panel/configuracion', '/panel/papelera', '/panel/cuenta']) {
    await page.goto(ruta);
    expect(await anchoPagina(page), ruta).toBe(320);
  }

  // El calendario mide 312 px: abierto desde un campo con sangría, igual entra.
  await page.goto(ficha);
  await page.getByRole('button', { name: /Fecha de apertura/ }).click();
  const calendario = page.getByRole('dialog', { name: /Elegir fecha de apertura/ });
  await expect(calendario).toBeVisible();
  const caja = (await calendario.boundingBox())!;
  expect(caja.x).toBeGreaterThanOrEqual(0);
  expect(caja.x + caja.width).toBeLessThanOrEqual(320);
  expect(await anchoPagina(page)).toBe(320);
});
