import { navigateTo } from '../navigation';
import { test,expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createFixture } from '../integration/local-fixtures.mjs';
import { localSql,uuid } from '../../scripts/local-supabase.mjs';
test('CSV private upload, explicit RTL mapping, safe preview, retry and cancellation',async({page},testInfo)=>{
 test.setTimeout(90000);page.setDefaultTimeout(10000);const fixture=await createFixture();
 try{
  const user=fixture.users[0]!;await page.goto(`/auth/confirm#token_hash=${user.hash}&type=invite`);await page.getByRole('button',{name:'אישור כניסה'}).click();await expect(page.getByRole('heading',{name:'Synthetic household A'})).toBeVisible();
  await page.getByRole('link',{name:'חשבונות',exact:true}).click();const account=page.getByRole('form',{name:'חשבון חדש'});await account.getByLabel('שם החשבון').fill('Synthetic CSV account');await account.getByLabel('סוג חשבון').selectOption('CASH');await account.getByRole('button',{name:'יצירת חשבון'}).click();await expect(page.getByRole('heading',{name:'Synthetic CSV account',exact:true})).toBeVisible();
  const before=localSql(`select jsonb_build_array((select jsonb_agg(to_jsonb(t)) from finance.account_sources t where household_id='${uuid(fixture.households[0])}'),(select count(*) from finance.transaction_revisions where household_id='${uuid(fixture.households[0])}'))`);
  await navigateTo(page, 'הכנת CSV');await page.getByLabel('משק בית לקובץ').selectOption({index:1});await page.getByLabel('חשבון קיים').selectOption({label:'Synthetic CSV account · ILS'});await page.getByLabel('מקור קיים').selectOption({index:1});await page.getByLabel('מפריד עמודות').selectOption(',');
  await page.getByLabel('קובץ CSV', {exact:true}).setInputFiles({name:'בדיקה.csv',mimeType:'text/csv',buffer:Buffer.from('\uFEFFתאריך,תיאור,סכום\n01/02/2026,"שלום ""עולם""\nשורה",-10.20\n31/02/2026,<script>alert(1)</script>,1\n,,')});
  let uploadLost=false;await page.route('**/storage/v1/object/import-preview/**',async route=>{if(!uploadLost&&route.request().method()==='POST'){uploadLost=true;await route.fetch();await route.abort('failed');}else await route.continue();});
  await page.getByRole('button',{name:'העלאה פרטית והכנת מיפוי'}).click();await expect(page.getByRole('button',{name:'בדיקת מצב הבקשה לפני ניסיון חוזר'})).toBeVisible();await expect(page.getByText('הפעולה לא הושלמה',{exact:false})).toBeVisible();await page.getByRole('button',{name:'בדיקת מצב הבקשה לפני ניסיון חוזר'}).click();await page.getByRole('button',{name:'מיפוי בדיקה.csv'}).click();const mapping=page.getByRole('form',{name:'מיפוי עמודות'});await expect(mapping).toBeVisible();
  await mapping.getByLabel('תאריך תנועה',{exact:true}).selectOption('0');await mapping.getByLabel('תיאור',{exact:true}).selectOption('1');await mapping.getByLabel('סכום חתום').selectOption('2');await mapping.getByLabel('פורמט תאריך').selectOption('DD/MM/YYYY');await mapping.getByLabel('מפריד עשרוני').selectOption('.');await mapping.getByLabel('מפריד אלפים').selectOption(',');await mapping.getByLabel('משמעות הסימן').selectOption('POSITIVE_INCREASES');await mapping.getByLabel('מטבע קבוע').selectOption('ILS');
  let lost=false;await page.route('**/functions/v1/import-preview',async route=>{if(!lost){lost=true;await route.fetch();await route.abort('failed');}else await route.continue();});
  await mapping.getByRole('button',{name:'יצירת תצוגה מקדימה'}).click();await expect(page.getByText('הפעולה לא הושלמה', {exact:false})).toBeVisible();await mapping.getByRole('button',{name:'יצירת תצוגה מקדימה'}).click();
  await expect(page.getByText('סה״כ 3 · תקינות 1 · שגויות 1 · חסרות מידע 1')).toBeVisible();await expect(page.getByText('רשומה 2 · שורות מקור 2–3')).toBeVisible();await expect(page.getByText('<script>alert(1)</script>',{exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(await page.locator('html').getAttribute('dir')).toBe('rtl');expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
  expect(await page.evaluate(()=>({local:localStorage.length,session:sessionStorage.length}))).toEqual({local:0,session:0});
  await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:`.artifacts/task7-${testInfo.project.name}.png`,fullPage:true});
  expect(localSql(`select jsonb_build_array((select jsonb_agg(to_jsonb(t)) from finance.account_sources t where household_id='${uuid(fixture.households[0])}'),(select count(*) from finance.transaction_revisions where household_id='${uuid(fixture.households[0])}'))`)).toBe(before);
  await mapping.getByLabel('פורמט תאריך').selectOption('MM/DD/YYYY');await expect(page.getByRole('region',{name:'תוצאות תצוגה מקדימה'})).toHaveCount(0);
  await page.getByRole('button',{name:'רענון קבצים זמניים'}).click();await expect(page.getByRole('button',{name:'מיפוי בדיקה.csv'})).toBeVisible();await expect(mapping).toHaveCount(0);
  await page.getByRole('button',{name:'ביטול ומחיקת בדיקה.csv'}).click();await expect(page.getByText('הקובץ והרשומה הזמנית נמחקו.',{exact:false})).toBeVisible();await expect(page.getByRole('button',{name:'מיפוי בדיקה.csv'})).toHaveCount(0);
 }finally{await fixture.cleanup();}
});
