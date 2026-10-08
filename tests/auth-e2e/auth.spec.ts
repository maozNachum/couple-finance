import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createFixture } from '../integration/local-fixtures.mjs';
import { localAdmin } from '../../scripts/local-supabase.mjs';

test('invited user authenticates, sees only own household, signs out and loses session', async ({ page }, testInfo) => {
  const fixture = await createFixture();
  try {
    await page.goto('/household');
    await expect(page.getByRole('alert')).toContainText('התחברו מחדש');
    const invited = fixture.users[0];
    if (!invited) throw new Error('Missing synthetic fixture');
    // Secret links stay in fragments, never request URLs, traces or screenshots.
    await page.goto(`/auth/confirm#token_hash=${invited.hash}&type=invite`);
    await expect(page).toHaveURL('http://127.0.0.1:4173/auth/confirm');
    await expect(page.getByRole('button', { name: 'אישור כניסה' })).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.getByRole('button', { name: 'אישור כניסה' }).click();
    await expect(page.getByRole('heading', { name: 'Synthetic household A' })).toBeVisible();
    await expect(page.getByText('Synthetic household B')).toHaveCount(0);
    await expect(page.getByText('חברים פעילים: 1')).toBeVisible();
    // Explicit synthetic-only visual artifact after the token has left the URL.
    await page.screenshot({ path: `.artifacts/task3-${testInfo.project.name}.png`, fullPage: true });
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length }))).toEqual({ local: 0, session: 0 });
    await page.reload();
    await expect(page.getByRole('alert')).toContainText('התחברו מחדש');
    const fresh = await localAdmin().auth.admin.generateLink({ type: 'magiclink', email: invited.email });
    if (fresh.error) throw new Error('Synthetic sign-in link unavailable');
    await page.goto(`/auth/confirm#token_hash=${fresh.data.properties.hashed_token}&type=email`);
    await page.getByRole('button', { name: 'אישור כניסה' }).click();
    await expect(page.getByRole('heading', { name: 'Synthetic household A' })).toBeVisible();
    await page.getByRole('button', { name: 'יציאה', exact: true }).click();
    await expect(page).toHaveURL(/\/sign-in$/);
    await page.goto('/household');
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.getByText('Synthetic household A')).toHaveCount(0);
    await page.goto(`/auth/confirm#token_hash=${invited.hash}&type=invite`);
    await page.getByRole('button', { name: 'אישור כניסה' }).click();
    await expect(page.getByRole('alert')).toContainText('הקישור אינו תקף');
  } finally { await fixture.cleanup(); }
});

test('network logout failure destroys browser session and reports unconfirmed server logout', async ({ page }) => {
  const fixture = await createFixture();
  try {
    const invited = fixture.users[0];
    if (!invited) throw new Error('Missing synthetic fixture');
    await page.goto(`/auth/confirm#token_hash=${invited.hash}&type=invite`);
    await page.getByRole('button', { name: 'אישור כניסה' }).click();
    await expect(page.getByRole('heading', { name: 'Synthetic household A' })).toBeVisible();
    await page.route('**/auth/v1/logout**', (route) => route.abort());
    await page.getByRole('button', { name: 'יציאה', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('היציאה מהשרת לא אושרה');
    await page.goto('/household');
    await expect(page.getByText('Synthetic household A')).toHaveCount(0);
    await expect(page.getByRole('alert')).toBeVisible();
  } finally { await fixture.cleanup(); }
});

test('invitation-only form and malformed link show safe accessible states', async ({ page }) => {
  await page.goto('/sign-in');
  await expect(page.getByRole('textbox', { name: 'כתובת דוא״ל' })).toBeVisible();
  await page.getByRole('textbox', { name: 'כתובת דוא״ל' }).fill('not-invited@example.test');
  await page.getByRole('button', { name: 'שליחת קישור כניסה' }).click();
  await expect(page.getByRole('status')).toContainText('אם הכתובת מוזמנת');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.goto('/auth/confirm#token_hash=invalid&type=signup');
  await expect(page.getByRole('alert')).toContainText('הקישור אינו תקף');
  await expect(page).toHaveURL('http://127.0.0.1:4173/auth/confirm');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
