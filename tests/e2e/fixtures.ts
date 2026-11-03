import { expect, test as base } from '@playwright/test';

/**
 * `test` de los e2e: falla si el navegador bloquea algo por la Content-Security-Policy.
 * Sin este control, una página puede quedarse sin su JavaScript y los tests seguir pasando.
 */
export const test = base.extend<{ sinViolacionesCsp: undefined }>({
  sinViolacionesCsp: [
    async ({ page }, use) => {
      const violaciones: string[] = [];
      page.on('console', (m) => {
        if (m.type() === 'error' && /content security policy/i.test(m.text())) violaciones.push(m.text());
      });
      await use(undefined);
      expect(violaciones, 'violaciones de la Content-Security-Policy').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
