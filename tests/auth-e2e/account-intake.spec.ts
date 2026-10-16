import { test, expect, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import { budgetFixture } from '../integration/budget-fixture.mjs';
import { localAdmin, localSql, uuid } from '../../scripts/local-supabase.mjs';
import { navigateTo } from '../navigation';
import { observationsSchema } from '@finance/contracts/valuation';

// Client-side routing preserves the intentionally memory-only authenticated session.
async function routeTo(page: Page, url: string) {
  await page.evaluate(url => { history.pushState({}, '', url); dispatchEvent(new PopStateEvent('popstate')); }, url);
}

test('account evidence intake improves known data while outside coverage stays unknown', async ({ page }, info) => {
  test.setTimeout(120000);
  const f = await budgetFixture();
  try {
    const household = uuid(f.households[0]);
    localSql(`insert into finance.household_members(household_id,user_id,display_name) values ('${household}','${uuid(f.users[1]!.id)}','Synthetic partner');`);
    const partner = localSql(`select id from finance.household_members where household_id='${household}' and user_id='${uuid(f.users[1]!.id)}';`);
    const bank = await f.account();
    const cash = await f.account('CASH');
    const card = await f.account('CREDIT_CARD'); await f.opening(card, '-300');
    const foreign = await f.account('BANK', 'ILS', f.b, f.households[1]);
    const savings = { account: { id: randomUUID(), householdId: household, name: 'Synthetic partner savings', ownership: { kind: 'MEMBER', memberId: partner }, type: 'SAVINGS', currency: 'USD', valuationCurrency: 'ILS', balancePolicy: 'OBSERVED', status: 'ACTIVE' }, version: 1, manualSourceId: randomUUID() };
    expect((await f.rpc(f.a, 'create_account', savings)).ok).toBe(true);
    const login = await localAdmin().auth.admin.generateLink({ type: 'magiclink', email: f.users[0]!.email });
    await page.goto(`/auth/confirm#token_hash=${login.data.properties!.hashed_token}&type=email`);
    await page.getByRole('button', { name: 'אישור כניסה' }).click();
    await expect(page.getByRole('heading', { name: 'Synthetic household A' })).toBeVisible();
    await navigateTo(page, 'חשבונות');
    const inventory = page.getByRole('region', { name: 'מלאי החשבונות והכיסוי' });
    await expect(inventory).toContainText('4 חשבונות רשומים בבית');
    await expect(inventory).toContainText('כיסוי חיצוני לא ידוע');
    await expect(page.getByRole('heading', { name: savings.account.name, exact: true })).toBeVisible();
    const savingsCard = page.locator(`#account-${savings.account.id}`);
    await expect(savingsCard).toContainText('Synthetic partner');
    await expect(savingsCard).toContainText('אין תצפית שווי');
    const bankCard = page.locator(`#account-${bank.account.id}`);
    await expect(bankCard).toContainText('אין יתרת פתיחה פעילה');
    await expect(page.locator(`#account-${card.account.id}`)).toContainText('-300.00 ILS');
    await expect(page.locator(`#account-${foreign.account.id}`)).toHaveCount(0);
    for (const width of [320, 375, 390, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: info.outputPath(`intake-missing-${width}.png`), fullPage: true });
    }
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.setViewportSize({ width: info.project.name === 'mobile-auth' ? 390 : 1280, height: 844 });
    await page.getByLabel('מיקוד בחשבון').selectOption(bank.account.id);
    await bankCard.getByRole('link', { name: 'לרישום תנועות ויתרת פתיחה' }).click();
    await expect(page.locator('.accounts-toolbar select')).toHaveValue(bank.account.id);
    const form = page.getByRole('form', { name: 'תנועה ידנית' });
    await form.getByLabel('סוג רישום').selectOption('OPENING');
    await form.getByLabel('תאריך התנועה').fill('2026-10-01');
    await form.getByLabel('תיאור', { exact: true }).fill('Synthetic confirmed opening');
    await form.getByLabel('סכום התנועה ב־ILS').fill('1000');
    await form.getByLabel('סכום חלוקה 1').fill('1000');
    await form.getByRole('button', { name: 'שמירת תנועה' }).click();
    await expect(page.getByText('יתרה מחושבת:', { exact: false })).toContainText('1000.00 ILS');

    await navigateTo(page, 'חשבונות');
    await page.getByLabel('מיקוד בחשבון').selectOption(savings.account.id);
    const observation = savingsCard.getByRole('form', { name: 'תצפית שווי' });
    await observation.getByLabel('תאריך התצפית', { exact: true }).fill('2026-10-03');
    await observation.getByLabel('סכום ב־USD').fill('250.75');
    await observation.getByLabel('כיסוי השווי').selectOption('PARTIAL');
    await observation.getByRole('button', { name: 'שמירת תצפית' }).click();
    await expect(savingsCard).toContainText('250.75 USD');
    await expect(savingsCard).toContainText('שווי חלקי — חסרים רכיבים');
    await expect(savingsCard).toContainText('חסר שער חליפין');
    await page.getByLabel('מיקוד בחשבון').selectOption(bank.account.id);
    await bankCard.getByRole('link', { name: 'ייבוא CSV לחשבון זה' }).click();
    await expect(page.getByLabel('משק בית לקובץ')).toHaveValue(household);
    await expect(page.getByLabel('חשבון קיים')).toHaveValue(bank.account.id);
    await expect(page.getByLabel('מקור קיים')).toHaveValue(bank.manualSourceId);
    await page.getByLabel('מפריד עמודות').selectOption(',');
    await page.getByLabel('קובץ CSV', { exact: true }).setInputFiles({ name: 'synthetic-intake.csv', mimeType: 'text/csv', buffer: Buffer.from('date,description,amount\n2026-10-04,Synthetic separate expense,-10\n2026-10-04,Synthetic separate expense,-10\n2026-02-31,Synthetic invalid,-1') });
    await page.getByRole('button', { name: 'העלאה פרטית והכנת מיפוי' }).click();
    const mapping = page.getByRole('form', { name: 'מיפוי עמודות' });
    await mapping.getByLabel('תאריך תנועה', { exact: true }).selectOption('0');
    await mapping.getByLabel('תיאור', { exact: true }).selectOption('1');
    await mapping.getByLabel('סכום חתום').selectOption('2');
    await mapping.getByLabel('פורמט תאריך').selectOption('YYYY-MM-DD');
    await mapping.getByLabel('מפריד עשרוני').selectOption('.');
    await mapping.getByLabel('מפריד אלפים').selectOption('NONE');
    await mapping.getByLabel('משמעות הסימן').selectOption('POSITIVE_INCREASES');
    await mapping.getByLabel('מטבע קבוע').selectOption('ILS');
    await mapping.getByRole('button', { name: 'יצירת תצוגה מקדימה' }).click();
    await page.getByRole('button', { name: 'סקירת כפילויות ובחירת שורות ליבוא' }).click();
    const review = page.getByRole('region', { name: 'סקירה ושמירת יבוא' });
    await expect(review.getByLabel('לכלול רשומה 4')).toBeDisabled();
    for (const row of [2, 3]) {
      await review.getByLabel(`לכלול רשומה ${row}`).check();
      await expect(review.getByRole('button', { name: 'בדיקת סיכום לפני שמירה' })).toBeDisabled();
      await review.getByLabel(`בדקתי את האזהרה ברשומה ${row}; זו תנועה נפרדת שיש לשמור`).check();
      await review.getByLabel(`משמעות רשומה ${row}`).selectOption('EXPENSE');
    }
    const commands: unknown[] = [];
    await page.route('**/functions/v1/import-commit', async route => {
      if (route.request().postDataJSON().action !== 'COMMIT') { await route.continue(); return; }
      commands.push(route.request().postDataJSON());
      if (commands.length === 1) { await route.fetch(); await route.abort('failed'); } else await route.continue();
    });
    await review.getByRole('button', { name: 'בדיקת סיכום לפני שמירה' }).click();
    await review.getByRole('button', { name: 'אישור ושמירת יבוא' }).click();
    const retry = review.getByRole('button', { name: 'בדיקת תוצאה וניסיון חוזר של אותה בקשה' });
    await expect(retry).toBeEnabled();
    await expect(review.getByRole('heading', { name: 'היבוא נשמר ואושר בשרת' })).toHaveCount(0);
    await retry.click();
    await expect(review.getByRole('heading', { name: 'היבוא נשמר ואושר בשרת' })).toBeVisible();
    expect(commands).toHaveLength(2); expect(commands[1]).toEqual(commands[0]);
    await expect(review).toContainText('שגויות 1');
    await page.screenshot({ path: info.outputPath('intake-import-receipt.png'), fullPage: true });
    await review.getByRole('link', { name: 'צפייה בתנועות שנשמרו' }).click();
    await expect(page.locator('.accounts-toolbar select')).toHaveValue(bank.account.id);
    await expect(page.getByText('יתרה מחושבת:', { exact: false })).toContainText('980.00 ILS');
    const snapshot = await f.rpc(f.a, 'transaction_snapshot');
    const bankHistory = snapshot.history.filter((r: { transaction: { accountId: string } }) => r.transaction.accountId === bank.account.id);
    expect(bankHistory).toHaveLength(3);
    for (const row of bankHistory.filter((r: { entryKind: string }) => r.entryKind === 'MOVEMENT')) {
      expect(row.version).toBe(1); expect(row.transaction.money).toEqual({ amount: '-10', currency: 'ILS' });
      expect(row.transaction.provenance[0].source.kind).toBe('FILE_IMPORT');
      expect(row.transaction.allocations[0].ownership).toEqual({ kind: 'HOUSEHOLD' });
      expect(row.transaction.allocations[0].effect).toBe('EXPENSE');
    }
    expect(observationsSchema.parse(snapshot.observations).find(o => o.accountId === savings.account.id)).toMatchObject({ money: { amount: '250.75', currency: 'USD' }, coverage: 'PARTIAL', fx: null });
    expect((await f.rpc(f.b, 'transaction_snapshot')).history.some((r: { revisionId: string }) => r.revisionId === bankHistory[0].revisionId)).toBe(true);
    await navigateTo(page, 'איכות המידע');
    await expect(page.getByRole('heading', { name: `ראיות יתרה — ${cash.account.name}` })).toBeVisible();
    await expect(page.getByRole('heading', { name: `ראיות יתרה — ${bank.account.name}` })).toHaveCount(0);
    await expect(page.getByText('שלמות החישוב מתייחסת לרשומות הידועות בלבד.', { exact: false })).toBeVisible();
    await navigateTo(page, 'תמונת מצב');
    await expect(page.getByRole('heading', { name: 'סכום שווי זמין — אינו שווי מאושר' })).toBeVisible();
    await navigateTo(page, 'חשבונות');
    await page.getByLabel('מיקוד בחשבון').selectOption(bank.account.id);
    await expect(bankCard).toContainText('980.00 ILS');
    await expect(inventory).toContainText('כיסוי חיצוני לא ידוע');
    await page.screenshot({ path: info.outputPath('intake-improved-bank.png'), fullPage: true });
    // Foreign or mismatched hints must never fall back to a writable default account.
    await routeTo(page, `/transactions?household=${household}&account=${foreign.account.id}`);
    await expect(page.getByText(/הקשר מבוקש שאינו זמין/)).toBeVisible();
    await expect(page.getByRole('form', { name: 'תנועה ידנית' })).toHaveCount(0);
    await routeTo(page, `/imports?household=${household}&account=${foreign.account.id}`);
    await expect(page.getByText(/הקשר היבוא המבוקש אינו זמין/)).toBeVisible();
    await expect(page.getByLabel('חשבון קיים')).toHaveValue('');
    expect(await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length }))).toEqual({ local: 0, session: 0 });
  } finally { await f.cleanup(); }
});
