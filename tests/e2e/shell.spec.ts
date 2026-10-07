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
  await page.getByRole('link', { name: 'על המרחב' }).click();
  await expect(page).toHaveURL(/\/about$/);
  await expect(page.getByRole('link', { name: 'על המרחב' })).toHaveAttribute('aria-current', 'page');
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
