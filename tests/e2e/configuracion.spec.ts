import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { readFileSync } from 'node:fs';
import { ADMIN } from '../../playwright.config';

async function ingresar(page: Page) {
  await page.goto('/panel/login');
  await page.getByLabel('Email').fill(ADMIN.email);
  await page.getByLabel('Contraseña').fill(ADMIN.clave);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page.getByRole('heading', { name: 'Procedimientos', level: 1 })).toBeVisible();
}

async function confirmar(page: Page) {
  const dialogo = page.locator('#dlg-confirmar');
  await expect(dialogo).toBeVisible();
  await dialogo.locator('#dlg-ok').click();
}

test('configuración del sitio: identidad, logo, header y registro', async ({ page }) => {
  // Instalación nueva: el sitio es genérico y el panel avisa.
  await page.goto('/');
  await expect(page).toHaveTitle('Licitaciones | Municipio');
  await ingresar(page);
  await expect(page.getByRole('navigation', { name: 'Secciones del panel' }).getByRole('link', { name: 'Configuración del sitio' })).toBeVisible();
  await expect(page.getByText('El sitio público todavía muestra un nombre y colores genéricos.')).toBeVisible();
  await page.getByRole('link', { name: 'Configurar el sitio' }).click();
  await expect(page.getByRole('heading', { name: 'Configuración del sitio', level: 1 })).toBeVisible();

  // Un color claro no se deja guardar: no se abre la confirmación.
  const identidad = page.locator('[data-form-identidad]');
  await identidad.getByLabel('Nombre del organismo').fill('Municipio de Prueba');
  await identidad.getByLabel('Código del color').fill('#ffcc00');
  await expect(identidad.locator('#color-estado')).toContainText('muy claro');
  await identidad.getByRole('button', { name: 'Guardar identidad' }).click();
  await expect(page.locator('#dlg-confirmar')).toBeHidden();

  // Con un color sugerido sí, y la confirmación muestra el diff.
  await identidad.getByRole('radio', { name: 'Verde azulado' }).click();
  await identidad.getByRole('button', { name: 'Guardar identidad' }).click();
  await expect(page.locator('#dlg-lista')).toContainText('Nombre del organismo');
  await expect(page.locator('#dlg-lista')).toContainText('#0f6b5c');
  await confirmar(page);
  await expect(page.getByRole('status')).toContainText('Identidad guardada.');
  await expect(page.getByText('El sitio público todavía muestra')).toHaveCount(0);

  // Logo: vista previa, confirmación y subida.
  const logo = page.locator('[data-imagen-marca][data-clase="logo"]');
  await logo.locator('[data-elegir]').setInputFiles('ejemplos/lobos/logo.png');
  await expect(logo.locator('[data-vista]')).toBeVisible();
  await logo.getByRole('button', { name: 'Usar esta imagen' }).click();
  await confirmar(page);
  await expect(page.getByRole('status')).toContainText('Logo actualizado.');

  // Un SVG no se acepta, ni desde la pantalla ni pegándole directo a la API.
  await logo.locator('[data-elegir]').setInputFiles({ name: 'logo.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>') });
  await expect(logo.locator('[data-error]')).toContainText('no es PNG, JPG ni WebP');
  const api = await page.request.post('/panel/api/marca', {
    multipart: { clase: 'logo', archivo: { name: 'logo.png', mimeType: 'image/png', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>') } },
    headers: { Origin: new URL(page.url()).origin },
  });
  expect(api.status()).toBe(400);

  // Menú: un link javascript: lo rechaza el servidor.
  const encabezado = page.locator('[data-form-encabezado]');
  const menu = encabezado.getByRole('group', { name: 'Menú del header' });
  await menu.getByRole('button', { name: 'Agregar link' }).click();
  await menu.locator('[data-fila]').last().locator('[data-texto]').fill('Compras');
  await menu.locator('[data-fila]').last().locator('[data-href]').fill('javascript:alert(1)');
  await encabezado.getByRole('button', { name: 'Guardar header y footer' }).click();
  await expect(page.locator('#dlg-lista')).toContainText('— → Compras (javascript:alert(1))');
  await page.locator('#dlg-ok').click();
  await expect(page.locator('#dlg-error')).toContainText('https://');
  await page.locator('#dlg-confirmar [data-cancelar]').click();

  // Corregido, se guarda.
  await menu.locator('[data-fila]').last().locator('[data-href]').fill('https://compras.ejemplo.gob.ar/');
  await encabezado.getByRole('button', { name: 'Guardar header y footer' }).click();
  await confirmar(page);
  await expect(page.getByRole('status')).toContainText('Header y footer guardados.');

  // El sitio público refleja todo.
  await page.goto('/');
  await expect(page).toHaveTitle('Licitaciones | Municipio de Prueba');
  await expect(page.getByRole('navigation', { name: 'Navegación principal' }).getByRole('link', { name: 'Compras' })).toHaveAttribute('href', 'https://compras.ejemplo.gob.ar/');
  const src = await page.locator('header img').first().getAttribute('src');
  expect(src).toMatch(/^\/marca\/logo-[\w-]+\.png$/);
  const imagen = await page.request.get(src!);
  expect(imagen.headers()['content-type']).toBe('image/png');
  expect(Buffer.from(await imagen.body()).equals(readFileSync('ejemplos/lobos/logo.png'))).toBe(true);
  const color = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--color-marca').trim());
  expect(color).toBe('#0f6b5c');
  await expect(page.locator('footer')).toContainText('Municipio de Prueba');

  // Quitar un link pide confirmación y se aplica al guardar.
  await page.goto('/panel/configuracion');
  await menu.getByRole('button', { name: 'Quitar «Compras»' }).click();
  await expect(page.locator('#dlg-titulo')).toHaveText('¿Quitar este link?');
  await confirmar(page);
  await expect(menu.locator('[data-fila]')).toHaveCount(0);
  await encabezado.getByRole('button', { name: 'Guardar header y footer' }).click();
  await confirmar(page);
  await page.goto('/');
  await expect(page.getByRole('navigation', { name: 'Navegación principal' }).getByRole('link', { name: 'Compras' })).toHaveCount(0);

  // Todo quedó en el registro.
  await page.goto('/panel/configuracion');
  const registro = page.getByRole('region', { name: 'Registro de cambios' });
  await expect(registro).toContainText('Prueba E2E');
  await expect(registro).toContainText('Menú del header');
  await expect(registro).toContainText('Logo');
});

test('la configuración es solo para administradores', async ({ page, browser }) => {
  const origen = { Origin: 'http://localhost:4600' };
  const email = `compras${Date.now()}@municipio.gob.ar`;
  const textos = { queEs: 'Texto de prueba suficientemente largo', publica: 'xxxxxxxxxxx', privada: 'xxxxxxxxxxx', concurso: 'xxxxxxxxxxx' };

  // Sin sesión.
  expect((await page.request.post('/_actions/guardarTextos', { multipart: textos, headers: origen })).status()).toBe(401);

  // Con un usuario de Compras: la acción da 403 y la página lo devuelve al listado.
  await ingresar(page);
  const alta = await page.request.post('/_actions/crearUsuario', {
    multipart: { nombre: 'Compras Prueba', email, rol: 'compras' },
    headers: origen,
  });
  expect(alta.ok()).toBe(true);
  const [, clave] = (await alta.json()) as [unknown, string];

  const otro = await browser.newContext();
  const p2 = await otro.newPage();
  await p2.goto('/panel/login');
  await p2.getByLabel('Email').fill(email);
  await p2.getByLabel('Contraseña').fill(clave);
  await p2.getByRole('button', { name: 'Ingresar' }).click();
  // La contraseña generada es provisoria: hasta cambiarla, el panel solo deja entrar a «Mi cuenta».
  await expect(p2).toHaveURL(/\/panel\/cuenta$/);
  expect((await p2.request.post('/_actions/guardarTextos', { multipart: textos, headers: origen })).status()).toBe(403);
  await p2.goto('/panel');
  await expect(p2).toHaveURL(/\/panel\/cuenta$/);
  await p2.getByLabel('Contraseña provisoria').fill(clave);
  await p2.getByLabel('Contraseña nueva').fill('una-clave-propia-123');
  await p2.getByLabel('Repetila').fill('una-clave-propia-123');
  await p2.getByRole('button', { name: 'Cambiar contraseña' }).click();
  await confirmar(p2);
  await expect(p2).toHaveURL(/\/panel$/);
  await expect(p2.getByRole('link', { name: 'Procedimientos' })).toBeVisible();
  await expect(p2.getByRole('link', { name: 'Configuración del sitio' })).toHaveCount(0);
  expect((await p2.request.post('/_actions/guardarTextos', { multipart: textos, headers: origen })).status()).toBe(403);
  expect((await p2.request.post('/panel/api/marca', { multipart: { clase: 'logo' }, headers: origen })).status()).toBe(403);
  await p2.goto('/panel/configuracion');
  await expect(p2).toHaveURL(/\/panel$/);
  await otro.close();
});
