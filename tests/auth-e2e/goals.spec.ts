import { test,expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { randomUUID } from 'node:crypto';
import { goalFixture } from '../integration/goal-fixture.mjs';
import { localAdmin,localSql,uuid } from '../../scripts/local-supabase.mjs';
import { navigateTo } from '../navigation';
type Fixture=Awaited<ReturnType<typeof goalFixture>>;
async function login(page:import('@playwright/test').Page,f:Fixture){
 const link=await localAdmin().auth.admin.generateLink({type:'magiclink',email:f.users[0]!.email});
 if(link.error||!link.data.properties)throw new Error('Synthetic goal login failed');
 await page.goto(`/auth/confirm#token_hash=${link.data.properties.hashed_token}&type=email`);await page.getByRole('button',{name:'אישור כניסה'}).click();
 await expect(page.getByRole('heading',{name:'Synthetic household A'})).toBeVisible();await navigateTo(page,'יעדים');await expect(page.getByRole('button',{name:'הוספת יעד'})).toBeVisible();
}
async function fill(page:import('@playwright/test').Page,name='מקדמה לבית'){
 const basis=await page.evaluate(()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jerusalem',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()));
 const deadline=`${Number(basis.slice(0,4))+1}${basis.slice(4,7)}-28`;
 await page.getByLabel('שם היעד',{exact:true}).fill(name);await page.getByLabel('סכום היעד',{exact:true}).fill('30000');
 await page.getByLabel('סכום שהוגדר ידנית כמוקצה ליעד',{exact:true}).fill('6000');await page.getByLabel('תאריך יעד (רשות)').fill(deadline);
 await page.getByRole('checkbox').check();
}
const card=(page:import('@playwright/test').Page,name='מקדמה לבית')=>page.getByRole('article',{name,exact:true});
test('shared goal creation, explicit progress edit, history and archive on mobile RTL',async({page},info)=>{
 test.setTimeout(90000);const f=await goalFixture();
 try{
  await login(page,f);await expect(page.getByText('עדיין אין יעדים פעילים.',{exact:false})).toBeVisible();
  await page.getByText('איך מחושב החיסכון החודשי?',{exact:true}).click();await expect(page.getByText('החישוב מתייחס לסוף חודש היעד, גם אם נבחר בו יום מוקדם יותר.',{exact:false})).toBeVisible();await page.getByText('איך מחושב החיסכון החודשי?',{exact:true}).click();
  await page.setViewportSize({width:320,height:850});await page.getByRole('button',{name:'הוספת יעד'}).click();await fill(page);await page.getByLabel('הפקדה חודשית מתוכננת (רשות)').fill('1500');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
  await page.screenshot({path:info.outputPath('goals-form-320-rtl.png'),fullPage:true});
  await page.getByLabel('הפקדה חודשית מתוכננת (רשות)').press('Enter');
  await expect(card(page)).toContainText('24000.00 ILS');await expect(card(page)).toContainText('חיסכון חודשי נדרש: 2000.00 ILS');await expect(card(page)).toContainText('20%');await expect(card(page)).toContainText('מימון בנקאי לא אומת');
  for(const width of [320,375,390,1280]){
   await page.setViewportSize({width,height:850});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
   expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
   await page.screenshot({path:info.outputPath(`goals-${width}-rtl.png`),fullPage:true});
  }
  await card(page).getByRole('button',{name:'עריכת יעד'}).click();await page.getByLabel('סכום שהוגדר ידנית כמוקצה ליעד',{exact:true}).fill('8000');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'שמירת יעד',exact:true}).click();
  await expect(card(page)).toContainText('22000.00 ILS');await card(page).getByText('היסטוריית היעד',{exact:true}).click();await expect(card(page)).toContainText('גרסה 1');await expect(card(page)).toContainText('גרסה 2');
  await card(page).getByRole('button',{name:'העברה לארכיון'}).click();await page.getByRole('button',{name:'אישור ארכיון',exact:true}).click();await page.getByText('יעדים בארכיון',{exact:true}).click();
  await expect(card(page)).toContainText('יעד בארכיון');await expect(card(page).getByRole('button',{name:'עריכת יעד'})).toHaveCount(0);await card(page).getByText('היסטוריית היעד',{exact:true}).click();await expect(card(page)).toContainText('גרסה 3');
  expect(await page.evaluate(()=>({local:localStorage.length,session:sessionStorage.length}))).toEqual({local:0,session:0});
 }finally{await f.cleanup();}
});
test('personal attribution without accounts, optional deadline and known declared zero',async({page})=>{
 const f=await goalFixture();try{
  await login(page,f);await page.getByRole('button',{name:'הוספת יעד'}).click();await fill(page,'טיול אישי');await page.getByRole('combobox',{name:'ייחוס היעד',exact:true}).selectOption('MEMBER');await page.getByRole('combobox',{name:'חבר בית',exact:true}).selectOption(f.memberId);
  await page.getByRole('combobox',{name:'מטבע',exact:true}).selectOption('EUR');await page.getByLabel('סכום שהוגדר ידנית כמוקצה ליעד',{exact:true}).fill('0');await page.getByLabel('תאריך יעד (רשות)').fill('');
  await page.getByRole('button',{name:'שמירת יעד',exact:true}).click();await expect(card(page,'טיול אישי')).toContainText('אישי — Synthetic peer');await expect(card(page,'טיול אישי')).toContainText('0.00 EUR');await expect(card(page,'טיול אישי')).toContainText('אין תאריך יעד');
  const snapshot=(await f.rpc(f.peer,'goals_snapshot')).snapshot;expect(snapshot.revisions[0].name).toBe('טיול אישי');expect(snapshot.revisions[0].ownership.memberId).toBe(f.memberId);
 }finally{await f.cleanup();}
});
test('lost response exact retry and stale edit require explicit fresh review',async({page})=>{
 const f=await goalFixture();try{
  await login(page,f);let body:unknown=null,lost=false;
  await page.route('**/rest/v1/rpc/save_goal',async route=>{const data=route.request().postDataJSON();if(!lost){body=data;await route.fetch();lost=true;await route.abort('failed');}else{expect(data).toEqual(body);await route.continue();}});
  await page.getByRole('button',{name:'הוספת יעד'}).click();await fill(page);await page.getByRole('button',{name:'שמירת יעד',exact:true}).click();await expect(page.getByText('תוצאת השמירה אינה ידועה.',{exact:false})).toBeVisible();
  await expect(page.getByRole('button',{name:'שמירת יעד',exact:true})).toBeDisabled();await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await page.getByRole('button',{name:'ניסיון חוזר של אותה שמירה'}).click();await expect(card(page)).toBeVisible();expect(localSql(`select count(*) from finance.goal_revisions where household_id='${uuid(f.households[0])}';`)).toBe('1');
  await page.unroute('**/rest/v1/rpc/save_goal');await card(page).getByRole('button',{name:'עריכת יעד'}).click();
  const r=(await f.rpc(f.a,'goals_snapshot')).snapshot.revisions[0];const {version,status,actorMemberId,recordedAt,...fields}=r;void status;void actorMemberId;void recordedAt;
  expect((await f.rpc(f.peer,'save_goal',{...fields,expectedVersion:version,action:'EDIT',declared:{amount:'9000',currency:'ILS'},acknowledge:true,idempotencyKey:randomUUID()})).ok).toBe(true);
  await page.getByLabel('סכום שהוגדר ידנית כמוקצה ליעד',{exact:true}).fill('7000');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'שמירת יעד',exact:true}).click();await expect(page.getByText('השמירה נדחתה.',{exact:false})).toBeVisible();await expect(card(page)).toContainText('9000.00 ILS');
 }finally{await f.cleanup();}
});
test('network revalidation, revocation and delayed responses cannot restore goals',async({page})=>{
 const f=await goalFixture();try{
  expect((await f.rpc(f.a,'save_goal',f.command())).ok).toBe(true);await login(page,f);await expect(card(page,'Home down payment')).toBeVisible();
  await page.route('**/rest/v1/rpc/goals_snapshot',r=>r.abort('failed'));await page.getByRole('button',{name:'רענון יעדים'}).click();await expect(page.getByRole('alert')).toBeVisible();await expect(card(page,'Home down payment')).toHaveCount(0);await page.unroute('**/rest/v1/rpc/goals_snapshot');
  await page.getByRole('button',{name:'רענון יעדים'}).click();await expect(card(page,'Home down payment')).toBeVisible();
  let release!:()=>void,intercepted=false;const gate=new Promise<void>(resolve=>{release=resolve;});
  await page.route('**/rest/v1/rpc/goals_snapshot',async route=>{if(intercepted){await route.continue();return;}const response=await route.fetch();intercepted=true;await gate;await route.fulfill({response});});
  await page.getByRole('button',{name:'רענון יעדים'}).click();
  try{await expect.poll(()=>intercepted).toBe(true);localSql(`update finance.household_members set status='REVOKED' where household_id='${uuid(f.households[0])}' and user_id='${uuid(f.users[0]!.id)}';`);await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect(page.getByText('אין כרגע גישה לבית.',{exact:true})).toBeVisible();}finally{release();}
  await expect(card(page,'Home down payment')).toHaveCount(0);await navigateTo(page,'הבית המשותף');await page.getByRole('button',{name:'יציאה',exact:true}).click();await expect(page).toHaveURL(/\/sign-in/);await page.goto('/goals');await expect(page).toHaveURL(/\/sign-in/);
 }finally{await f.cleanup();}
});
test('late saved receipt cannot restore protected goal after membership loss',async({page})=>{
 const f=await goalFixture();let release=()=>{};try{
  await login(page,f);let intercepted=false;const gate=new Promise<void>(resolve=>{release=resolve;});
  await page.route('**/rest/v1/rpc/save_goal',async route=>{const response=await route.fetch();intercepted=true;await gate;await route.fulfill({response});});
  await page.getByRole('button',{name:'הוספת יעד'}).click();await fill(page);await page.getByRole('button',{name:'שמירת יעד',exact:true}).click();await expect.poll(()=>intercepted).toBe(true);
  localSql(`update finance.household_members set status='REVOKED' where household_id='${uuid(f.households[0])}' and user_id='${uuid(f.users[0]!.id)}';`);await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect(page.getByText('אין כרגע גישה לבית.',{exact:true})).toBeVisible();release();await expect(card(page)).toHaveCount(0);await expect(page.getByRole('button',{name:'ניסיון חוזר של אותה שמירה'})).toHaveCount(0);
 }finally{release();await f.cleanup();}
});
