import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('Accessibility Tests', () => {
  test('should not have any automatically detectable accessibility issues on homepage', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test('should support keyboard navigation', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Tab through interactive elements
    await page.keyboard.press('Tab');

    // Should have visible focus indicator
    const focused = await page.evaluateHandle(() => document.activeElement);
    await expect(focused).not.toBeNull();

    // Check that focus is visible (not display: none or visibility: hidden)
    const isVisible = await page.evaluate((el) => {
      const element = el as Element;
      const style = window.getComputedStyle(element);
      return style.display !== 'none' && style.visibility !== 'hidden';
    }, focused);

    expect(isVisible).toBe(true);
  });

  test('should have proper heading hierarchy', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Check for h1
    const h1 = await page.locator('h1').count();
    expect(h1).toBeGreaterThan(0);
    expect(h1).toBeLessThanOrEqual(1); // Should have at most one h1

    // Verify heading hierarchy (no skipped levels)
    const headings = await page.locator('h1, h2, h3, h4, h5, h6').all();
    const levels = await Promise.all(
      headings.map(async (h) => {
        const tagName = await h.evaluate((el) => el.tagName);
        return parseInt(tagName.replace('H', ''));
      })
    );

    // Check for skipped levels
    for (let i = 1; i < levels.length; i++) {
      const diff = levels[i] - levels[i - 1];
      expect(diff).toBeLessThanOrEqual(1); // Should not skip heading levels
    }
  });

  test('should have alt text for images', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const images = await page.locator('img').all();

    for (const img of images) {
      const alt = await img.getAttribute('alt');
      // Images should have alt attribute (can be empty for decorative images)
      expect(alt).not.toBeNull();
    }
  });

  test('should have proper ARIA labels for interactive elements', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Buttons without text should have aria-label
    const buttons = await page.locator('button').all();

    for (const button of buttons) {
      const text = await button.textContent();
      const ariaLabel = await button.getAttribute('aria-label');
      const ariaLabelledby = await button.getAttribute('aria-labelledby');

      // Button should have either text content, aria-label, or aria-labelledby
      expect(
        (text && text.trim() !== '') || ariaLabel || ariaLabelledby
      ).toBeTruthy();
    }
  });
});
