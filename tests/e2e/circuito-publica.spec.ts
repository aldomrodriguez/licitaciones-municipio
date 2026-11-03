import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { ADMIN } from '../../playwright.config';

/** AAAA-MM-DD en hora de Lobos (UTC-3), `dias` desde hoy. */
function diaLobos(dias = 0): string {
  return new Date(Date.now() - 3 * 3600_000 + dias * 86400_000).toISOString().slice(0, 10);
}

async function ingresar(page: Page) {
  await page.goto('/panel/login');
  await page.getByLabel('Email').fill(ADMIN.email);
  await page.getByLabel('Contraseña').fill(ADMIN.clave);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page.getByRole('heading', { name: 'Procedimientos', level: 1 })).toBeVisible();
}

/** Acepta el diálogo propio de confirmación (opcionalmente con motivo). */
async function confirmar(page: Page, opciones: { motivo?: string } = {}) {
  const dialogo = page.locator('#dlg-confirmar');
  await expect(dialogo).toBeVisible();
  if (opciones.motivo) await dialogo.locator('#dlg-motivo-texto').fill(opciones.motivo);
  await dialogo.locator('#dlg-ok').click();
}

/** Elige un día con el calendario propio (el input real está oculto). */
async function elegirFecha(page: Page, iso: string) {
  await page.locator('#fechaApertura').locator('xpath=..').getByRole('button', { expanded: false }).first().click();
  const calendario = page.getByRole('dialog', { name: /elegir fecha de apertura/i });
  await expect(calendario).toBeVisible();
  for (let i = 0; i < 3 && !(await calendario.locator(`[data-dia="${iso}"]`).isVisible()); i++) {
    await calendario.getByRole('button', { name: 'Mes siguiente' }).click();
  }
  await calendario.locator(`[data-dia="${iso}"]`).click();
  await expect(page.locator('#fechaApertura')).toHaveValue(iso);
}

async function cambiarEstado(page: Page, destino: string, motivo?: string) {
  await page.getByRole('region', { name: 'Estado actual' }).getByRole('button', { name: destino }).click();
  await confirmar(page, { motivo });
  await expect(page.getByRole('region', { name: 'Estado actual' })).toContainText(destino);
}

async function agregarAdjudicatario(page: Page, proveedor: string, cuit: string, monto: string) {
  const plegable = page.locator('details', { has: page.locator('#adj-proveedor') });
  if (!(await plegable.evaluate((d: HTMLDetailsElement) => d.open))) await plegable.locator('summary').click();
  await page.locator('#adj-proveedor').fill(proveedor);
  await page.locator('#adj-cuit').fill(cuit);
  await page.locator('#adj-monto').fill(monto);
  await page.getByRole('button', { name: 'Agregar', exact: true }).click();
  await confirmar(page);
  await expect(page.getByRole('region', { name: /adjudicatarios/i })).toContainText(proveedor);
}

test('licitación pública: borrador → llamado → prórroga → evaluación → adjudicada', async ({ page }) => {
  const anio = Number(diaLobos().slice(0, 4));
  const objeto = `Adquisición de luminarias LED para prueba E2E ${Date.now()}`;
  const urlPublica = `/publica/${anio}/1`;

  await ingresar(page);

  // 1. Crear como borrador.
  await page.locator('aside').getByRole('link', { name: 'Nuevo procedimiento' }).click();
  await page.locator('#objeto').fill(objeto);
  await page.locator('#presupuestoOficial').fill('2000000');
  await page.locator('#valorPliego').fill('5000');
  await page.locator('#lugarApertura').fill('Oficina de Compras, Salgado 40');
  await elegirFecha(page, diaLobos(7));
  await page.getByRole('button', { name: 'Crear borrador' }).click();
  await confirmar(page);
  await page.waitForURL(/\/panel\/procedimientos\/\d+$/);
  const urlPanel = page.url();

  // Un borrador no existe para el público.
  expect((await page.request.get(urlPublica)).status()).toBe(404);

  // 2. En borrador no se pueden cargar adjudicatarios.
  await expect(page.locator('#adj-proveedor')).toHaveCount(0);

  // 3. Subir dos documentos (el pliego y una circular) en una sola tanda.
  await page.locator('[data-subida] [data-input]').setInputFiles(['tests/fixtures/Pliego_LP7-2026.pdf', 'tests/fixtures/circular-aclaratoria-1.pdf']);
  await page.locator('[data-subir]').click();
  await expect(page.locator('#dlg-lista li')).toHaveCount(2);
  await confirmar(page);
  const documentos = page.getByRole('region', { name: /documentaci/i });
  await expect(documentos).toContainText('Pliego LP7 2026');
  await expect(documentos).toContainText('Circular aclaratoria 1');

  // Un archivo que no es PDF aunque se llame .pdf se rechaza.
  await page.locator('[data-subida] [data-input]').setInputFiles('tests/fixtures/falso.pdf');
  await page.locator('[data-subir]').click();
  await confirmar(page);
  await expect(page.locator('#dlg-error')).toBeVisible();
  await page.locator('#dlg-confirmar [data-cancelar]').click();
  await page.goto(urlPanel);

  // 4. Abrir el llamado: aparece en la portada.
  await cambiarEstado(page, 'Llamado abierto');
  await page.goto('/');
  await expect(page.getByRole('region', { name: 'Llamados abiertos' })).toContainText(objeto);

  // Los documentos públicos se descargan.
  await page.goto(urlPublica);
  const enlace = page.getByRole('link', { name: /Pliego LP7 2026/ }).first();
  const descarga = await page.request.get((await enlace.getAttribute('href'))!);
  expect(descarga.status()).toBe(200);
  expect(descarga.headers()['content-type']).toContain('application/pdf');

  // 5. Prórroga: mover la fecha con el llamado abierto queda en la línea de tiempo pública.
  await page.goto(urlPanel);
  await elegirFecha(page, diaLobos(14));
  await page.getByRole('button', { name: 'Guardar cambios' }).first().click();
  await expect(page.locator('#dlg-lista')).toContainText(/fecha de apertura/i);
  await confirmar(page);
  await expect(page.getByRole('region', { name: /historial/i })).toContainText(/prorrog/i);
  await page.goto(urlPublica);
  await expect(page.locator('main')).toContainText(/prorrog/i);

  // 6. Evaluación y dos adjudicatarios; el total se calcula.
  await page.goto(urlPanel);
  await cambiarEstado(page, 'En evaluación');
  await agregarAdjudicatario(page, 'Luminotecnia Lobos SRL', '20123456786', '1500000,50');
  await agregarAdjudicatario(page, 'Eléctrica del Salado SA', '30712345671', '250000');

  // Antes de adjudicar, los adjudicatarios no se publican.
  await page.goto(urlPublica);
  await expect(page.locator('main')).not.toContainText('Luminotecnia Lobos SRL');

  // 7. Adjudicar: se publican con el total.
  await page.goto(urlPanel);
  await cambiarEstado(page, 'Adjudicada');
  await page.goto(urlPublica);
  const main = page.locator('main');
  await expect(main).toContainText('Luminotecnia Lobos SRL');
  await expect(main).toContainText('Eléctrica del Salado SA');
  await expect(main).toContainText('1.750.000,50');
});
