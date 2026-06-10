// SPDX-FileCopyrightText: 2026 Kevin Stenzel
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { test, expect, type Page } from '@playwright/test';
import { api, mockApi, seedAuth } from './mocks';

// Bewusst ohne Screenshot-Assertions (Flaky-Risiko) — nur DOM-Assertions.

async function gotoAuthenticated(page: Page, hash: string): Promise<void> {
  await seedAuth(page);
  await page.goto(`/${hash}`);
  await page.waitForSelector('.page-title', { state: 'visible' });
  await page.waitForLoadState('networkidle');
}

test.describe('CRUD-Roundtrips gegen stateful Mocks', () => {
  test('Connection anlegen -> erscheint in Liste -> loeschen -> verschwindet', async ({ page }) => {
    await mockApi(page);
    await gotoAuthenticated(page, '#/connections');

    // Anlegen
    await page.getByRole('button', { name: '+ Verbindung' }).click();
    const modal = page.getByRole('dialog');
    await modal.locator('#cfName').fill('e2e-conn');
    await modal.locator('#cfHost').fill('10.0.0.99');
    await modal.getByRole('button', { name: 'Speichern' }).click();
    await expect(modal).toBeHidden();
    await expect(page.locator('.toast-stack .toast.success')).toHaveText('Verbindung erstellt');

    // Erscheint in der Liste (kommt nach dem Modal-Close per frischem GET)
    const row = page.locator('tbody tr', { hasText: 'e2e-conn' });
    await expect(row).toBeVisible();

    // Loeschen (mit Bestaetigungs-Dialog)
    await row.getByRole('button', { name: 'Löschen' }).click();
    const confirm = page.getByRole('dialog');
    await expect(confirm).toContainText('Verbindung wirklich löschen?');
    await confirm.getByRole('button', { name: 'Löschen' }).click();

    // Verschwindet, Demo-Eintrag bleibt
    await expect(page.locator('tbody tr', { hasText: 'e2e-conn' })).toHaveCount(0);
    await expect(page.locator('tbody tr', { hasText: 'demo-ssh' })).toBeVisible();
  });

  test('Server anlegen -> erscheint in Liste', async ({ page }) => {
    await mockApi(page);
    await gotoAuthenticated(page, '#/servers');

    await page.getByRole('button', { name: '+ Server' }).click();
    const modal = page.getByRole('dialog');
    await modal.locator('#sfName').fill('e2e-srv');
    await modal.locator('#sfHostname').fill('10.0.0.42');
    await modal.getByRole('button', { name: 'Speichern' }).click();
    await expect(modal).toBeHidden();
    await expect(page.locator('.toast-stack .toast.success')).toHaveText('Server erstellt');

    await expect(page.locator('.server-card', { hasText: 'e2e-srv' })).toBeVisible();
    await expect(page.locator('.server-card', { hasText: 'demo-server' })).toBeVisible();
  });
});

test.describe('Fehler-Flows', () => {
  test('500 beim Anlegen einer Connection zeigt Fehler-Toast, Modal bleibt offen', async ({
    page,
  }) => {
    await mockApi(page);
    // Override NACH mockApi registriert -> gewinnt (LIFO); GET faellt per
    // fallback() an den stateful Handler durch.
    await page.route(api('connections'), async (route) => {
      if (route.request().method() === 'POST') {
        return route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ detail: 'Interner Serverfehler (E2E)' }),
        });
      }
      return route.fallback();
    });
    await gotoAuthenticated(page, '#/connections');

    await page.getByRole('button', { name: '+ Verbindung' }).click();
    const modal = page.getByRole('dialog');
    await modal.locator('#cfName').fill('kaputt');
    await modal.getByRole('button', { name: 'Speichern' }).click();

    const errorToast = page.locator('.toast-stack .toast.error');
    await expect(errorToast).toBeVisible();
    await expect(errorToast).toHaveText('Interner Serverfehler (E2E)');

    // Kein Eintrag entstanden, Modal bleibt offen
    await expect(modal).toBeVisible();
    await expect(page.locator('tbody tr', { hasText: 'kaputt' })).toHaveCount(0);
  });
});
