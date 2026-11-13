import { expect, test } from './fixtures';
import { ADMIN } from '../../playwright.config';

test('al crear un usuario, la contraseña generada se copia con un botón', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/panel/login');
  await page.getByLabel('Email').fill(ADMIN.email);
  await page.getByLabel('Contraseña').fill(ADMIN.clave);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page.getByRole('heading', { name: 'Procedimientos', level: 1 })).toBeVisible();

  await page.goto('/panel/usuarios');
  await page.getByLabel('Nombre y apellido').fill('Persona Copiar');
  await page.getByLabel('Email').fill(`copiar${Date.now()}@ejemplo.org`);
  await page.getByRole('button', { name: 'Crear usuario' }).click();
  const dialogo = page.locator('#dlg-confirmar');
  await dialogo.getByRole('button', { name: 'Crear usuario' }).click();

  // Aviso con la contraseña: solo «Listo», sin «Cancelar».
  await expect(dialogo.getByRole('heading', { name: 'Contraseña generada' })).toBeVisible();
  await expect(dialogo.getByRole('button', { name: 'Cancelar' })).toBeHidden();
  const clave = (await page.locator('#dlg-copiar-texto').textContent())?.trim() ?? '';
  expect(clave.length).toBeGreaterThanOrEqual(10);

  const copiar = dialogo.getByRole('button', { name: 'Copiar' });
  await expect(copiar).toBeFocused();
  await copiar.click();
  await expect(dialogo.getByRole('button', { name: 'Copiada' })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(clave);

  await dialogo.getByRole('button', { name: 'Listo' }).click();
  await expect(page.getByText('Usuario creado.')).toBeVisible();
});
