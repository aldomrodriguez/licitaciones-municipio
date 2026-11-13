import { expect, test } from './fixtures';

test('las diferencias entre modalidades se ven en un modal que filtra el listado', async ({ page }) => {
  await page.goto('/');
  const abrir = page.getByRole('button', { name: '¿Qué diferencia hay entre las modalidades?' });
  const modal = page.getByRole('dialog', { name: 'Modalidades de contratación' });

  await abrir.click();
  await expect(modal).toBeVisible();
  await expect(modal.getByRole('heading', { name: 'Licitación Privada' })).toBeVisible();

  // Se cierra con Escape, con el fondo y con «Entendido».
  await page.keyboard.press('Escape');
  await expect(modal).toBeHidden();
  await abrir.click();
  await page.mouse.click(5, 5);
  await expect(modal).toBeHidden();
  await abrir.click();
  await modal.getByRole('button', { name: 'Entendido' }).click();
  await expect(modal).toBeHidden();
  await expect(abrir).toBeFocused();

  // Cada modalidad lleva a su listado filtrado.
  await abrir.click();
  await modal.getByRole('link', { name: 'Ver solo concursos de precios' }).click();
  await expect(page).toHaveURL(/tipo=concurso/);
});
