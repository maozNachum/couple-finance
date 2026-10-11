import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createFixture } from '../integration/local-fixtures.mjs';
import { localSql, uuid } from '../../scripts/local-supabase.mjs';

test('Hebrew category rules, explicit preview, locking, retry and history', async ({ page }, testInfo) => {
  test.setTimeout(90_000); const fixture = await createFixture();
  try {
    const user = fixture.users[0]; if (!user) throw new Error('Missing fixture');
    await page.goto(`/auth/confirm#token_hash=${user.hash}&type=invite`);
    await page.getByRole('button', { name: 'אישור כניסה' }).click();
    await expect(page.getByRole('heading', { name: 'Synthetic household A' })).toBeVisible();
    await page.getByRole('link', { name: 'חשבונות', exact: true }).click();
    const account = page.getByRole('form', { name: 'חשבון חדש' });
    await account.getByLabel('שם החשבון').fill('Synthetic cash'); await account.getByLabel('סוג חשבון').selectOption('CASH');
    await account.getByRole('button', { name: 'יצירת חשבון' }).click(); await expect(page.getByRole('heading', { name: 'Synthetic cash', exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'תנועות ויתרות', exact: true }).click();
    const form = page.getByRole('form', { name: 'תנועה ידנית' });
    await form.getByLabel('סוג רישום').selectOption('OPENING'); await form.getByLabel('תאריך התנועה').fill('2026-10-01');
    await form.getByLabel('תיאור', { exact: true }).fill('Synthetic opening'); await form.getByLabel('סכום התנועה ב־ILS').fill('100'); await form.getByLabel('סכום חלוקה 1').fill('100');
    await form.getByRole('button', { name: 'שמירת תנועה' }).click(); await expect(page.getByText('יתרה מחושבת:')).toContainText('100.00 ILS');
    await form.getByLabel('תאריך התנועה').fill('2026-10-02'); await form.getByLabel('תיאור', { exact: true }).fill('SHOP מזון'); await form.getByLabel('סכום התנועה ב־ILS').fill('-10'); await form.getByLabel('סכום חלוקה 1').fill('-10'); await form.getByLabel('משמעות חלוקה 1').selectOption('EXPENSE');
    await form.getByRole('button', { name: 'שמירת תנועה' }).click(); await expect(page.getByText('יתרה מחושבת:')).toContainText('90.00 ILS');
    await page.getByRole('link', { name: 'סיווג והסבר SHOP מזון', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'קטגוריות וכללי סיווג', exact: true })).toBeVisible(); await expect(page.getByText('ללא התאמה', { exact: true })).toBeVisible();
    const category = page.getByRole('form', { name: 'עריכת קטגוריה' }); await category.getByLabel('שם קטגוריה').fill('מזון'); await category.getByRole('button', { name: 'שמירת קטגוריה' }).click(); await expect(page.getByRole('button', { name: 'עריכת קטגוריה מזון', exact: true })).toBeVisible();
    const rule = page.getByRole('form', { name: 'עריכת כלל' }); await rule.getByLabel('שם כלל').fill('קניות'); await rule.getByLabel('קטגוריית יעד').selectOption({ label: 'מזון' }); await rule.getByLabel('טקסט לחיפוש').fill('shop'); await rule.getByLabel('עדיפות').fill('10'); await rule.getByRole('button', { name: 'שמירת כלל' }).click();
    await expect(page.getByText('נמצאה התאמה', { exact: true })).toBeVisible();
    const count = () => localSql(`select count(*) from finance.transaction_revisions where household_id='${uuid(fixture.households[0])}';`);
    expect(count()).toBe('2'); await page.getByRole('button', { name: 'רענון סיווגים' }).click(); await expect(page.getByText('נמצאה התאמה', { exact: true })).toBeVisible(); expect(count()).toBe('2');
    let lost = false; await page.route('**/rest/v1/rpc/categorize_transaction', async (route) => { if (!lost) { lost = true; await route.fetch(); await route.abort('failed'); } else await route.continue(); });
    await page.getByRole('button', { name: 'החלת הכלל המוצע', exact: true }).click(); await expect(page.getByRole('button', { name: 'ניסיון חוזר לסיווג' })).toBeVisible(); await page.getByRole('button', { name: 'ניסיון חוזר לסיווג' }).click(); await expect(page.getByText('מקור: כלל', { exact: false })).toBeVisible(); expect(count()).toBe('3');
    await page.getByLabel('קטגוריה ידנית').selectOption({ label: 'מזון' }); await page.getByRole('button', { name: 'שיוך קטגוריה ונעילה' }).click(); await expect(page.getByText('נעול — הכלל לא יוחל', { exact: true })).toBeVisible(); await expect(page.getByRole('button', { name: 'החלת הכלל המוצע' })).toBeDisabled();
    await page.getByRole('button', { name: 'פתיחת נעילה בלבד' }).click(); await expect(page.getByText('נמצאה התאמה', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'עריכת קטגוריה מזון', exact: true }).click(); await category.getByLabel('שם קטגוריה').fill('מזון ומשקאות'); await category.getByRole('button', { name: 'שמירת קטגוריה' }).click(); await expect(page.getByRole('button', { name: 'עריכת קטגוריה מזון ומשקאות', exact: true })).toBeVisible();
    await expect(page.getByText('כלל · מזון · כלל קניות', { exact: false })).toBeVisible();
    await page.getByRole('button', { name: 'עריכת קטגוריה מזון ומשקאות', exact: true }).click(); await category.getByLabel('מצב קטגוריה').selectOption('ARCHIVED'); await category.getByRole('button', { name: 'שמירת קטגוריה' }).click(); await expect(page.getByText('ללא התאמה', { exact: true })).toBeVisible(); await expect(page.getByText('קטגוריה נוכחית:', { exact: false })).toContainText('(בארכיון)');
    expect(await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length }))).toEqual({ local: 0, session: 0 });
    expect(await page.locator('html').getAttribute('dir')).toBe('rtl');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.evaluate(() => window.scrollTo(0, 0)); await page.screenshot({ path: `.artifacts/task6-${testInfo.project.name}.png`, fullPage: true });
    await page.getByRole('link', { name: 'חזרה לתנועות' }).click(); await expect(page.getByText('יתרה מחושבת:')).toContainText('90.00 ILS');
    await page.getByRole('link', { name: 'ניהול קטגוריות וכללי סיווג' }).click(); await expect(page.getByRole('button', { name: 'רענון סיווגים' })).toBeVisible();
    localSql(`update finance.household_members set status='REVOKED' where household_id='${uuid(fixture.households[0])}';`);
    await page.getByRole('button', { name: 'רענון סיווגים' }).click(); await expect(page.getByText('אין משק בית זמין.', { exact: true })).toBeVisible(); await expect(page.getByText('מזון ומשקאות', { exact: true })).toHaveCount(0);
  } finally { await fixture.cleanup(); }
});
