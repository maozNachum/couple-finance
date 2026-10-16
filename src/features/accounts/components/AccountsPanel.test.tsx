import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import { accountRecordsSchema } from '@finance/contracts/valuation';
import { householdListSchema } from '@finance/contracts/household';
import { loadAccounts } from '../api/accounts';
import { AccountsPanel } from './AccountsPanel';

vi.mock('../api/accounts', () => ({ loadAccounts: vi.fn(), accountCommand: vi.fn() }));
vi.mock('@/shared/infrastructure/supabase-client', () => ({ browserClient: () => null }));
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const accounts=accountRecordsSchema.parse([1,2].map(n=>({account:{id:id(n),householdId:id(n+10),name:`Synthetic account ${n}`,type:'BANK',currency:'ILS',valuationCurrency:'ILS',status:'ACTIVE',balancePolicy:'LEDGER',ownership:{kind:'HOUSEHOLD'}},version:1,manualSourceId:id(n+20),sources:[{id:id(n+20),accountId:id(n),householdId:id(n+10),kind:'MANUAL',authoritativeFrom:'0001-01-01'}]})));
const households=householdListSchema.parse([1,2].map(n=>({id:id(n+10),name:`Synthetic household ${n}`,createdAt:'2026-10-01T00:00:00Z'})));
beforeEach(()=>vi.mocked(loadAccounts).mockResolvedValue({accounts,households,members:[],observations:[],ledgerHistory:[]}));
function view(url='/accounts'){ render(<MemoryRouter initialEntries={[url]}><AccountsPanel /></MemoryRouter>); }

it('household switch clears account focus and scopes both evidence and account registration', async()=>{
  view(`/accounts?household=${id(11)}&account=${id(1)}`);
  await screen.findByRole('heading',{name:'Synthetic account 1'});
  expect(screen.queryByRole('heading',{name:'Synthetic account 2'})).not.toBeInTheDocument();
  await userEvent.selectOptions(screen.getByLabelText('בית להצגת חשבונות'),id(12));
  expect(screen.getByRole('heading',{name:'Synthetic account 2'})).toBeVisible();
  expect(screen.queryByRole('heading',{name:'Synthetic account 1'})).not.toBeInTheDocument();
  expect(screen.getByLabelText('מיקוד בחשבון')).toHaveValue('');
  expect(screen.getByLabelText('בית',{exact:true})).toHaveValue(id(12));
});
it.each([id(2),id(99)])('mismatched or unavailable account %s never shows another account or writer',async account=>{
  view(`/accounts?household=${id(11)}&account=${account}`);
  await screen.findByRole('alert');
  expect(screen.queryByRole('heading',{name:/Synthetic account/})).not.toBeInTheDocument();
  expect(screen.queryByRole('form',{name:'חשבון חדש'})).not.toBeInTheDocument();
  expect(screen.queryByRole('link',{name:'ייבוא CSV לחשבון זה'})).not.toBeInTheDocument();
});
it('failed refresh removes protected evidence and does not claim success',async()=>{
  view(); await screen.findByRole('heading',{name:'Synthetic account 1'});
  vi.mocked(loadAccounts).mockRejectedValueOnce(new Error('synthetic network failure'));
  await userEvent.click(screen.getByRole('button',{name:'רענון'}));
  await screen.findByRole('alert');
  expect(screen.queryByRole('heading',{name:'Synthetic account 1'})).not.toBeInTheDocument();
  expect(screen.queryByRole('region',{name:'מלאי החשבונות והכיסוי'})).not.toBeInTheDocument();
});
