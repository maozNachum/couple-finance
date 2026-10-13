import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { obligationFixture } from '../integration/obligation-fixture.mjs';
import { localAdmin, localSql, uuid } from '../../scripts/local-supabase.mjs';
type Fixture=Awaited<ReturnType<typeof obligationFixture>>;
type Page=import('@playwright/test').Page;
async function login(page:Page,f:Fixture) {
  const link=await localAdmin().auth.admin.generateLink({type:'magiclink',email:f.users[0]!.email});
  if(link.error||!link.data.properties)throw new Error('Synthetic forecast login failed');
  await page.goto(`/auth/confirm#token_hash=${link.data.properties.hashed_token}&type=email`);
  await page.getByRole('button',{name:'אישור כניסה'}).click();
  await expect(page.getByRole('heading',{name:'Synthetic household A'})).toBeVisible();
  await page.getByRole('link',{name:'תחזית תזרים',exact:true}).click();
  await expect(page.getByLabel('תאריך יתרת פתיחה בסוף היום')).toBeVisible();
  await page.getByLabel('תאריך יתרת פתיחה בסוף היום').fill('2026-10-01');
  await page.getByRole('combobox',{name:`זמינות ${f.bank.account.name}`,exact:true}).selectOption('INCLUDE');
  await page.getByLabel('כרית מזומן מפורשת',{exact:true}).fill('50');
}
test('explicit liquidity and buffer, daily minimum, partial associations and accessible RTL',async({page},info)=>{
  test.setTimeout(90000);const f=await obligationFixture();
  try {
    const c=f.command();expect((await f.rpc(f.a,'obligation_command',c)).ok).toBe(true);
    await login(page,f);
    await expect(page.getByRole('heading',{name:'מודל מלא לפי הרשומות',exact:true})).toBeVisible();
    await expect(page.getByText('סכום מעל כרית המזומן לפי המודל:',{exact:false})).toContainText('940.00 ILS');
    await page.getByLabel('כרית מזומן מפורשת',{exact:true}).fill('1000');
    await expect(page.getByText('מחסור ביחס לכרית המזומן לפי המודל:',{exact:false})).toContainText('10.00 ILS');
    await page.getByLabel('כרית מזומן מפורשת',{exact:true}).fill('0');
    await expect(page.getByText('סכום מעל כרית המזומן לפי המודל:',{exact:false})).toContainText('990.00 ILS');
    await page.getByRole('combobox',{name:`זמינות ${f.bank.account.name}`,exact:true}).selectOption('');
    await expect(page.getByText('סכום פנוי להוצאה אינו זמין:',{exact:false})).toBeVisible();
    await page.getByRole('combobox',{name:`זמינות ${f.bank.account.name}`,exact:true}).selectOption('INCLUDE');
    const actual=await f.save(f.bank,'-7','EXPENSE');expect((await f.rpc(f.a,'obligation_command',f.match(c,actual))).ok).toBe(true);
    await page.getByRole('button',{name:'רענון ראיות לתחזית',exact:true}).click();
    await expect(page.getByLabel('כרית מזומן מפורשת',{exact:true})).toHaveValue('');
    await page.getByRole('combobox',{name:`זמינות ${f.bank.account.name}`,exact:true}).selectOption('INCLUDE');await page.getByLabel('כרית מזומן מפורשת',{exact:true}).fill('50');
    await expect(page.getByText('שיוך חלקי אינו מסלק את מלוא ההתחייבות.',{exact:false})).toBeVisible();
    await expect(page.getByText('סכום פנוי להוצאה אינו זמין:',{exact:false})).toBeVisible();
    expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
    expect(await page.locator('html').getAttribute('dir')).toBe('rtl');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
    await page.getByLabel('כרית מזומן מפורשת',{exact:true}).focus();await page.keyboard.press('Tab');
    expect(await page.evaluate(()=>document.activeElement!==document.body)).toBe(true);
    await page.getByRole('heading',{name:'תחזית תזרים וסכום פנוי',exact:true}).click();await page.evaluate(()=>window.scrollTo(0,0));
    await page.screenshot({path:info.outputPath('forecast-rtl.png'),fullPage:true});
    expect(await page.evaluate(async()=>({local:localStorage.length,session:sessionStorage.length,databases:(await indexedDB.databases()).length}))).toEqual({local:0,session:0,databases:0});
  } finally {await f.cleanup();}
});
test('network failures, revoked unchanged JWT and obsolete responses never restore forecast data',async({page})=>{
  test.setTimeout(90000);const f=await obligationFixture();
  try {
    await login(page,f);
    await expect(page.getByText('סכום מעל כרית המזומן לפי המודל:',{exact:false})).toBeVisible();
    await page.route('**/rest/v1/rpc/obligations_snapshot',r=>r.abort());
    await page.getByRole('button',{name:'רענון ראיות לתחזית',exact:true}).click();
    await expect(page.getByRole('alert')).toContainText('לא ניתן לטעון ראיות');
    await expect(page.getByText('סכום מעל כרית המזומן לפי המודל:',{exact:false})).toHaveCount(0);
    await page.unroute('**/rest/v1/rpc/obligations_snapshot');
    await page.getByRole('button',{name:'רענון ראיות לתחזית',exact:true}).click();
    await expect(page.getByLabel('כרית מזומן מפורשת',{exact:true})).toBeVisible();
    let release!:()=>void,intercepted=false;
    const gate=new Promise<void>(resolve=>{release=resolve;});
    await page.route('**/rest/v1/rpc/obligations_snapshot',async route=>{if(intercepted){await route.continue();return;}const response=await route.fetch();intercepted=true;await gate;await route.fulfill({response});});
    await page.getByRole('button',{name:'רענון ראיות לתחזית',exact:true}).click();
    try {
      await expect.poll(()=>intercepted).toBe(true);
      localSql(`update finance.household_members set status='REVOKED' where household_id='${uuid(f.households[0])}' and user_id='${uuid(f.users[0]!.id)}';`);
      await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
      await expect(page.getByText('אין כרגע גישה לבית.',{exact:true})).toBeVisible();
    } finally {release();}
    await expect(page.getByText(f.bank.account.name,{exact:true})).toHaveCount(0);
    await page.getByRole('link',{name:'הבית המשותף',exact:true}).click();
    await page.getByRole('button',{name:'יציאה',exact:true}).click();
    await expect(page).toHaveURL(/\/sign-in/);await page.goto('/forecast');await expect(page).toHaveURL(/\/sign-in/);
    await expect(page.getByText(f.bank.account.name,{exact:true})).toHaveCount(0);
    expect(await page.evaluate(async()=>({local:localStorage.length,session:sessionStorage.length,databases:(await indexedDB.databases()).length}))).toEqual({local:0,session:0,databases:0});
  } finally {await f.cleanup();}
});
