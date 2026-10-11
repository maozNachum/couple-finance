import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createFixture } from '../integration/local-fixtures.mjs';
import { localSql, uuid } from '../../scripts/local-supabase.mjs';
import { manualTransactionCommandSchema } from '../../supabase/functions/_shared/core/contracts/ledger.ts';
import type { ManualTransactionCommand } from '../../supabase/functions/_shared/core/contracts/ledger.ts';

test.use({ actionTimeout: 10_000 });

test('manual ledger, split meaning, correction, uncertain retry and revoked access', async ({ page }, testInfo) => {
  // This story includes multiple committed revisions and a deliberately lost HTTP response.
  test.setTimeout(90_000);
  const fixture = await createFixture();
  const commands: ManualTransactionCommand[] = [];
  page.on('request', (request) => {
    if (request.url().endsWith('/rest/v1/rpc/record_transaction')) commands.push(manualTransactionCommandSchema.parse(request.postDataJSON().payload));
  });
  try {
    const user = fixture.users[0]; if (!user) throw new Error('Missing synthetic fixture');
    await page.goto(`/auth/confirm#token_hash=${user.hash}&type=invite`);
    await page.getByRole('button', { name: 'אישור כניסה' }).click();
    await expect(page.getByRole('heading', { name: 'Synthetic household A' })).toBeVisible();
    await page.getByRole('link', { name: 'חשבונות', exact: true }).click();
    const account = page.getByRole('form', { name: 'חשבון חדש' });
    await account.getByLabel('שם החשבון').fill('Synthetic cash');
    await account.getByLabel('סוג חשבון').selectOption('CASH');
    await account.getByRole('button', { name: 'יצירת חשבון' }).click();
    await expect(page.getByRole('heading', { name: 'Synthetic cash', exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'תנועות ויתרות', exact: true }).click();
    await expect(page.getByText('יתרה לא ידועה — חסרה יתרת פתיחה פעילה.')).toBeVisible();
    const form = page.getByRole('form', { name: 'תנועה ידנית' });
    await form.getByLabel('סוג רישום').selectOption('OPENING');
    await form.getByLabel('תאריך התנועה').fill('2026-10-01');
    await form.getByLabel('תיאור', { exact: true }).fill('Synthetic opening');
    await form.getByLabel('סכום התנועה ב־ILS').fill('100');
    await form.getByLabel('סכום חלוקה 1').fill('100');
    await form.getByLabel('שלמות יתרת הפתיחה').selectOption('PARTIAL');
    await form.getByRole('button', { name: 'שמירת תנועה' }).click();
    await page.getByLabel('יתרה לתאריך').fill('2026-10-05');
    await expect(page.getByText('יתרה חלקית — חסרים נתונים:')).toContainText('100.00 ILS');
    await page.getByRole('button', { name: 'תיקון / ביטול Synthetic opening', exact: true }).click();
    await form.getByLabel('שלמות יתרת הפתיחה').selectOption('COMPLETE');
    await form.getByLabel('סיבת התיקון / הערה').fill('Synthetic coverage verified');
    await form.getByRole('button', { name: 'שמירת תנועה' }).click();
    await expect(page.getByText('יתרה מחושבת:')).toContainText('100.00 ILS');
    await page.getByLabel('יתרה לתאריך').fill('2026-09-30');
    await expect(page.getByText('יתרה לא ידועה — התאריך קודם ליתרת הפתיחה.')).toBeVisible();
    await page.getByLabel('יתרה לתאריך').fill('2026-10-05');
    await form.getByLabel('תאריך התנועה').fill('2026-10-02');
    await form.getByLabel('תיאור', { exact: true }).fill('Synthetic principal and interest');
    await form.getByLabel('סכום התנועה ב־ILS').fill('-11');
    await form.getByLabel('סכום חלוקה 1').fill('-10');
    await form.getByLabel('משמעות חלוקה 1').selectOption('DEBT_PRINCIPAL');
    await form.getByLabel('שיוך חלוקה 1').selectOption({ label: 'Synthetic A' });
    await form.getByRole('button', { name: 'הוספת חלוקה' }).click();
    await form.getByLabel('סכום חלוקה 2').fill('-2');
    await form.getByLabel('משמעות חלוקה 2').selectOption('EXPENSE');
    await form.getByRole('button', { name: 'שמירת תנועה' }).click();
    await expect(page.getByText('בדקו סכומים, תאריכים וחלוקות.', { exact: false })).toBeVisible();
    await form.getByLabel('סכום חלוקה 2').fill('-1');
    // The server commits, but the response is lost. UI retry must retain the exact command.
    let intercepted = false;
    await page.route('**/rest/v1/rpc/record_transaction', async (route) => {
      if (intercepted) { await route.continue(); return; }
      intercepted = true; const response = await route.fetch(); expect(response.ok()).toBe(true); await route.abort('failed');
    });
    await form.getByRole('button', { name: 'שמירת תנועה' }).click();
    await expect(page.getByText('לא ניתן לאשר אם הבקשה נשמרה.', { exact: false })).toBeVisible();
    await expect(form.getByLabel('סכום התנועה ב־ILS')).toBeDisabled();
    await page.getByRole('button', { name: 'ניסיון חוזר לאותה בקשה' }).click();
    await expect(page.getByText('יתרה מחושבת:')).toContainText('89.00 ILS');
    expect(localSql(`select count(*) from finance.transactions where household_id='${uuid(fixture.households[0]!)}';`)).toBe('2');
    await page.unroute('**/rest/v1/rpc/record_transaction');
    await expect(page.getByText('הוחלפה בתיקון', { exact: false })).toHaveCount(1);
    await page.getByRole('button', { name: 'תיקון / ביטול Synthetic principal and interest', exact: true }).click();
    await form.getByRole('combobox', { name: 'מצב', exact: true }).selectOption('VOIDED');
    await form.getByLabel('סיבת התיקון / הערה').fill('Synthetic void');
    await form.getByRole('button', { name: 'שמירת תנועה' }).click();
    await expect(page.getByText('יתרה מחושבת:')).toContainText('100.00 ILS');
    await expect(page.getByText('· בוטלה · גרסה 2', { exact: false })).toBeVisible();
    await form.getByLabel('תאריך התנועה').fill('2026-10-03');
    await form.getByLabel('תיאור', { exact: true }).fill('Synthetic pending transfer');
    await form.getByLabel('סכום התנועה ב־ILS').fill('-20');
    await form.getByLabel('סכום חלוקה 1').fill('-20');
    await form.getByLabel('משמעות חלוקה 1').selectOption('TRANSFER');
    await form.getByRole('combobox', { name: 'מצב', exact: true }).selectOption('PENDING');
    await form.getByRole('button', { name: 'שמירת תנועה' }).click();
    await expect(page.getByRole('heading', { name: 'Synthetic pending transfer' })).toBeVisible();
    await expect(page.getByText('יתרה מחושבת:')).toContainText('100.00 ILS');
    await page.getByRole('button', { name: 'תיקון / ביטול Synthetic pending transfer', exact: true }).click();
    await form.getByRole('combobox', { name: 'מצב', exact: true }).selectOption('POSTED');
    await form.getByLabel('סיבת התיקון / הערה').fill('Synthetic posted');
    await form.getByRole('button', { name: 'שמירת תנועה' }).click();
    await expect(page.getByText('יתרה מחושבת:')).toContainText('80.00 ILS');
    for (const effect of ['UNCLASSIFIED', 'INCOME']) {
      await form.getByLabel('תאריך התנועה').fill('2026-10-04');
      await form.getByLabel('תיאור', { exact: true }).fill(`Synthetic ${effect}`);
      await form.getByLabel('סכום התנועה ב־ILS').fill('0');
      await form.getByLabel('סכום חלוקה 1').fill('0');
      if (effect === 'INCOME') await form.getByLabel('משמעות חלוקה 1').selectOption(effect);
      await form.getByRole('button', { name: 'שמירת תנועה' }).click();
      await expect(page.getByRole('heading', { name: `Synthetic ${effect}`, exact: true })).toBeVisible();
    }
    expect(commands.flatMap((c) => c.transaction.allocations.map((a) => a.effect))).toEqual(expect.arrayContaining(['ADJUSTMENT', 'DEBT_PRINCIPAL', 'EXPENSE', 'TRANSFER', 'UNCLASSIFIED', 'INCOME']));
    for (const command of commands) {
      for (const allocation of command.transaction.allocations) {
        expect(allocation).not.toHaveProperty('categoryId');
        expect(allocation.categorization).toEqual({ origin: 'UNCLASSIFIED', userLocked: false });
      }
      const stored = JSON.parse(localSql(`select jsonb_agg(payload order by ordinal) from finance.transaction_allocations where revision_id='${uuid(command.revisionId)}';`));
      expect(stored).toEqual(command.transaction.allocations);
    }
    await expect(page.getByText('יתרה מחושבת:')).toContainText('80.00 ILS');
    expect(await page.evaluate(() => document.documentElement.dir)).toBe('rtl');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `.artifacts/task5-${testInfo.project.name}.png`, fullPage: true });
    expect(await page.evaluate(async () => ({ local: localStorage.length, session: sessionStorage.length, databases: (await indexedDB.databases()).length }))).toEqual({ local: 0, session: 0, databases: 0 });
    await page.getByRole('link', { name: 'חשבונות', exact: true }).click();
    await page.getByLabel('שווי נכון לתאריך').fill('2026-10-05');
    await expect(page.getByText('יתרה מחושבת:')).toContainText('80.00 ILS');
    await page.getByRole('button', { name: 'העברה לארכיון' }).click();
    await expect(page.getByText('בארכיון', { exact: false })).toBeVisible();
    await page.getByRole('link', { name: 'תנועות ויתרות', exact: true }).click();
    await page.getByLabel('יתרה לתאריך').fill('2026-10-05');
    await expect(page.getByText('יתרה מחושבת:')).toContainText('80.00 ILS');
    await expect(form).toHaveCount(0);
    localSql(`update finance.household_members set status='REVOKED' where household_id='${uuid(fixture.households[0]!)}';`);
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(page.getByText('אין חשבונות זמינים.', { exact: false })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Synthetic opening' })).toHaveCount(0);
  } finally { await fixture.cleanup(); }
});
