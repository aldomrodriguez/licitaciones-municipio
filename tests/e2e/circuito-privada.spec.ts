import { expect, test } from './fixtures';
import type { Page } from '@playwright/test';
import { ADMIN, URL_BASE } from '../../playwright.config';

async function confirmar(page: Page) {
  await expect(page.locator('#dlg-confirmar')).toBeVisible();
  await page.locator('#dlg-ok').click();
}

test('privada: se carga en borrador con invitados y ofertas, y se publica directo con el resultado', async ({ page }) => {
  await page.goto('/panel/login');
  await page.getByLabel('Email').fill(ADMIN.email);
  await page.getByLabel('Contraseña').fill(ADMIN.clave);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page.getByRole('heading', { name: 'Procedimientos', level: 1 })).toBeVisible();

  const numero = 800 + Math.floor(Math.random() * 99);
  const alta = await page.request.post('/_actions/crearProcedimiento', {
    multipart: { tipo: 'privada', numero: String(numero), anio: '2026', objeto: 'Privada cargada al final' },
    headers: { Origin: URL_BASE },
  });
  const filas = (await alta.json()) as [{ id: number }, ...number[]];
  await page.goto(`/panel/procedimientos/${filas[filas[0].id]}`);

  // Las ofertas recibidas: campo angosto que solo acepta dígitos.
  const ofertas = page.getByLabel('Cantidad de ofertas recibidas');
  await ofertas.pressSequentially('3e-,2a');
  await expect(ofertas).toHaveValue('32');
  expect((await ofertas.boundingBox())!.width).toBeLessThan(150);

  // Sin «En trámite»: el resultado, pero recién con 5 invitados.
  const estado = page.getByRole('region', { name: 'Estado actual' });
  await expect(estado.getByRole('button', { name: 'En trámite de adjudicación' })).toHaveCount(0);
  await expect(estado).toContainText('al menos 5 proveedores invitados');

  // El CUIT es opcional; si se carga, se valida.
  const invitados = page.getByRole('region', { name: 'Proveedores invitados' });
  await page.locator('#inv-proveedor').fill('Con CUIT S.A.');
  await page.locator('#inv-cuit').fill('30712345671');
  await invitados.getByRole('button', { name: 'Agregar', exact: true }).click();
  await confirmar(page);
  await expect(invitados).toContainText('30-71234567-1');
  for (const n of [2, 3, 4, 5]) {
    await page.locator('#inv-proveedor').fill(`Invitado ${n}`);
    await invitados.getByRole('button', { name: 'Agregar', exact: true }).click();
    await confirmar(page);
    await expect(invitados).toContainText(`Invitado ${n}`);
  }
  await expect(invitados).toContainText('5 invitados · mínimo 5');
  await expect(estado).not.toContainText('al menos 5 proveedores invitados');
  await expect(estado.getByRole('button', { name: 'Desierta' })).toBeEnabled();
});
