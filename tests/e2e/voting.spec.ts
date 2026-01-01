import { test, expect } from '@playwright/test';

test.describe('Voting System', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should allow voting on posts', async ({ page }) => {
    // Wait for posts to load
    const firstPost = page.locator('[data-testid="post-item"]').first();

    if (await firstPost.isVisible({ timeout: 5000 })) {
      // Find upvote button
      const upvoteButton = firstPost.getByRole('button', { name: /upvote|▲|\+/i });

      if (await upvoteButton.isVisible()) {
        // Click upvote
        await upvoteButton.click();

        // Should update vote count or show feedback
        await page.waitForTimeout(1000);

        // Verify vote was registered (button might change appearance)
        await expect(upvoteButton).toHaveAttribute('aria-pressed', 'true');
      }
    }
  });

  test('should allow changing vote', async ({ page }) => {
    const firstPost = page.locator('[data-testid="post-item"]').first();

    if (await firstPost.isVisible({ timeout: 5000 })) {
      const upvoteButton = firstPost.getByRole('button', { name: /upvote|▲|\+/i });
      const downvoteButton = firstPost.getByRole('button', { name: /downvote|▼|-/i });

      if (await upvoteButton.isVisible() && await downvoteButton.isVisible()) {
        // First upvote
        await upvoteButton.click();
        await page.waitForTimeout(500);

        // Then downvote (should change vote)
        await downvoteButton.click();
        await page.waitForTimeout(500);

        // Downvote should be active
        await expect(downvoteButton).toHaveAttribute('aria-pressed', 'true');
        await expect(upvoteButton).not.toHaveAttribute('aria-pressed', 'true');
      }
    }
  });
});
