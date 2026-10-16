import { navigateTo } from '../navigation';
import { test,expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createFixture } from '../integration/local-fixtures.mjs';
import { localAdmin,localSql,uuid } from '../../scripts/local-supabase.mjs';
import { cleanupImports } from '../../scripts/cleanup-imports.mjs';

for(const recovery of ['retry','sign-out','revocation'] as const) test(`explicit RTL import selection, warnings, atomic commit, lost response and durable evidence: ${recovery}`,async({page,context},testInfo)=>{
 test.setTimeout(120000);const fixture=await createFixture();const h=uuid(fixture.households[0]);
 try{
  await page.goto(`/auth/confirm#token_hash=${fixture.users[0]!.hash}&type=invite`);await page.getByRole('button',{name:'אישור כניסה'}).click();await expect(page.getByRole('heading',{name:'Synthetic household A'})).toBeVisible();
  await page.getByRole('link',{name:'חשבונות',exact:true}).click();const account=page.getByRole('form',{name:'חשבון חדש'});await account.getByLabel('שם החשבון').fill('Synthetic import account');await account.getByLabel('סוג חשבון').selectOption('CASH');await account.getByRole('button',{name:'יצירת חשבון'}).click();await expect(page.getByRole('heading',{name:'Synthetic import account',exact:true})).toBeVisible();
  await navigateTo(page, 'הכנת CSV');await page.getByLabel('משק בית לקובץ').selectOption({index:1});await page.getByLabel('חשבון קיים').selectOption({index:1});await page.getByLabel('מקור קיים').selectOption({index:1});await page.getByLabel('מפריד עמודות').selectOption(',');
  await page.getByLabel('קובץ CSV',{exact:true}).setInputFiles({name:'יבוא.csv',mimeType:'text/csv',buffer:Buffer.from('date,description,amount\n2026-10-02,תנועה נפרדת,10.20\n2026-10-02,תנועה נפרדת,10.20\n2026-02-31,תאריך שגוי,1\n,,')});
  await page.getByRole('button',{name:'העלאה פרטית והכנת מיפוי'}).click();const mapping=page.getByRole('form',{name:'מיפוי עמודות'});await expect(mapping).toBeVisible();
  await mapping.getByLabel('תאריך תנועה',{exact:true}).selectOption('0');await mapping.getByLabel('תיאור',{exact:true}).selectOption('1');await mapping.getByLabel('סכום חתום').selectOption('2');await mapping.getByLabel('פורמט תאריך').selectOption('YYYY-MM-DD');await mapping.getByLabel('מפריד עשרוני').selectOption('.');await mapping.getByLabel('מפריד אלפים').selectOption('NONE');await mapping.getByLabel('משמעות הסימן').selectOption('POSITIVE_INCREASES');await mapping.getByLabel('מטבע קבוע').selectOption('ILS');await mapping.getByRole('button',{name:'יצירת תצוגה מקדימה'}).click();
  await page.getByRole('button',{name:'סקירת כפילויות ובחירת שורות ליבוא'}).click();const review=page.getByRole('region',{name:'סקירה ושמירת יבוא'});await expect(review).toBeVisible();
  await mapping.getByLabel('מפריד עשרוני').selectOption(',');await expect(review).toHaveCount(0);
  await mapping.getByLabel('מפריד עשרוני').selectOption('.');await mapping.getByRole('button',{name:'יצירת תצוגה מקדימה'}).click();await page.getByRole('button',{name:'סקירת כפילויות ובחירת שורות ליבוא'}).click();await expect(review).toBeVisible();
  expect(localSql(`select count(*) from finance.transactions where household_id='${h}'`)).toBe('0');
  await expect(review.getByLabel('לכלול רשומה 4')).toBeDisabled();await expect(review.getByLabel('לכלול רשומה 5')).toBeDisabled();await expect(review.getByLabel('לכלול רשומה 2')).not.toBeChecked();
  await review.getByLabel('לכלול רשומה 2').check();await expect(review.getByRole('button',{name:'בדיקת סיכום לפני שמירה'})).toBeDisabled();await review.getByLabel('בדקתי את האזהרה ברשומה 2; זו תנועה נפרדת שיש לשמור').check();await review.getByLabel('משמעות רשומה 2').selectOption('EXPENSE');
  await review.getByLabel('לכלול רשומה 3').check();await review.getByLabel('בדקתי את האזהרה ברשומה 3; זו תנועה נפרדת שיש לשמור').check();await review.getByLabel('מצב רשומה 3').selectOption('PENDING');
  let releaseResponse=()=>{},serverCommitted=()=>{};
  const responseGate=new Promise<void>(resolve=>{releaseResponse=resolve;}),committed=new Promise<void>(resolve=>{serverCommitted=resolve;});
  let lost=false;const commands:unknown[]=[];await page.route('**/functions/v1/import-commit',async route=>{if(route.request().postDataJSON().action==='COMMIT')commands.push(route.request().postDataJSON());if(!lost&&route.request().postDataJSON().action==='COMMIT'){lost=true;await route.fetch();serverCommitted();await responseGate;await route.abort('failed');}else await route.continue();});
  await review.getByRole('button',{name:'בדיקת סיכום לפני שמירה'}).click();await expect(review.getByRole('heading',{name:'שמירת 2 תנועות כספיות'})).toBeVisible();await review.getByRole('button',{name:'אישור ושמירת יבוא'}).click();await expect(review.getByRole('button',{name:'בדיקת תוצאה וניסיון חוזר של אותה בקשה'})).toBeVisible();await expect(review.getByRole('heading',{name:'היבוא נשמר ואושר בשרת'})).toHaveCount(0);
  const retry=review.getByRole('button',{name:'בדיקת תוצאה וניסיון חוזר של אותה בקשה'});
  await test.step('focus during a committed request with its response still pending',async()=>{
   try{
    await committed;expect(localSql(`select count(*) from finance.transactions where household_id='${h}'`)).toBe('2');
    await expect(retry).toBeDisabled();await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect(retry).toBeDisabled();expect(commands).toHaveLength(1);
   }finally{releaseResponse();}
  });
  // Visibility only means a command exists; enabled means the lost response has settled.
  // Focus revalidation deliberately skips commands that are still in flight.
  await expect(retry).toBeEnabled();
  // Real second tab plus deterministic focus notification for headless/mobile emulation.
  const other=await context.newPage();await other.goto('about:blank');await other.bringToFront();
  await test.step('focus revalidation after the lost response has settled',async()=>{
   const access=page.waitForResponse(response=>response.url().includes('/rest/v1/rpc/import_evidence')&&response.ok());
   await page.bringToFront();await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await access;
   await expect(retry).toBeEnabled();
  });await other.close();
  await expect(retry).toBeEnabled();await expect(review.getByLabel('לכלול רשומה 2')).toBeChecked();expect(commands).toHaveLength(1);
  expect(await page.evaluate(async()=>({local:localStorage.length,session:sessionStorage.length,databases:(await indexedDB.databases()).length}))).toEqual({local:0,session:0,databases:0});
  if(recovery==='sign-out'){
   // Sign out through the existing household screen in another authenticated tab.
   // The import page stays mounted; global sign-out removes its live server session too.
   const logoutTab=await context.newPage();const fresh=await localAdmin().auth.admin.generateLink({type:'magiclink',email:fixture.users[0]!.email});if(fresh.error)throw new Error('Synthetic logout link unavailable');
   await logoutTab.goto(`/auth/confirm#token_hash=${fresh.data.properties.hashed_token}&type=email`);await logoutTab.getByRole('button',{name:'אישור כניסה'}).click();await expect(logoutTab.getByRole('heading',{name:'Synthetic household A'})).toBeVisible();await logoutTab.getByRole('button',{name:'יציאה',exact:true}).click();await expect(logoutTab).toHaveURL(/[/]sign-in$/);
   await page.bringToFront();await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
   await expect(review).toHaveCount(0);await expect(page.getByText('תנועה נפרדת',{exact:true})).toHaveCount(0);expect(commands).toHaveLength(1);await logoutTab.close();return;
  }
  if(recovery==='revocation'){
   localSql(`update finance.household_members set status='REVOKED' where household_id='${h}'`);
   await test.step('focus revalidation after confirmed membership revocation',async()=>{
    const revokedAccess=page.waitForResponse(response=>response.url().includes('/rest/v1/rpc/import_evidence')&&response.ok());await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await revokedAccess;
   });
   await expect(review).toHaveCount(0);await expect(page.getByRole('button',{name:'בדיקת תוצאה וניסיון חוזר של אותה בקשה'})).toHaveCount(0);await expect(page.getByText('תנועה נפרדת',{exact:true})).toHaveCount(0);await expect(page.getByText('Synthetic import account',{exact:true})).toHaveCount(0);expect(commands).toHaveLength(1);return;
  }
  expect(localSql(`select count(*) from finance.transactions where household_id='${h}'`)).toBe('2');await expect(review.getByLabel('לכלול רשומה 2')).toBeDisabled();await review.getByRole('button',{name:'בדיקת תוצאה וניסיון חוזר של אותה בקשה'}).click();await expect(review.getByRole('heading',{name:'היבוא נשמר ואושר בשרת'})).toBeVisible();await expect(review.getByText('נשמרו 2 · דולגו 0 · שגויות 1 · חסרות מידע 1')).toBeVisible();
  expect(commands).toHaveLength(2);expect(commands[1]).toEqual(commands[0]);
  expect(localSql(`select count(*) from finance.transactions where household_id='${h}'`)).toBe('2');expect(localSql(`select count(*) from finance.transaction_allocations where household_id='${h}' and payload->'categorization'='{"origin":"UNCLASSIFIED","userLocked":false}'`)).toBe('2');expect(localSql(`select count(*) from finance.transaction_revisions where household_id='${h}' and status='PENDING'`)).toBe('1');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);expect(await page.evaluate(()=>({local:localStorage.length,session:sessionStorage.length}))).toEqual({local:0,session:0});
  await page.screenshot({path:`.artifacts/task8-${testInfo.project.name}.png`,fullPage:true});
  await review.evaluate(element=>element.scrollIntoView({block:'start'}));await page.screenshot({path:`.artifacts/task8-review-${testInfo.project.name}.png`});
  await page.getByRole('link',{name:'תנועות ויתרות',exact:true}).click();await expect(page.getByText('יתרה לא ידועה — חסרה יתרת פתיחה פעילה.')).toBeVisible();
  const financial=page.getByRole('form',{name:'תנועה ידנית'});await financial.getByLabel('סוג רישום').selectOption('OPENING');await financial.getByLabel('תאריך התנועה').fill('2026-10-01');await financial.getByLabel('תיאור',{exact:true}).fill('Synthetic opening');await financial.getByLabel('סכום התנועה ב־ILS').fill('100');await financial.getByLabel('סכום חלוקה 1').fill('100');await financial.getByRole('button',{name:'שמירת תנועה'}).click();await page.getByLabel('יתרה לתאריך').fill('2026-10-05');await expect(page.getByText('יתרה מחושבת:')).toContainText('110.20 ILS');
  const posted=page.locator('li.account-card').filter({hasText:'הוצאה / החזר הוצאה'});await posted.getByRole('button',{name:'תיקון / ביטול תנועה נפרדת'}).click();await financial.getByLabel('סכום התנועה ב־ILS').fill('7.5');await financial.getByLabel('סכום חלוקה 1').fill('7.5');await financial.getByLabel('סיבת התיקון / הערה').fill('Synthetic imported correction');await financial.getByRole('button',{name:'שמירת תנועה'}).click();await expect(page.getByText('יתרה מחושבת:')).toContainText('107.50 ILS');
  expect(localSql(`select count(*) from finance.transaction_revisions where household_id='${h}' and version=2 and body->'provenance'->0->'source'->>'kind'='FILE_IMPORT'`)).toBe('1');
  await navigateTo(page, 'הכנת CSV');
  localSql(`update finance.import_uploads set expires_at=now()-interval '1 minute' where household_id='${h}'`);await cleanupImports();await page.getByRole('button',{name:'רענון קבצים זמניים'}).click();const evidence=page.getByRole('region',{name:'תיעוד יבוא שנשמר'});await expect(evidence.getByText('2 תנועות · Synthetic import account',{exact:true})).toBeVisible();await evidence.getByText('2 תנועות · Synthetic import account',{exact:true}).click();await expect(evidence.getByText('נשמרו 2 · דולגו 0 · שגויות 1 · חסרות מידע 1')).toBeVisible();expect(localSql(`select count(*) from finance.import_uploads where household_id='${h}'`)).toBe('0');expect(localSql(`select count(*) from finance.import_rows where household_id='${h}'`)).toBe('2');
 }finally{await fixture.cleanup();}
});
