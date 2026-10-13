import { test,expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import { reconciliationFixture } from '../integration/reconciliation-fixture.mjs';
import { localAdmin,localSql,uuid } from '../../scripts/local-supabase.mjs';

type Fixture = Awaited<ReturnType<typeof reconciliationFixture>>;
async function login(page:import('@playwright/test').Page,f:Fixture) {
  const link=await localAdmin().auth.admin.generateLink({type:'magiclink',email:f.users[0]!.email});
  if(link.error||!link.data.properties)throw new Error('Synthetic dashboard login');
  await page.goto(`/auth/confirm#token_hash=${link.data.properties.hashed_token}&type=email`);
  await page.getByRole('button',{name:'אישור כניסה'}).click();
  await expect(page.getByRole('heading',{name:'Synthetic household A'})).toBeVisible();
  await page.getByRole('link',{name:'תמונת מצב',exact:true}).click();
  await expect(page.getByLabel('תאריך שווי')).toBeVisible();
  await page.getByLabel('תאריך שווי').fill('2026-10-13');
  await page.getByLabel('חודש הכנסות וצריכה').fill('2026-10');
}
async function opening(f:Fixture,a:Awaited<ReturnType<Fixture['account']>>,amount:string) {
  const cmd=f.movement(a,amount,'ADJUSTMENT',null,{transactionDate:'2026-10-01'});
  const result=await f.rpc(f.a,'record_transaction',{...cmd,entryKind:'OPENING',openingCoverage:'COMPLETE'});
  expect(result.ok).toBe(true);
}
test('RTL household reporting preserves card expense warnings, historical dates and attribution',async({page},info)=>{
  test.setTimeout(90000);const f=await reconciliationFixture();
  try {
    const bank=await f.account(),card=await f.account('CREDIT_CARD');
    await opening(f,bank,'1000');await opening(f,card,'0');
    const pay=await f.save(bank,'-50','EXPENSE'),purchase=await f.save(card,'-50','EXPENSE');
    expect((await f.rpc(f.a,'reconcile',f.link([f.participant(pay,bank,'PAYMENT','CARD'),f.participant(purchase,card,'PURCHASE','CARD')],'CARD'))).ok).toBe(true);
    await login(page,f);
    await expect(page.getByRole('heading',{name:'שווי נקי',exact:true})).toBeVisible();
    await expect(page.locator('article').filter({has:page.getByRole('heading',{name:'שווי נקי',exact:true})})).toContainText('900.00 ILS');
    await expect(page.locator('article').filter({has:page.getByRole('heading',{name:'צריכה — סכום זמין',exact:true})})).toContainText('100.00 ILS');
    await expect(page.getByText('תשלום כרטיס עדיין מסומן כהוצאה',{exact:false})).toBeVisible();
    await expect(page.locator('article').filter({has:page.getByRole('heading',{name:'הכנסות פחות צריכה',exact:true})})).toContainText('לא זמין');
    expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
    expect(await page.locator('html').getAttribute('dir')).toBe('rtl');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
    await page.screenshot({path:info.outputPath('dashboard-rtl.png'),fullPage:true});
    await page.getByLabel('תאריך שווי').fill('2026-09-30');
    await expect(page.getByRole('heading',{name:'סכום שווי זמין — אינו שווי מאושר'})).toBeVisible();
    await expect(page.getByText('התאריך קודם ליתרת הפתיחה.',{exact:false}).first()).toBeVisible();
    expect(await page.evaluate(()=>({local:localStorage.length,session:sessionStorage.length}))).toEqual({local:0,session:0});
  } finally {await f.cleanup();}
});
test('observed foreign balances expose missing FX and carried measurement without fabricated totals',async({page})=>{
  test.setTimeout(60000);const f=await reconciliationFixture();
  try {
    const record={account:{id:randomUUID(),householdId:f.households[0],name:'Synthetic observed dollars',ownership:{kind:'HOUSEHOLD'},type:'INVESTMENT',currency:'USD',valuationCurrency:'USD',balancePolicy:'OBSERVED',status:'ACTIVE'},version:1,manualSourceId:randomUUID()};
    expect((await f.rpc(f.a,'create_account',record)).ok).toBe(true);
    expect((await f.rpc(f.a,'record_balance',{id:randomUUID(),householdId:f.households[0],accountId:record.account.id,sourceId:record.manualSourceId,date:'2026-10-12',money:{amount:'123.12345678',currency:'USD'},coverage:'PARTIAL',supersedesId:null,note:'Synthetic partial evidence',fx:null})).ok).toBe(true);
    await login(page,f);
    await expect(page.getByRole('heading',{name:'סכום שווי זמין — אינו שווי מאושר'})).toBeVisible();
    await expect(page.getByText('חסרה ראיית שער בכיוון ובתאריך הנדרשים.',{exact:false})).toBeVisible();
    await expect(page.getByText('123.12 USD',{exact:true})).toBeVisible();
    await page.getByLabel('מטבע הדוח').selectOption('USD');
    await expect(page.getByRole('heading',{name:'שווי נקי',exact:true})).toHaveCount(0);
    await expect(page.getByText('תצפית השווי מכסה רק חלק מהחשבון.',{exact:false})).toBeVisible();
  } finally {await f.cleanup();}
});
test('revalidation clears protected dashboard on network uncertainty, revocation and sign-out',async({page})=>{
  test.setTimeout(90000);const f=await reconciliationFixture();
  try {
    const bank=await f.account();await opening(f,bank,'1234');await login(page,f);
    await expect(page.getByRole('heading',{name:'שווי נקי',exact:true})).toBeVisible();
    await page.route('**/rest/v1/rpc/reporting_snapshot',r=>r.abort('failed'));
    await page.getByRole('button',{name:'רענון ראיות',exact:true}).click();
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.getByText('1234.00 ILS',{exact:true})).toHaveCount(0);
    await page.unroute('**/rest/v1/rpc/reporting_snapshot');
    await page.getByRole('button',{name:'רענון ראיות',exact:true}).click();
    await expect(page.getByRole('heading',{name:'שווי נקי',exact:true})).toBeVisible();
    let release!:()=>void,intercepted=false;
    const gate=new Promise<void>(resolve=>{release=resolve;});
    await page.route('**/rest/v1/rpc/reporting_snapshot',async route=>{
      if(intercepted){await route.continue();return;}
      const response=await route.fetch();intercepted=true;await gate;await route.fulfill({response});
    });
    await page.getByRole('button',{name:'רענון ראיות',exact:true}).click();
    try {
      await expect.poll(()=>intercepted).toBe(true);
      localSql(`update finance.household_members set status='REVOKED' where household_id='${uuid(f.households[0])}';`);
      await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
      await expect(page.getByText('אין כרגע גישה לבית.',{exact:true})).toBeVisible();
    } finally {release();}
    await expect(page.getByText('אין כרגע גישה לבית.',{exact:true})).toBeVisible();
    await expect(page.getByRole('heading',{name:'שווי נקי',exact:true})).toHaveCount(0);
    await page.getByRole('link',{name:'הבית המשותף',exact:true}).click();
    await page.getByRole('button',{name:'יציאה',exact:true}).click();
    await expect(page).toHaveURL(/\/sign-in/);
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/sign-in/);
    await expect(page.getByText('1234.00 ILS',{exact:true})).toHaveCount(0);
  } finally {await f.cleanup();}
});
