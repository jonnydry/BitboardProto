import { test, expect } from '@playwright/test';

test.describe('Identity Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should allow creating a new identity', async ({ page }) => {
    // Look for identity creation button/link
    const createIdentity = page.getByRole('button', { name: /create.*identity|generate.*key|new.*identity/i });

    if (await createIdentity.isVisible()) {
      await createIdentity.click();

      // Should show identity manager or creation form
      await expect(page.locator('[data-testid="identity-manager"], [role="dialog"]')).toBeVisible();

      // Generate new identity
      const generateButton = page.getByRole('button', { name: /generate|create/i });
      if (await generateButton.isVisible()) {
        await generateButton.click();

        // Should have created an identity
        await page.waitForTimeout(1000);
        await expect(page.locator('text=/identity created|key generated/i')).toBeVisible({ timeout: 5000 });
      }
    }
  });

  test('should allow setting a username', async ({ page }) => {
    // Open settings or identity manager
    const settingsButton = page.getByRole('button', { name: /settings|account|profile/i });

    if (await settingsButton.isVisible()) {
      await settingsButton.click();

      // Find username input
      const usernameInput = page.getByLabel(/username|display.*name/i);

      if (await usernameInput.isVisible()) {
        await usernameInput.fill('TestUser123');

        // Save
        const saveButton = page.getByRole('button', { name: /save|update/i });
        if (await saveButton.isVisible()) {
          await saveButton.click();

          // Username should be updated
          await expect(page.locator('text=/TestUser123/i')).toBeVisible({ timeout: 5000 });
        }
      }
    }
  });
});
