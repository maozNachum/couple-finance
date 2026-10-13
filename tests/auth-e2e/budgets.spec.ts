import { test,expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { budgetFixture } from '../integration/budget-fixture.mjs';
import { localAdmin,localSql,uuid } from '../../scripts/local-supabase.mjs';
type Fixture=Awaited<ReturnType<typeof budgetFixture>>;
async function login(page:import('@playwright/test').Page,f:Fixture){
 const link=await localAdmin().auth.admin.generateLink({type:'magiclink',email:f.users[0]!.email});
 if(link.error||!link.data.properties)throw new Error('Synthetic budget login failed');
 await page.goto(`/auth/confirm#token_hash=${link.data.properties.hashed_token}&type=email`);await page.getByRole('button',{name:'אישור כניסה'}).click();
 await expect(page.getByRole('heading',{name:'Synthetic household A'})).toBeVisible();await page.getByRole('link',{name:'תקציבים',exact:true}).click();
 await expect(page.getByLabel('חודש התכנון')).toBeVisible();await page.getByLabel('חודש התכנון').fill('2026-10');
}
const total=(page:import('@playwright/test').Page)=>page.getByRole('article',{name:'יעד כולל לבית',exact:true});
test('monthly plan create/edit/zero/history/archive with RTL and accessible controls',async({page},info)=>{
 test.setTimeout(90000);const f=await budgetFixture();
 try{
  const bank=await f.account();await f.opening(bank);await f.save(bank,'-30','EXPENSE');await f.save(bank,'5','EXPENSE');
  await login(page,f);await expect(page.getByText('לא הוגדרה תוכנית פעילה לחודש זה.',{exact:false})).toBeVisible();
  await page.getByRole('button',{name:'הוספת תוכנית',exact:true}).click();await page.getByLabel('סכום מתוכנן').fill('100');await page.getByLabel('סכום מתוכנן').press('Enter');
  await expect(total(page)).toContainText('75.00 ILS');await expect(total(page)).toContainText('25%');
  await expect(total(page)).toContainText('בתוך התכנון לפי הראיות הרשומות');
  await total(page).getByRole('button',{name:'עריכת סכום'}).click();await page.getByLabel('סכום מתוכנן').fill('0');await page.getByRole('button',{name:'שמירת תוכנית',exact:true}).click();
  await expect(total(page)).toContainText('חריגה מהתכנון');await expect(total(page)).toContainText('-25.00 ILS');await expect(total(page)).toContainText('תכנון אפס הוגדר במפורש');
  await total(page).getByText('היסטוריית התכנון',{exact:true}).click();await expect(total(page)).toContainText('גרסה 1');await expect(total(page)).toContainText('גרסה 2');
  expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);expect(await page.locator('html').getAttribute('dir')).toBe('rtl');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.getByRole('heading',{name:'תקציבים חודשיים',exact:true}).click();await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:info.outputPath('budgets-rtl.png'),fullPage:true});
  await total(page).getByRole('button',{name:'העברה לארכיון'}).click();await page.getByRole('button',{name:'אישור ארכיון',exact:true}).click();
  await expect(total(page)).toContainText('תוכנית בארכיון');await expect(total(page).getByRole('button',{name:'עריכת סכום'})).toHaveCount(0);
  expect(await page.evaluate(()=>({local:localStorage.length,session:sessionStorage.length}))).toEqual({local:0,session:0});
 }finally{await f.cleanup();}
});
test('category uncertainty, overlap conflicts, missing FX and card expenses stay visible',async({page})=>{
 test.setTimeout(90000);const f=await budgetFixture();
 try{
  const bank=await f.account(),card=await f.account('CREDIT_CARD'),foreign=await f.account('BANK','USD');
  for(const a of [bank,card,foreign])await f.opening(a,'0');const food=await f.category();
  const pay=await f.save(bank,'-50','EXPENSE'),purchase=await f.save(card,'-50','EXPENSE');await f.save(foreign,'-7','EXPENSE');
  expect((await f.rpc(f.a,'reconcile',f.link([f.participant(pay,bank,'PAYMENT','CARD'),f.participant(purchase,card,'PURCHASE','CARD')],'CARD'))).ok).toBe(true);
  expect((await f.rpc(f.a,'save_budget',f.command())).ok).toBe(true);
  expect((await f.rpc(f.a,'save_budget',f.command({scope:{kind:'ALL',memberId:null,categoryId:food.id}}))).ok).toBe(true);
  await login(page,f);await expect(total(page)).toContainText('השוואה לא מלאה');await expect(total(page)).toContainText('100.00 ILS');
  await expect(total(page)).toContainText('חסר שער היסטורי');await expect(total(page)).toContainText('עלול לספור צריכה פעמיים');
  await expect(page.getByRole('article',{name:`כל הבית — ${food.name}`})).toContainText('הוצאות ללא קטגוריה');
  await expect(page.getByText('בתוך התכנון לפי הראיות הרשומות',{exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'הוספת תוכנית',exact:true}).click();await page.getByLabel('תחום התוכנית').selectOption('SHARED');await page.getByRole('combobox',{name:'קטגוריה',exact:true}).selectOption(food.id);await page.getByLabel('סכום מתוכנן').fill('200');await page.getByRole('button',{name:'שמירת תוכנית',exact:true}).click();
  await expect(page.getByRole('status').filter({hasText:'חופפת לתוכנית קיימת'})).toBeVisible();await expect(total(page)).toContainText('100.00 ILS');
 }finally{await f.cleanup();}
});
test('lost command response retries exact payload; stale edit requires fresh explicit command',async({page})=>{
 test.setTimeout(90000);const f=await budgetFixture();
 try{
  const bank=await f.account();await f.opening(bank);await login(page,f);
  let body:unknown=null,lost=false;
  await page.route('**/rest/v1/rpc/save_budget',async route=>{
   const payload=route.request().postDataJSON();if(!lost){body=payload;await route.fetch();lost=true;await route.abort('failed');}else{expect(payload).toEqual(body);await route.continue();}
  });
  await page.getByRole('button',{name:'הוספת תוכנית',exact:true}).click();await page.getByLabel('סכום מתוכנן').fill('100');await page.getByRole('button',{name:'שמירת תוכנית',exact:true}).click();
  await expect(page.getByText('תוצאת השמירה אינה ידועה.',{exact:false})).toBeVisible();await expect(page.getByRole('button',{name:'שמירת תוכנית',exact:true})).toBeDisabled();
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect(page.getByRole('button',{name:'ניסיון חוזר של אותה שמירה'})).toBeEnabled();
  await page.getByRole('button',{name:'ניסיון חוזר של אותה שמירה'}).click();await expect(total(page)).toContainText('100.00 ILS');
  expect(localSql(`select count(*) from finance.budget_revisions where household_id='${uuid(f.households[0])}';`)).toBe('1');
  await page.unroute('**/rest/v1/rpc/save_budget');await total(page).getByRole('button',{name:'עריכת סכום'}).click();
  const current=(await f.rpc(f.a,'budget_snapshot')).snapshot.revisions[0];
  expect((await f.rpc(f.a,'save_budget',{...f.command(),id:current.id,action:'EDIT',expectedVersion:1,planned:{amount:'50',currency:'ILS'}})).ok).toBe(true);
  await page.getByLabel('סכום מתוכנן').fill('70');await page.getByRole('button',{name:'שמירת תוכנית',exact:true}).click();
  await expect(page.getByRole('status').filter({hasText:'התוכנית השתנתה'})).toBeVisible();await expect(total(page)).toContainText('50.00 ILS');
 }finally{await f.cleanup();}
});
test('network revalidation and obsolete responses clear plans on revocation and sign-out',async({page})=>{
 test.setTimeout(90000);const f=await budgetFixture();
 try{
  const bank=await f.account();await f.opening(bank);expect((await f.rpc(f.a,'save_budget',f.command({planned:{amount:'1234',currency:'ILS'}}))).ok).toBe(true);
  await login(page,f);await expect(total(page)).toContainText('1234.00 ILS');
  await page.route('**/rest/v1/rpc/budget_snapshot',r=>r.abort('failed'));await page.getByRole('button',{name:'רענון תוכניות וראיות'}).click();
  await expect(page.getByRole('alert')).toBeVisible();await expect(total(page)).toHaveCount(0);await page.unroute('**/rest/v1/rpc/budget_snapshot');
  await page.getByRole('button',{name:'רענון תוכניות וראיות'}).click();await expect(total(page)).toBeVisible();
  let release!:()=>void,intercepted=false;const gate=new Promise<void>(resolve=>{release=resolve;});
  await page.route('**/rest/v1/rpc/budget_snapshot',async route=>{if(intercepted){await route.continue();return;}const response=await route.fetch();intercepted=true;await gate;await route.fulfill({response});});
  await page.getByRole('button',{name:'רענון תוכניות וראיות'}).click();
  try{await expect.poll(()=>intercepted).toBe(true);localSql(`update finance.household_members set status='REVOKED' where household_id='${uuid(f.households[0])}';`);await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect(page.getByText('אין כרגע גישה לבית.',{exact:true})).toBeVisible();}finally{release();}
  await expect(total(page)).toHaveCount(0);await page.getByRole('link',{name:'הבית המשותף',exact:true}).click();await page.getByRole('button',{name:'יציאה',exact:true}).click();
  await expect(page).toHaveURL(/\/sign-in/);await page.goto('/budgets');await expect(page).toHaveURL(/\/sign-in/);await expect(page.getByText('1234.00 ILS',{exact:true})).toHaveCount(0);
 }finally{await f.cleanup();}
});
