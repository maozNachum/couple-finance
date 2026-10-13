import {test,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import {reconciliationFixture} from '../integration/reconciliation-fixture.mjs';
import {localAdmin,localSql,uuid} from '../../scripts/local-supabase.mjs';
test.use({actionTimeout:10_000});
test('explicit RTL transfer, uncertain result recovery, immutable history, unlink and revocation',async({page},testInfo)=>{
 test.setTimeout(120_000);const f=await reconciliationFixture();
 try{
  const bank=await f.account(),other=await f.account('SAVINGS');
  await f.save(bank,'-2000','TRANSFER',null,{description:'Synthetic outgoing'});
  await f.save(other,'2000','TRANSFER',null,{description:'Synthetic incoming'});
  const login=await localAdmin().auth.admin.generateLink({type:'magiclink',email:f.users[0]!.email});if(login.error||!login.data.properties)throw new Error('Synthetic login');
  await page.goto(`/auth/confirm#token_hash=${login.data.properties.hashed_token}&type=email`);
  await page.getByRole('button',{name:'אישור כניסה'}).click();await expect(page.getByRole('heading',{name:'Synthetic household A'})).toBeVisible();
  await page.getByRole('link',{name:'התאמת תנועות',exact:true}).click();
  await page.getByLabel('משק בית להתאמה').selectOption(f.households[0]!);await page.getByLabel('חשבון מקור').selectOption(bank.account.id);
  await page.getByLabel('תנועה יוצאת קיימת').selectOption({label:'Synthetic outgoing · 2026-10-02 · -2000 ILS'});
  await page.getByRole('button',{name:'בחירת Synthetic incoming',exact:true}).click();
  await page.getByLabel('ראיה וסיבת ההחלטה').fill('Synthetic explicit transfer confirmation');
  const confirm=page.getByRole('button',{name:'אישור ושמירת הקשר',exact:true});await expect(confirm).toBeDisabled();
  await page.getByRole('checkbox',{name:'סקרתי את הראיות',exact:false}).check();await expect(confirm).toBeEnabled();
  const errors=await new AxeBuilder({page}).analyze();expect(errors.violations).toEqual([]);
  expect(await page.locator('html').getAttribute('dir')).toBe('rtl');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.screenshot({path:testInfo.outputPath('reconciliation-review.png'),fullPage:true});
  let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});let intercepted=false;
  const requests:unknown[]=[];page.on('request',r=>{if(r.url().endsWith('/rest/v1/rpc/reconcile'))requests.push(r.postDataJSON().payload);});
  await page.route('**/rest/v1/rpc/reconcile',async route=>{if(intercepted){await route.continue();return;}intercepted=true;const response=await route.fetch();expect(response.ok()).toBe(true);await gate;await route.abort('failed');});
  await confirm.click();const retry=page.getByRole('button',{name:'ניסיון חוזר לאותה התאמה',exact:true});
  try{await expect(retry).toBeDisabled();await expect.poll(()=>localSql(`select count(*) from finance.reconciliation_decisions where household_id='${uuid(f.households[0])}';`)).toBe('1');await page.evaluate(()=>window.dispatchEvent(new Event('focus')));expect(requests).toHaveLength(1);}finally{release();}
  await expect(retry).toBeEnabled();
  await page.route('**/auth/v1/user',route=>route.fulfill({status:429,contentType:'application/json',body:JSON.stringify({code:'over_request_rate_limit',msg:'Synthetic transient rate limit'})}));
  const transient=page.waitForResponse(r=>r.url().endsWith('/auth/v1/user')&&r.status()===429);
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await transient;
  await expect(page.getByText('לא ניתן לאמת מחדש את המידע.',{exact:false})).toBeVisible();await expect(retry).toBeEnabled();expect(requests).toHaveLength(1);
  await page.unroute('**/auth/v1/user');
  const revalidated=page.waitForResponse(r=>r.url().endsWith('/rest/v1/rpc/reconciliation_snapshot'));
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await revalidated;await expect(retry).toBeEnabled();expect(requests).toHaveLength(1);
  await retry.click();await expect(page.getByText('הקשר נשמר בשרת. לא שונו תנועות או יתרות.',{exact:true})).toBeVisible();
  expect(requests).toHaveLength(2);expect(requests[0]).toEqual(requests[1]);
  expect(localSql(`select count(*) from finance.transaction_revisions where household_id='${uuid(f.households[0])}';`)).toBe('2');
  await page.getByText('אישור הסרה מפורשת',{exact:true}).click();await page.getByRole('button',{name:'אישור הסרת הקשר',exact:true}).click();
  await expect(page.getByText('הקשר הוסר. ההיסטוריה נשמרה.',{exact:true})).toBeVisible();
  expect(localSql(`select count(*) from finance.reconciliation_decisions where household_id='${uuid(f.households[0])}';`)).toBe('2');
  await page.getByText('היסטוריית החלטות וראיות מקור',{exact:true}).click();await expect(page.locator('details[open]').getByText('Synthetic outgoing',{exact:false}).first()).toBeVisible();
  expect(await page.evaluate(()=>({local:localStorage.length,session:sessionStorage.length}))).toEqual({local:0,session:0});
  localSql(`update finance.household_members set status='REVOKED' where household_id='${uuid(f.households[0])}';`);
  await page.getByRole('button',{name:'רענון התאמות והרשאות',exact:true}).click();await expect(page.getByText('הגישה אינה זמינה.',{exact:false})).toBeVisible();
  await expect(page.getByText('Synthetic outgoing',{exact:false})).toHaveCount(0);
 }finally{await f.cleanup();}
});

test('card purchases and loan components require explicit meaning and posted evidence',async({page})=>{
 test.setTimeout(90_000);const f=await reconciliationFixture();
 try{
  const bank=await f.account(),card=await f.account('CREDIT_CARD'),loan=await f.account('LOAN');
  const payment=await f.save(bank,'-100','TRANSFER',null,{description:'Synthetic card payment'});
  const purchase=await f.save(card,'-100','EXPENSE',null,{description:'Synthetic card purchase'});
  await f.save(card,'-100','EXPENSE',null,{status:'PENDING',description:'Synthetic pending authorization'});
  const parts=([['-80','DEBT_PRINCIPAL'],['-15','EXPENSE'],['-5','EXPENSE']] as const).map(([amount,effect])=>({id:randomUUID(),effect,money:{amount,currency:'ILS'},ownership:{kind:'HOUSEHOLD'},categorization:{origin:'USER',userLocked:true}}));
  const repayment=await f.save(bank,'-100','DEBT_PRINCIPAL',parts,{description:'Synthetic loan payment'});
  const principal=await f.save(loan,'80','DEBT_PRINCIPAL',null,{description:'Synthetic principal'});
  const login=await localAdmin().auth.admin.generateLink({type:'magiclink',email:f.users[0]!.email});if(login.error||!login.data.properties)throw new Error('Synthetic login');
  await page.goto(`/auth/confirm#token_hash=${login.data.properties.hashed_token}&type=email`);await page.getByRole('button',{name:'אישור כניסה'}).click();
  await expect(page.getByRole('heading',{name:'Synthetic household A'})).toBeVisible();await page.getByRole('link',{name:'התאמת תנועות',exact:true}).click();
  await page.getByLabel('משק בית להתאמה').selectOption(f.households[0]!);await page.getByLabel('סוג התאמה').selectOption('CARD');await page.getByLabel('חשבון מקור').selectOption(bank.account.id);
  await page.getByLabel('תנועה יוצאת קיימת').selectOption(payment.transaction.id);await expect(page.getByRole('checkbox',{name:'Synthetic pending authorization',exact:false})).toHaveCount(0);
  await page.getByRole('checkbox',{name:'Synthetic card purchase',exact:false}).check();await page.getByLabel('ראיה וסיבת ההחלטה').fill('Synthetic statement evidence');
  await page.getByRole('checkbox',{name:'סקרתי את הראיות',exact:false}).check();await page.getByRole('button',{name:'אישור ושמירת הקשר',exact:true}).click();
  await expect(page.getByText('הקשר נשמר בשרת. לא שונו תנועות או יתרות.',{exact:true})).toBeVisible();
  expect(localSql(`select payload->>'effect' from finance.transaction_allocations where revision_id='${uuid(purchase.revisionId)}';`)).toBe('EXPENSE');
  await page.getByLabel('סוג התאמה').selectOption('LOAN');await page.getByLabel('תנועה יוצאת קיימת').selectOption(repayment.transaction.id);
  await page.getByLabel('ראיה נגדית מפורשת').selectOption(principal.transaction.id);
  await page.getByLabel('ראיה וסיבת ההחלטה').fill('Synthetic explicit principal interest and fee evidence');
  const confirm=page.getByRole('button',{name:'אישור ושמירת הקשר',exact:true});await expect(confirm).toBeDisabled();
  for(const [i,meaning] of ['PRINCIPAL','INTEREST','FEE'].entries())await page.getByRole('combobox',{name:`משמעות חלוקה ${i+1} בתנועה Synthetic loan payment`,exact:true}).selectOption(meaning);
  await page.getByRole('combobox',{name:'משמעות חלוקה 1 בתנועה Synthetic principal',exact:true}).selectOption('PRINCIPAL');
  await page.getByRole('checkbox',{name:'סקרתי את הראיות',exact:false}).check();await expect(confirm).toBeEnabled();
  expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);await confirm.click();
  await expect.poll(()=>localSql(`select count(*) from finance.reconciliations where household_id='${uuid(f.households[0])}';`)).toBe('2');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 }finally{await f.cleanup();}
});

for(const recovery of ['sign-out','revocation'] as const)test(`uncertain reconciliation clears protected content on ${recovery}`,async({page})=>{
 test.setTimeout(90_000);const f=await reconciliationFixture();
 try{
  const bank=await f.account();const payment=await f.save(bank,'-9','TRANSFER',null,{description:'Synthetic protected payment'});
  const login=await localAdmin().auth.admin.generateLink({type:'magiclink',email:f.users[0]!.email});if(login.error||!login.data.properties)throw new Error('Synthetic login');
  await page.goto(`/auth/confirm#token_hash=${login.data.properties.hashed_token}&type=email`);await page.getByRole('button',{name:'אישור כניסה'}).click();
  await expect(page.getByRole('heading',{name:'Synthetic household A'})).toBeVisible();await page.getByRole('link',{name:'התאמת תנועות',exact:true}).click();
  await page.getByLabel('משק בית להתאמה').selectOption(f.households[0]!);await page.getByLabel('חשבון מקור').selectOption(bank.account.id);await page.getByLabel('תנועה יוצאת קיימת').selectOption(payment.transaction.id);
  await page.getByLabel('ראיה וסיבת ההחלטה').fill('Explicit one-sided evidence');await page.getByRole('checkbox',{name:'סקרתי את הראיות',exact:false}).check();
  await page.route('**/rest/v1/rpc/reconcile',async route=>{const response=await route.fetch();expect(response.ok()).toBe(true);await route.abort('failed');});
  await page.getByRole('button',{name:'אישור ושמירת הקשר',exact:true}).click();await expect(page.getByRole('button',{name:'ניסיון חוזר לאותה התאמה',exact:true})).toBeEnabled();
  if(recovery==='revocation'){
   localSql(`update finance.household_members set status='REVOKED' where household_id='${uuid(f.households[0])}';`);
   await page.getByRole('button',{name:'רענון התאמות והרשאות',exact:true}).click();await expect(page.getByText('הגישה אינה זמינה.',{exact:false})).toBeVisible();
  }else{
   await page.getByRole('link',{name:'הבית המשותף',exact:true}).click();await page.getByRole('button',{name:'יציאה',exact:true}).click();
   await expect(page.getByRole('heading',{name:'כניסה למרחב המשותף',exact:true})).toBeVisible();
   await page.getByRole('link',{name:'התאמת תנועות',exact:true}).click();
   // The SDK may emit SIGNED_OUT during getUser, or getUser may return the
   // confirmed missing-session error. Both outcomes must remove all evidence.
   await expect(page.getByRole('heading',{name:'כניסה למרחב המשותף',exact:true}).or(page.getByText('הגישה אינה זמינה.',{exact:false}))).toBeVisible();
  }
  await expect(page.getByText('Synthetic protected payment',{exact:false})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'ניסיון חוזר לאותה התאמה',exact:true})).toHaveCount(0);
  expect(localSql(`select count(*) from finance.reconciliations where household_id='${uuid(f.households[0])}';`)).toBe('1');
  expect(await page.evaluate(()=>({local:localStorage.length,session:sessionStorage.length}))).toEqual({local:0,session:0});
 }finally{await f.cleanup();}
});
