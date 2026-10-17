import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { manualFxFixture } from '../integration/manual-fx-fixture.mjs';
import { localAdmin, localSql, uuid, sqlText } from '../../scripts/local-supabase.mjs';
import { navigateTo } from '../navigation';

type Fixture = Awaited<ReturnType<typeof manualFxFixture>>;
async function prepare(f: Fixture) {
  const ledger=await f.fxAccount(f.a,f.households[0],'LEDGER');
  const opening=f.movement(ledger,'100','ADJUSTMENT',null,{transactionDate:'2026-10-01'});
  expect((await f.rpc(f.a,'record_transaction',{...opening,entryKind:'OPENING',openingCoverage:'COMPLETE'})).ok).toBe(true);
  const expense=await f.save(ledger,'-10','EXPENSE',null,{transactionDate:'2026-10-10',valueDate:'2026-10-12'});
  await f.account('CASH');
  return expense;
}
async function login(page: Page,f: Fixture) {
  const link=await localAdmin().auth.admin.generateLink({type:'magiclink',email:f.users[0]!.email});
  if(link.error||!link.data.properties)throw new Error('Synthetic FX login failed');
  await page.goto(`/auth/confirm#token_hash=${link.data.properties.hashed_token}&type=email`);
  await page.getByRole('button',{name:'אישור כניסה'}).click();
  await expect(page.getByRole('heading',{name:'Synthetic household A'})).toBeVisible();
  await navigateTo(page,'איכות המידע');
  await page.getByLabel('תאריך בדיקת יתרות').fill('2026-10-14');
  await page.getByLabel('חודש הדיווח').fill('2026-10');
}

test('missing historical FX intake, exact retry, canonical reevaluation and ambiguity stay honest',async({page},info)=>{
  test.setTimeout(120000);const f=await manualFxFixture();
  try {
    const expense=await prepare(f),original=JSON.stringify(expense.transaction);
    expect((await f.rpc(f.a,'record_balance',f.observation(f.fx({effectiveDate:'2026-10-09'})))).ok).toBe(true);
    // Trusted synthetic setup of a retained opposite-direction record, not a client insert.
    const reverse=f.fx({base:'ILS',quote:'USD',rate:'0.25'});
    localSql(`insert into finance.fx_evidence values('${uuid(f.households[0])}','${uuid(reverse.id)}',${sqlText(JSON.stringify(reverse))}::jsonb);`);
    await login(page,f);
    const form=page.getByRole('form',{name:'הצהרת שער USD ILS 2026-10-10',exact:true});
    const issue=page.locator('.quality-finding').filter({has:form});
    await expect(form).toBeVisible();await expect(issue).toContainText('הצהרת משתמש');
    await issue.getByText('שערים שמורים בבית',{exact:false}).click();
    await expect(issue).toContainText('תאריך אחר');await expect(issue).toContainText('כיוון הפוך');
    for(const width of [320,375,390]){
      await page.setViewportSize({width,height:850});
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
    }
    expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
    await page.screenshot({path:info.outputPath('historical-fx-before.png'),fullPage:true});
    await form.getByLabel('1 USD ביחידות ILS',{exact:true}).fill('1.1234567890123');
    await form.getByRole('checkbox').check();await form.getByRole('button',{name:'שמירת הצהרת שער',exact:true}).click();
    await expect(issue.getByRole('alert')).toContainText('עד 18 ספרות');
    await form.getByLabel('1 USD ביחידות ILS',{exact:true}).fill('3.7');
    const payloads:unknown[]=[];
    await page.route('**/rest/v1/rpc/record_manual_fx',async route=>{
      payloads.push(route.request().postDataJSON());
      if(payloads.length===1){await route.fetch();await route.abort();}else await route.continue();
    });
    await form.getByRole('button',{name:'שמירת הצהרת שער',exact:true}).click();
    await expect(issue.getByRole('alert')).toContainText('תוצאת השמירה אינה ידועה');
    await expect(form.getByRole('button',{name:'שמירת הצהרת שער',exact:true})).toBeDisabled();
    await issue.getByRole('button',{name:'ניסיון חוזר של אותה הצהרה',exact:true}).click();
    await expect(form).toHaveCount(0);expect(payloads).toHaveLength(2);expect(payloads[1]).toEqual(payloads[0]);
    await expect(page.getByText('חסרה יתרת פתיחה רשומה.',{exact:true})).toBeVisible();
    await expect(page.getByText('לא ניתן לוודא שכל החשבונות החיצוניים',{exact:false})).toBeVisible();
    await page.screenshot({path:info.outputPath('historical-fx-after.png'),fullPage:true});
    await navigateTo(page,'תמונת מצב');await page.getByLabel('תאריך שווי').fill('2026-10-14');await page.getByLabel('חודש הכנסות וצריכה').fill('2026-10');
    await expect(page.locator('article').filter({has:page.getByRole('heading',{name:'צריכה — סכום זמין',exact:true})})).toContainText('37.00 ILS');
    const snapshot=await f.rpc(f.a,'reporting_snapshot');
    expect(snapshot.snapshot.history.find((v: {transaction: {id: string}})=>v.transaction.id===expense.transaction.id).transaction.money).toEqual(expense.transaction.money);
    expect(JSON.stringify(expense.transaction)).toBe(original);
    expect(snapshot.snapshot.rates.filter((e:{rate:{effectiveDate:string;base:string}})=>e.rate.effectiveDate==='2026-10-10'&&e.rate.base==='USD')).toHaveLength(1);
    expect((await f.rpc(f.a,'record_balance',f.observation(f.fx({rate:'3.8'})))).ok).toBe(true);
    await navigateTo(page,'איכות המידע');await page.getByLabel('תאריך בדיקת יתרות').fill('2026-10-14');await page.getByLabel('חודש הדיווח').fill('2026-10');
    const ambiguous=page.locator('.quality-finding').filter({hasText:'AMBIGUOUS_FX'});
    await expect(ambiguous).toHaveCount(1);await expect(ambiguous.locator('form')).toHaveCount(0);
    await expect(ambiguous).toContainText('אין בתהליך זה בחירה, תיקון או החלפה');
    await page.screenshot({path:info.outputPath('historical-fx-ambiguous.png'),fullPage:true});
    expect(await page.evaluate(()=>({local:localStorage.length,session:sessionStorage.length}))).toEqual({local:0,session:0});
  }finally{await f.cleanup();}
});

test('delayed FX receipt after confirmed membership loss cannot restore protected intake',async({page})=>{
  test.setTimeout(90000);const f=await manualFxFixture();
  try {
    await prepare(f);await login(page,f);
    // Route arguments are untrusted; this screen uses only its authorized snapshot.
    await page.evaluate(h=>{history.pushState({},'',`/data-quality?household=${h}&account=invalid`);dispatchEvent(new PopStateEvent('popstate'));},f.households[1]);
    await expect(page.getByRole('combobox',{name:'בית',exact:true})).toHaveValue(f.households[0]!);
    const form=page.getByRole('form',{name:'הצהרת שער USD ILS 2026-10-10',exact:true});
    await form.getByLabel('1 USD ביחידות ILS',{exact:true}).fill('3.7');await form.getByRole('checkbox').check();
    let release!:()=>void,held=false;const gate=new Promise<void>(resolve=>{release=resolve;});
    await page.route('**/rest/v1/rpc/record_manual_fx',async route=>{const response=await route.fetch();held=true;await gate;await route.fulfill({response});});
    await form.getByRole('button',{name:'שמירת הצהרת שער',exact:true}).click();
    try{
      await expect.poll(()=>held).toBe(true);
      localSql(`update finance.household_members set status='REVOKED' where household_id='${uuid(f.households[0])}' and user_id='${uuid(f.users[0]!.id)}';`);
      await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
      await expect(page.getByText('אין כרגע גישה לבית.',{exact:true})).toBeVisible();
    }finally{release();}
    await expect(page.locator('.historical-fx')).toHaveCount(0);await expect(page.locator('.quality-finding')).toHaveCount(0);
  }finally{await f.cleanup();}
});
