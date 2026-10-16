import { navigateTo } from '../navigation';
import { test,expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { randomUUID } from 'node:crypto';
import { obligationFixture } from '../integration/obligation-fixture.mjs';
import { localAdmin,localSql,uuid } from '../../scripts/local-supabase.mjs';
type Fixture=Awaited<ReturnType<typeof obligationFixture>>;
type Page=import('@playwright/test').Page;
async function login(page:Page,f:Fixture) {
 const link=await localAdmin().auth.admin.generateLink({type:'magiclink',email:f.users[0]!.email});
 if(link.error||!link.data.properties)throw new Error('Synthetic obligations login failed');
 await page.goto(`/auth/confirm#token_hash=${link.data.properties.hashed_token}&type=email`);await page.getByRole('button',{name:'אישור כניסה'}).click();
 await expect(page.getByRole('heading',{name:'Synthetic household A'})).toBeVisible();await navigateTo(page, 'התחייבויות');
 await expect(page.getByLabel('מועדים צפויים מתאריך')).toBeVisible();await page.getByLabel('מועדים צפויים מתאריך').fill('2026-10-01');await page.getByLabel('מועדים צפויים עד תאריך').fill('2026-10-31');
}
const obligation=(page:Page,name='התחייבות סינתטית')=>page.getByRole('article',{name:`התחייבות ${name}`,exact:true});
const event=(page:Page,name='התחייבות סינתטית',date='2026-10-31')=>page.getByRole('article',{name:`מועד ${name} ${date}`,exact:true});
const form=(page:Page)=>page.getByRole('form',{name:'אישור התחייבות',exact:true});
async function review(occurrence:import('@playwright/test').Locator){await expect(occurrence).toBeVisible();const button=occurrence.getByRole('button',{name:'סקירת ראיות ושיוך',exact:true});if(await button.count())await button.click();}
test('review candidate evidence, explicitly confirm/link/unlink/edit/archive with accessible RTL history',async({page},info)=>{
 test.setTimeout(90000);const f=await obligationFixture();
 try{
  for(const date of ['2026-07-31','2026-08-31','2026-09-30'])await f.save(f.bank,'-10','EXPENSE',null,{transactionDate:date,description:'מנוי סינתטי'});
  const actual=await f.save(f.bank,'-10','EXPENSE',null,{description:'תשלום סינתטי'});await login(page,f);
  const candidate=page.getByRole('article',{name:'הצעה מנוי סינתטי',exact:true});await expect(candidate).toContainText('זהות ההתחייבות לא אומתה');await candidate.getByText('הראיות להצעה',{exact:true}).click();await expect(candidate).toContainText('2026-09-30');
  await candidate.getByRole('button',{name:'בדיקה ואישור התחייבות'}).click();await expect(form(page).getByLabel('יום בחודש')).toHaveValue('31');await form(page).getByRole('checkbox').check();await form(page).getByRole('button',{name:'אישור ושמירה'}).click();
  await expect(obligation(page,'מנוי סינתטי')).toBeVisible();const occurrence=event(page,'מנוי סינתטי');await expect(occurrence).toContainText('מצב התשלום לא ידוע');
  await review(occurrence);await occurrence.getByLabel('ראיית תשלום לשיוך').selectOption(`${actual.revisionId}/${actual.transaction.allocations[0]!.id}`);await review(occurrence);await occurrence.getByRole('checkbox').check();await occurrence.getByRole('button',{name:'אישור שיוך תשלום'}).click();await expect(occurrence).toContainText('ראיית תשלום שויכה במפורש');
  await review(occurrence);await occurrence.getByRole('checkbox').check();await occurrence.getByRole('button',{name:'אישור ביטול שיוך'}).click();await expect(occurrence).toContainText('מצב התשלום לא ידוע');await occurrence.getByText('היסטוריית שיוך',{exact:true}).click();await expect(occurrence).toContainText('השיוך בוטל');
  await obligation(page,'מנוי סינתטי').getByRole('button',{name:'עריכת התחייבות'}).click();await form(page).getByLabel('סכום צפוי').fill('20');await form(page).getByLabel('תחילת תוקף השינוי').fill('2026-11-01');await form(page).getByRole('checkbox').check();await form(page).getByRole('button',{name:'אישור ושמירה'}).click();
  await expect(obligation(page,'מנוי סינתטי')).toContainText('גרסה 2');await expect(occurrence).toContainText('10.00 ILS');await page.getByLabel('מועדים צפויים עד תאריך').fill('2026-12-31');await expect(event(page,'מנוי סינתטי','2026-11-30')).toContainText('20.00 ILS');
  await obligation(page,'מנוי סינתטי').getByText('היסטוריית החלטות',{exact:true}).click();await expect(obligation(page,'מנוי סינתטי')).toContainText('גרסה 1');
  expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);expect(await page.locator('html').getAttribute('dir')).toBe('rtl');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.getByRole('heading',{name:'התחייבויות חוזרות',exact:true}).click();await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:info.outputPath('obligations-rtl.png'),fullPage:true});
  await obligation(page,'מנוי סינתטי').getByRole('button',{name:'העברה לארכיון'}).click();await form(page).getByLabel('תחילת תוקף השינוי').fill('2026-12-01');await form(page).getByRole('checkbox').check();await form(page).getByRole('button',{name:'אישור ושמירה'}).click();
  await expect(obligation(page,'מנוי סינתטי')).toContainText('בארכיון');await expect(event(page,'מנוי סינתטי','2026-12-31')).toHaveCount(0);await expect(occurrence).toBeVisible();
  expect(await page.evaluate(()=>({local:localStorage.length,session:sessionStorage.length}))).toEqual({local:0,session:0});
 }finally{await f.cleanup();}
});
test('manual foreign currency planning, partial payment and explicit rejection remain truthful',async({page})=>{
 test.setTimeout(90000);const f=await obligationFixture();
 try{
  for(const date of ['2026-07-05','2026-08-07','2026-09-08'])await f.save(f.bank,'-10','EXPENSE',null,{transactionDate:date,description:'השערה עמומה'});
  const actual=await f.save(f.bank,'-7','EXPENSE');const c=f.command();expect((await f.rpc(f.a,'obligation_command',c)).ok).toBe(true);
  await login(page,f);const candidate=page.getByRole('article',{name:'הצעה השערה עמומה',exact:true});await expect(candidate).toContainText('דפוס עמום');await candidate.getByRole('button',{name:'דחיית הצעה',exact:true}).click();await page.getByRole('button',{name:'אישור דחיית הצעה',exact:true}).click();await expect(candidate).toHaveCount(0);
  const occurrence=event(page);await review(occurrence);await occurrence.getByLabel('ראיית תשלום לשיוך').selectOption(`${actual.revisionId}/${actual.transaction.allocations[0]!.id}`);await review(occurrence);await occurrence.getByRole('checkbox').check();await occurrence.getByRole('button',{name:'אישור שיוך תשלום'}).click();await expect(occurrence).toContainText('ראיית תשלום חלקית — לא הושלם');
  const usd=await f.account('BANK','USD');await page.getByRole('button',{name:'רענון התחייבויות וראיות'}).click();await expect(occurrence).toBeVisible();await page.getByRole('button',{name:'הוספת התחייבות ידנית'}).click();await form(page).getByLabel('שם התחייבות').fill('תכנון דולרי');await form(page).getByLabel('חשבון ומטבע').selectOption(usd.account.id);await form(page).getByLabel('סכום צפוי').fill('1.00000001');await form(page).getByLabel('יום בחודש').fill('29');await form(page).getByLabel('תאריך התחלה',{exact:true}).fill('2026-10-01');await form(page).getByRole('checkbox').check();await form(page).getByLabel('שם התחייבות').press('Enter');
  await expect(obligation(page,'תכנון דולרי')).toContainText('USD');await expect(event(page,'תכנון דולרי','2026-10-29')).toContainText('מצב התשלום לא ידוע');await expect(page.getByText('אין שער עתידי.',{exact:false})).toBeVisible();
 }finally{await f.cleanup();}
});
test('uncertain committed response retains exact retry and stale edits require a new review',async({page})=>{
 test.setTimeout(90000);const f=await obligationFixture();
 try{
  await login(page,f);let payload:unknown=null,lost=false;
  await page.route('**/rest/v1/rpc/obligation_command',async route=>{const body=route.request().postDataJSON();if(!lost){payload=body;await route.fetch();lost=true;await route.abort('failed');}else{expect(body).toEqual(payload);await route.continue();}});
  await page.getByRole('button',{name:'הוספת התחייבות ידנית'}).click();await form(page).getByLabel('שם התחייבות').fill('התחייבות סינתטית');await form(page).getByLabel('סכום צפוי').fill('10');await form(page).getByLabel('יום בחודש').fill('31');await form(page).getByLabel('תאריך התחלה',{exact:true}).fill('2026-10-01');await form(page).getByRole('checkbox').check();await form(page).getByRole('button',{name:'אישור ושמירה'}).click();
  await expect(page.getByText('תוצאת השמירה אינה ידועה.',{exact:false})).toBeVisible();await expect(form(page).getByRole('button',{name:'אישור ושמירה'})).toBeDisabled();await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect(page.getByRole('button',{name:'ניסיון חוזר של אותה שמירה'})).toBeEnabled();await page.getByRole('button',{name:'ניסיון חוזר של אותה שמירה'}).click();await expect(obligation(page)).toBeVisible();
  expect(localSql(`select count(*) from finance.obligation_revisions where household_id='${uuid(f.households[0])}';`)).toBe('1');await page.unroute('**/rest/v1/rpc/obligation_command');
  await obligation(page).getByRole('button',{name:'עריכת התחייבות'}).click();const head=(await f.rpc(f.a,'obligations_snapshot')).snapshot.revisions[0];
  expect((await f.rpc(f.a,'obligation_command',{...f.command(),id:head.id,expectedVersion:1,action:'EDIT',plan:{...head.plan,money:{amount:'20',currency:'ILS'}},origin:head.origin,effectiveFrom:'2026-11-01',idempotencyKey:randomUUID()})).ok).toBe(true);
  await form(page).getByLabel('סכום צפוי').fill('30');await form(page).getByLabel('תחילת תוקף השינוי').fill('2026-12-01');await form(page).getByRole('checkbox').check();await form(page).getByRole('button',{name:'אישור ושמירה'}).click();await expect(page.getByRole('status').filter({hasText:'הראיות או הגרסה השתנו'})).toBeVisible();await expect(obligation(page)).toContainText('20.00 ILS');
 }finally{await f.cleanup();}
});
test('network failure and obsolete responses clear protected obligations on revocation/sign-out',async({page})=>{
 test.setTimeout(90000);const f=await obligationFixture();
 try{
  expect((await f.rpc(f.a,'obligation_command',f.command())).ok).toBe(true);await login(page,f);await expect(obligation(page)).toBeVisible();
  await page.route('**/rest/v1/rpc/obligations_snapshot',r=>r.abort('failed'));await page.getByRole('button',{name:'רענון התחייבויות וראיות'}).click();await expect(page.getByRole('alert')).toBeVisible();await expect(obligation(page)).toHaveCount(0);await page.unroute('**/rest/v1/rpc/obligations_snapshot');await page.getByRole('button',{name:'רענון התחייבויות וראיות'}).click();await expect(obligation(page)).toBeVisible();
  let release!:()=>void,intercepted=false;const gate=new Promise<void>(resolve=>{release=resolve;});await page.route('**/rest/v1/rpc/obligations_snapshot',async route=>{if(intercepted){await route.continue();return;}const response=await route.fetch();intercepted=true;await gate;await route.fulfill({response});});
  await page.getByRole('button',{name:'רענון התחייבויות וראיות'}).click();try{await expect.poll(()=>intercepted).toBe(true);localSql(`update finance.household_members set status='REVOKED' where household_id='${uuid(f.households[0])}';`);await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect(page.getByText('אין כרגע גישה לבית.',{exact:true})).toBeVisible();}finally{release();}
  await expect(obligation(page)).toHaveCount(0);await navigateTo(page, 'הבית המשותף');await page.getByRole('button',{name:'יציאה',exact:true}).click();await expect(page).toHaveURL(/\/sign-in/);await page.goto('/obligations');await expect(page).toHaveURL(/\/sign-in/);await expect(obligation(page)).toHaveCount(0);
 }finally{await f.cleanup();}
});
test('a corrected actual payment becomes stale until explicit unlink and new review',async({page})=>{
 test.setTimeout(90000);const f=await obligationFixture();
 try{
  const actual=await f.save(f.bank,'-10','EXPENSE'),c=f.command();expect((await f.rpc(f.a,'obligation_command',c)).ok).toBe(true);expect((await f.rpc(f.a,'obligation_command',f.match(c,actual))).ok).toBe(true);
  await login(page,f);const occurrence=event(page);await expect(occurrence).toContainText('ראיית תשלום שויכה במפורש');
  const corrected={...actual,revisionId:randomUUID(),supersedesRevisionId:actual.revisionId,expectedVersion:1,idempotencyKey:randomUUID(),reason:'Synthetic correction',transaction:{...actual.transaction,money:{amount:'-7',currency:'ILS'},allocations:actual.transaction.allocations.map(a=>({...a,money:{amount:'-7',currency:'ILS'}}))}};
  expect((await f.rpc(f.a,'record_transaction',corrected)).ok).toBe(true);await page.getByRole('button',{name:'רענון התחייבויות וראיות'}).click();await expect(occurrence).toContainText('ראיית התשלום השתנתה — נדרש שיוך מחדש');await expect(occurrence.getByRole('button',{name:'אישור שיוך תשלום'})).toHaveCount(0);
  await review(occurrence);await occurrence.getByRole('checkbox').check();await occurrence.getByRole('button',{name:'אישור ביטול שיוך'}).click();await expect(occurrence).toContainText('מצב התשלום לא ידוע');await review(occurrence);await occurrence.getByLabel('ראיית תשלום לשיוך').selectOption(`${corrected.revisionId}/${corrected.transaction.allocations[0]!.id}`);await review(occurrence);await occurrence.getByRole('checkbox').check();await occurrence.getByRole('button',{name:'אישור שיוך תשלום'}).click();await expect(occurrence).toContainText('ראיית תשלום חלקית — לא הושלם');await occurrence.getByText('היסטוריית שיוך',{exact:true}).click();await expect(occurrence).toContainText(actual.revisionId);await expect(occurrence).toContainText(corrected.revisionId);
  await review(occurrence);await occurrence.getByRole('checkbox').check();await occurrence.getByRole('button',{name:'אישור ביטול שיוך'}).click();await expect(occurrence).toContainText('מצב התשלום לא ידוע');
  await obligation(page).getByRole('button',{name:'עריכת התחייבות'}).click();await form(page).getByLabel('יום בחודש').fill('15');await form(page).getByLabel('תחילת תוקף השינוי').fill('2026-10-01');await form(page).getByRole('checkbox').check();await form(page).getByRole('button',{name:'אישור ושמירה'}).click();await expect(occurrence).toHaveCount(0);
  await obligation(page).getByText('כל החלטות שיוך הראיות',{exact:true}).click();await expect(obligation(page)).toContainText(actual.revisionId);await expect(obligation(page)).toContainText(corrected.revisionId);await expect(obligation(page)).toContainText('מועד 2026-10-31');await expect(event(page,'התחייבות סינתטית','2026-10-15')).toContainText('מצב התשלום לא ידוע');
 }finally{await f.cleanup();}
});
