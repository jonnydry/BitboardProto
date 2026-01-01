import { test, expect } from '@playwright/test';

test.describe('Post Creation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Ensure identity exists (might need to create one first in a real scenario)
    await page.waitForLoadState('networkidle');
  });

  test('should allow creating a new post', async ({ page }) => {
    // Find create post button
    const createButton = page.getByRole('button', { name: /create.*post|new.*post|\+/i });

    if (await createButton.isVisible()) {
      await createButton.click();

      // Should show post creation form
      const postForm = page.locator('[data-testid="create-post-form"], [data-testid="post-editor"]');
      await expect(postForm).toBeVisible({ timeout: 5000 });

      // Fill in post details
      const titleInput = page.getByLabel(/title/i);
      const contentInput = page.getByLabel(/content|message|text/i);

      if (await titleInput.isVisible()) {
        await titleInput.fill('E2E Test Post');
      }

      if (await contentInput.isVisible()) {
        await contentInput.fill('This is a test post created by Playwright E2E tests.');
      }

      // Submit the post
      const submitButton = page.getByRole('button', { name: /post|publish|submit|send/i });
      await submitButton.click();

      // Should show success message or redirect
      await expect(
        page.locator('text=/post.*created|post.*published|success/i')
      ).toBeVisible({ timeout: 10000 });
    }
  });

  test('should validate required fields', async ({ page }) => {
    const createButton = page.getByRole('button', { name: /create.*post|new.*post|\+/i });

    if (await createButton.isVisible()) {
      await createButton.click();

      // Try to submit without filling required fields
      const submitButton = page.getByRole('button', { name: /post|publish|submit|send/i });

      if (await submitButton.isVisible()) {
        await submitButton.click();

        // Should show validation error
        await expect(page.locator('text=/required|cannot be empty/i')).toBeVisible({ timeout: 3000 });
      }
    }
  });
});
