import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { budgetFixture } from '../integration/budget-fixture.mjs';
import { localAdmin, localSql, uuid } from '../../scripts/local-supabase.mjs';
import { navigateTo } from '../navigation';

test.use({ actionTimeout: 10000 });

test('daily mobile overview, readable incomplete evidence and complete paged history', async ({ page }, info) => {
  test.setTimeout(120000);
  const f = await budgetFixture();
  try {
    const account = await f.account(); await f.opening(account);
    await f.account('SAVINGS'); // Deliberately unknown balance, never visually promoted to complete.
    for (let i = 0; i < 24; i++) await f.save(account, '-1', 'EXPENSE', null, { description: `Synthetic expense ${i}` });
    expect((await f.rpc(f.a, 'save_budget', f.command())).ok).toBe(true);
    const link = await localAdmin().auth.admin.generateLink({ type: 'magiclink', email: f.users[0]!.email });
    await page.goto(`/auth/confirm#token_hash=${link.data.properties!.hashed_token}&type=email`);
    await page.getByRole('button', { name: 'אישור כניסה' }).click();
    await expect(page.getByRole('heading', { name: 'Synthetic household A' })).toBeVisible();
    for (const width of [320, 375, 390, 768, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      for (const [route, label, ready] of [
        ['dashboard', 'תמונת מצב', 'תאריך שווי'], ['accounts', 'חשבונות', 'שווי נכון לתאריך'],
        ['transactions', 'תנועות ויתרות', 'יתרה לתאריך'], ['budgets', 'תקציבים', 'חודש התכנון'],
        ['data-quality', 'איכות המידע', 'תאריך בדיקת יתרות'],
      ]) {
        await navigateTo(page, label!);
        await expect(page).toHaveURL(new RegExp(`/${route}$`));
        await expect(page.getByLabel(ready!, { exact: true })).toBeVisible();
        if (route === 'transactions') await page.locator('.accounts-toolbar').getByRole('combobox').selectOption(account.account.id);
        if (route === 'dashboard') await expect(page.getByRole('heading', { name: 'סכום שווי זמין — אינו שווי מאושר' })).toBeVisible();
        if (route === 'budgets') await page.getByRole('button', { name: 'הוספת תוכנית' }).click();
        if (route === 'data-quality') await expect(page.getByText('שלמות החישוב מתייחסת לרשומות הידועות בלבד.', { exact: false })).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        if (width < 1024) {
          expect(await page.locator('.sidebar').evaluate(e => e.getBoundingClientRect().height)).toBeLessThan(250);
          await expect(page.locator('#secondary-nav')).toBeHidden();
        }
        const controls = await page.locator('.accounts-panel input:not([type=checkbox]), .accounts-panel select, .accounts-panel button').evaluateAll(nodes => nodes.filter(e => e.getClientRects().length).map(e => e.getBoundingClientRect().height));
        expect(controls.every(height => height >= 44)).toBe(true);
        if (width === 320) expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({ path: info.outputPath(`after-${route}-${width}.png`), fullPage: true });
      }
    }
    await page.setViewportSize({ width: 320, height: 740 });
    await navigateTo(page, 'תנועות ויתרות');
    await expect(page.getByLabel('יתרה לתאריך')).toBeVisible();
    await page.locator('.accounts-toolbar').getByRole('combobox').selectOption(account.account.id);
    await page.getByRole('link', { name: /להיסטוריית התנועות/ }).click();
    await expect(page.getByRole('heading', { name: 'היסטוריית תנועות' })).toBeFocused();
    const history = page.locator('.observation-history > li');
    await expect(history).toHaveCount(20);
    const pages = page.getByRole('navigation', { name: 'עמודי היסטוריית תנועות' });
    await pages.getByRole('button', { name: 'הבא' }).click();
    await expect(history).toHaveCount(5);
    await expect(pages).toContainText('כל 25 הגרסאות זמינות');
    const correctionCard = history.filter({ has: page.getByRole('button', { name: /^תיקון/ }) }).first();
    const correctionDescription = await correctionCard.getByRole('heading').innerText();
    await correctionCard.getByRole('button', { name: /^תיקון/ }).click();
    await expect(page.locator('#transaction-editor')).toBeFocused();
    await expect(page.getByRole('heading', { name: 'תיקון תנועה', exact: true })).toBeVisible();
    await expect(page.getByLabel('תיאור', { exact: true })).toHaveValue(correctionDescription);
    expect(await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length }))).toEqual({ local: 0, session: 0 });
  } finally { await f.cleanup(); }
});

test('hidden mobile accounts and transactions reject delayed responses after revocation', async ({ page }) => {
  test.setTimeout(90000);
  const f = await budgetFixture();
  try {
    const a = await f.account(); await f.opening(a);
    const link = await localAdmin().auth.admin.generateLink({ type: 'magiclink', email: f.users[0]!.email });
    await page.goto(`/auth/confirm#token_hash=${link.data.properties!.hashed_token}&type=email`);
    await page.getByRole('button', { name: 'אישור כניסה' }).click();
    await expect(page.getByRole('heading', { name: 'Synthetic household A' })).toBeVisible();
    await page.setViewportSize({ width: 320, height: 740 });
    for (const [label, rpc, refresh] of [['חשבונות', 'transaction_snapshot', 'רענון'], ['תנועות ויתרות', 'transaction_snapshot', 'רענון תנועות']]) {
      await navigateTo(page, label!);
      await expect(page.getByText('1000.00 ILS', { exact: false }).first()).toBeVisible();
      let release!: () => void; let held = false;
      const gate = new Promise<void>(resolve => { release = resolve; });
      await page.route(`**/rest/v1/rpc/${rpc}`, async route => {
        if (held) { await route.continue(); return; }
        const response = await route.fetch(); held = true; await gate; await route.fulfill({ response });
      });
      await page.getByRole('button', { name: refresh!, exact: true }).click();
      try {
        await expect.poll(() => held).toBe(true);
        await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
        localSql(`update finance.household_members set status='REVOKED' where household_id='${uuid(f.households[0])}';`);
        release();
        await expect(page.getByText('1000.00 ILS', { exact: false })).toHaveCount(0);
        await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' }); document.dispatchEvent(new Event('visibilitychange')); });
        await expect(page.getByText(label === 'חשבונות' ? 'אין כרגע גישה לבית.' : 'אין חשבונות זמינים.', { exact: false })).toBeVisible();
        await expect(page.getByText('1000.00 ILS', { exact: false })).toHaveCount(0);
      } finally { release(); await page.unroute(`**/rest/v1/rpc/${rpc}`); }
      // Restore only this test fixture's member for the next independent screen case.
      localSql(`update finance.household_members set status='ACTIVE' where household_id='${uuid(f.households[0])}' and user_id is not null;`);
    }
  } finally { await f.cleanup(); }
});
