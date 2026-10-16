import { navigateTo } from '../navigation';
import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('RTL shell, navigation, focus, responsive layout, and direct routes', async ({ page }, testInfo) => {
  const errors: string[] = [];
  const externalRequests: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => { if (!request.url().startsWith('http://127.0.0.1:4173/')) externalRequests.push(request.url()); });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('html')).toHaveAttribute('lang', 'he-IL');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('טוב להיות באותו עמוד.');
  await expect(page.getByText(/אין חשבונות מחוברים/)).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('home.png'), fullPage: true });
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'דילוג לתוכן הראשי' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('main')).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await navigateTo(page, 'על המרחב');
  await expect(page).toHaveURL(/\/about$/);
  await expect(page.locator('#secondary-nav a[href="/about"]')).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('main')).toBeFocused();
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('הבית הפיננסי שלנו.');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.goto('/missing');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('העמוד הזה לא נמצא.');
  expect(errors).toEqual([]);
  expect(externalRequests).toEqual([]);
});

test('narrow mobile layout does not overflow', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(page.getByRole('navigation', { name: 'ניווט ראשי' })).toBeVisible();
});

test('compact mobile menu supports keyboard, active route, dismissal and desktop resizing', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/');
  const toggle = page.getByRole('button', { name: /עוד פעולות|סגירת תפריט/ });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('link', { name: 'על המרחב', exact: true })).toBeHidden();
  expect(await page.locator('.sidebar').evaluate(e => e.getBoundingClientRect().height)).toBeLessThan(250);
  await toggle.focus(); await page.keyboard.press('Enter');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'התחייבויות', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(toggle).toBeFocused();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  if (testInfo.project.name === 'mobile-chromium') {
    await toggle.tap();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await toggle.tap();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  }
  await navigateTo(page, 'על המרחב');
  await expect(page.getByRole('main')).toBeFocused();
  await expect(page.getByRole('button', { name: /עוד פעולות/ })).toContainText('על המרחב');
  await expect(page.locator('#secondary-nav')).toBeHidden();
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(page.getByRole('link', { name: 'על המרחב', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('link', { name: 'התחייבויות', exact: true })).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
