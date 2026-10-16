import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import { accountRecordSchema, observationSchema } from '@finance/contracts/valuation';
import { transactionRevisionSchema } from '@finance/contracts/ledger';
import { AccountDetails } from './AccountDetails';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const record = accountRecordSchema.parse({account:{id:id(1),householdId:id(2),name:'Synthetic card',ownership:{kind:'HOUSEHOLD'},type:'CREDIT_CARD',currency:'USD',valuationCurrency:'ILS',balancePolicy:'LEDGER',status:'ACTIVE'},version:1,manualSourceId:id(3),sources:[{id:id(3),accountId:id(1),householdId:id(2),kind:'MANUAL',authoritativeFrom:'0001-01-01'}]});
const opening = transactionRevisionSchema.parse({revisionId:id(4),version:1,supersedesRevisionId:null,entryKind:'OPENING',openingCoverage:'PARTIAL',reason:'',createdAt:'2026-10-01T00:00:00Z',recordedAt:'2026-10-01T00:00:00Z',transaction:{id:id(5),accountId:id(1),householdId:id(2),transactionDate:'2026-10-01',description:'Synthetic opening',money:{amount:'-100',currency:'USD'},status:'POSTED',provenance:[{source:{sourceId:id(3),kind:'MANUAL'}}],allocations:[{id:id(6),effect:'ADJUSTMENT',money:{amount:'-100',currency:'USD'},ownership:{kind:'HOUSEHOLD'},categorization:{origin:'UNCLASSIFIED',userLocked:false}}]}});

function view(props: Partial<Parameters<typeof AccountDetails>[0]> = {}) {
  render(<MemoryRouter><AccountDetails record={record} history={[]} ledgerHistory={[]} asOf="2026-10-16" owner="משותף לבית" busy={false} command={vi.fn()} {...props} /></MemoryRouter>);
}
it('missing evidence stays unknown and intake links carry exact account context', () => {
  view();
  expect(screen.getByText(/אין יתרת פתיחה פעילה/)).toBeVisible();
  expect(screen.queryByText('0.00 USD')).not.toBeInTheDocument();
  expect(screen.getByRole('link',{name:'לרישום תנועות ויתרת פתיחה'})).toHaveAttribute('href',`/transactions?household=${id(2)}&account=${id(1)}`);
  expect(screen.getByRole('link',{name:'ייבוא CSV לחשבון זה'})).toHaveAttribute('href',`/imports?household=${id(2)}&account=${id(1)}`);
});
it('partial negative card opening retains its sign and original currency', () => {
  view({ledgerHistory:[opening]});
  expect(screen.getByText(/יתרה חלקית — חסרים נתונים/)).toHaveTextContent('-100.00 USD');
  expect(screen.getByText(/יתרת פתיחה מ־2026-10-01/)).toBeVisible();
});
it('before-opening is distinguished from missing opening', () => {
  view({ledgerHistory:[opening],asOf:'2026-09-30'});
  expect(screen.getByText(/התאריך קודם ליתרת הפתיחה/)).toBeVisible();
  expect(screen.queryByText(/אין יתרת פתיחה פעילה/)).not.toBeInTheDocument();
});
it.each(['PARTIAL','COMPLETE'])('observed %s is dated evidence, keeps missing FX and does not become a ledger', coverage => {
  const observed=accountRecordSchema.parse({...record,account:{...record.account,type:'SAVINGS',balancePolicy:'OBSERVED'}});
  const observation=observationSchema.parse({id:id(7),accountId:id(1),householdId:id(2),sourceId:id(3),date:'2026-10-01',recordedAt:'2026-10-02T00:00:00Z',money:{amount:'250',currency:'USD'},coverage,supersedesId:null,note:'Synthetic measurement',fx:null});
  view({record:observed,history:[observation]});
  expect(screen.getByText(/תצפית אחרונה ל־2026-10-01/)).toHaveTextContent('250.00 USD');
  expect(screen.getByText('חסר שער חליפין לתאריך התצפית.')).toBeVisible();
  expect(screen.getByText(/התצפית קודמת לתאריך/)).toBeVisible();
  expect(screen.getByText(/תנועות וייבוא אינם משנים/)).toBeVisible();
  expect(screen.getByText(coverage==='PARTIAL'?/שווי חלקי — חסרים רכיבים/:/הצהרת המדווח על רכיבי המדידה בלבד/)).toBeVisible();
});
it('archived ledger exposes history without intake or write controls', () => {
  view({record:accountRecordSchema.parse({...record,account:{...record.account,status:'ARCHIVED'}})});
  expect(screen.getByRole('link',{name:'לצפייה בהיסטוריית התנועות'})).toBeVisible();
  expect(screen.queryByRole('link',{name:'ייבוא CSV לחשבון זה'})).not.toBeInTheDocument();
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});
