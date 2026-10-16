import { navigateTo } from '../navigation';
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { obligationFixture } from '../integration/obligation-fixture.mjs';
import { localAdmin, localSql, uuid } from '../../scripts/local-supabase.mjs';
type Fixture=Awaited<ReturnType<typeof obligationFixture>>;
type Page=import('@playwright/test').Page;
async function login(page:Page,f:Fixture) {
  const link=await localAdmin().auth.admin.generateLink({type:'magiclink',email:f.users[0]!.email});
  if(link.error||!link.data.properties)throw new Error('Synthetic quality login failed');
  await page.goto(`/auth/confirm#token_hash=${link.data.properties.hashed_token}&type=email`);
  await page.getByRole('button',{name:'אישור כניסה'}).click();
  await expect(page.getByRole('heading',{name:'Synthetic household A'})).toBeVisible();
  await navigateTo(page, 'איכות המידע');
  await expect(page.getByLabel('תאריך בדיקת יתרות')).toBeVisible();
  await page.getByLabel('תאריך בדיקת יתרות').fill('2026-10-14');
  await page.getByLabel('חודש הדיווח').fill('2026-10');
}

test('known evidence, actionable findings, explicit forecast and mobile RTL accessibility',async({page},info)=>{
  test.setTimeout(90000);const f=await obligationFixture();
  try {
    await login(page,f);
    await expect(page.getByRole('heading',{name:'0 נושאים לבירור בנתונים הידועים'})).toBeVisible();
    await expect(page.getByText('לא זוהו בעיות נתמכות בטווח שנבחר.',{exact:false})).toContainText('עדיין אינו ידוע');
    const missing=await f.account('SAVINGS');
    await f.save(f.bank,'-10','UNCLASSIFIED');
    await page.getByRole('button',{name:'רענון איכות המידע',exact:true}).click();
    await expect(page.getByRole('heading',{name:'2 נושאים לבירור בנתונים הידועים'})).toBeVisible();
    const opening=page.locator('article').filter({has:page.getByRole('heading',{name:`ראיות יתרה — ${missing.account.name}`})});
    await expect(opening).toContainText('שווי נקי');await expect(opening).toContainText('הכנסות והוצאות בחודש');
    await expect(opening.getByRole('link',{name:'בדיקת תנועות ויתרות פתיחה'})).toHaveAttribute('href','/transactions');
    await page.getByText('בדיקת ראיות לתחזית ל־30 יום',{exact:true}).click();
    await page.getByLabel('לכלול בדיקת תחזית לפי בחירות מפורשות').check();
    await page.getByLabel('כרית מזומן מפורשת',{exact:true}).fill('0');
    await page.getByRole('combobox',{name:`זמינות ${f.bank.account.name}`,exact:true}).selectOption('INCLUDE');
    await page.getByRole('combobox',{name:`זמינות ${missing.account.name}`,exact:true}).selectOption('INCLUDE');
    await expect(opening).toContainText('תחזית תזרים');
    expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
    expect(await page.locator('html').getAttribute('dir')).toBe('rtl');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
    await opening.getByRole('link').focus();await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/transactions/);
    await expect(page.getByRole('heading',{name:'תנועות ויתרות',exact:true})).toBeVisible();
    await navigateTo(page, 'איכות המידע');
    await expect(page.getByLabel('תאריך בדיקת יתרות')).toBeVisible();
    await page.screenshot({path:info.outputPath('data-quality-rtl.png'),fullPage:true});
    expect(await page.evaluate(async()=>({local:localStorage.length,session:sessionStorage.length,databases:(await indexedDB.databases()).length}))).toEqual({local:0,session:0,databases:0});
  }finally{await f.cleanup();}
});

test('network failure and revoked membership cannot restore late protected findings',async({page})=>{
  test.setTimeout(90000);const f=await obligationFixture();
  try {
    await f.account('SAVINGS');await login(page,f);
    await page.route('**/rest/v1/rpc/data_quality_snapshot',r=>r.abort());
    await page.getByRole('button',{name:'רענון איכות המידע'}).click();
    await expect(page.getByRole('alert')).toContainText('לא ניתן לטעון ראיות');
    await expect(page.locator('.quality-finding')).toHaveCount(0);
    await page.unroute('**/rest/v1/rpc/data_quality_snapshot');
    await page.getByRole('button',{name:'רענון איכות המידע'}).click();
    await expect(page.locator('.quality-finding')).toHaveCount(1);
    let release!:()=>void,intercepted=false;const gate=new Promise<void>(resolve=>{release=resolve;});
    await page.route('**/rest/v1/rpc/data_quality_snapshot',async route=>{if(intercepted){await route.continue();return;}const response=await route.fetch();intercepted=true;await gate;await route.fulfill({response});});
    await page.getByRole('button',{name:'רענון איכות המידע'}).click();
    try {
      await expect.poll(()=>intercepted).toBe(true);
      localSql(`update finance.household_members set status='REVOKED' where household_id='${uuid(f.households[0])}' and user_id='${uuid(f.users[0]!.id)}';`);
      await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
      await expect(page.getByText('אין כרגע גישה לבית.',{exact:true})).toBeVisible();
    }finally{release();}
    await expect(page.locator('.quality-finding')).toHaveCount(0);
    await navigateTo(page, 'הבית המשותף');
    await page.getByRole('button',{name:'יציאה',exact:true}).click();
    await expect(page).toHaveURL(/\/sign-in/);await page.goto('/data-quality');await expect(page).toHaveURL(/\/sign-in/);
  }finally{await f.cleanup();}
});

test('late responses after household selection or logout cannot restore previous context',async({page})=>{
  test.setTimeout(90000);const f=await obligationFixture();
  try {
    await f.account('SAVINGS');await login(page,f);
    localSql(`insert into finance.household_members(household_id,user_id,display_name) values('${uuid(f.households[1])}','${uuid(f.users[0]!.id)}','Synthetic shared access');`);
    let release!:()=>void,intercepted=false;const gate=new Promise<void>(resolve=>{release=resolve;});
    await page.route('**/rest/v1/rpc/data_quality_snapshot',async route=>{if(intercepted){await route.continue();return;}const response=await route.fetch();intercepted=true;await gate;await route.fulfill({response});});
    await page.getByRole('button',{name:'רענון איכות המידע'}).click();
    try {
      await expect.poll(()=>intercepted).toBe(true);
      await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
      await expect(page.getByRole('combobox',{name:'בית',exact:true})).toBeVisible();
      await page.getByRole('combobox',{name:'בית',exact:true}).selectOption(f.households[1]!);
      await expect(page.getByRole('heading',{name:'0 נושאים לבירור בנתונים הידועים'})).toBeVisible();
    }finally{release();}
    await expect(page.getByRole('combobox',{name:'בית',exact:true})).toHaveValue(f.households[1]!);
    await expect(page.locator('.quality-finding')).toHaveCount(0);
    await page.unroute('**/rest/v1/rpc/data_quality_snapshot');
    let releaseLogout!:()=>void,held=false;const logoutGate=new Promise<void>(resolve=>{releaseLogout=resolve;});
    await page.route('**/rest/v1/rpc/data_quality_snapshot',async route=>{const response=await route.fetch();held=true;await logoutGate;await route.fulfill({response});});
    await page.getByRole('button',{name:'רענון איכות המידע'}).click();
    try {await expect.poll(()=>held).toBe(true);await navigateTo(page, 'הבית המשותף');await page.getByRole('button',{name:'יציאה',exact:true}).click();await expect(page).toHaveURL(/\/sign-in/);}finally{releaseLogout();}
    await expect(page.locator('.quality-finding')).toHaveCount(0);
    await page.goto('/data-quality');await expect(page).toHaveURL(/\/sign-in/);
  }finally{await f.cleanup();}
});
