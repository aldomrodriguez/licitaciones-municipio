import { expect, test } from './fixtures';
import { ADMIN, URL_BASE } from '../../playwright.config';

test('privada: las cantidades solo aceptan números, en un campo angosto', async ({ page }) => {
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

  for (const etiqueta of ['Cantidad de proveedores invitados', 'Cantidad de ofertas recibidas']) {
    const campo = page.getByLabel(etiqueta);
    await campo.pressSequentially('3e-,2a');
    await expect(campo).toHaveValue('32');
    expect((await campo.boundingBox())!.width).toBeLessThan(150);
  }
  // En borrador ya se puede pasar directo al resultado.
  await expect(page.getByRole('button', { name: 'Desierta' })).toBeVisible();
});
