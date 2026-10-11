import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { accountRecordSchema } from '@finance/contracts/valuation';
import { manualTransactionCommandSchema, transactionRevisionSchema } from '@finance/contracts/ledger';
import { transactionSchema } from '@finance/contracts/transaction';
import { reportingEffectSchema } from '@finance/contracts/allocation';
import { TransactionForm } from './TransactionForm';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const record = accountRecordSchema.parse({ account: { id: id(1), householdId: id(2), name: 'Synthetic cash', type: 'CASH', currency: 'ILS', valuationCurrency: 'ILS', status: 'ACTIVE', balancePolicy: 'LEDGER', ownership: { kind: 'HOUSEHOLD' } }, version: 1, manualSourceId: id(3), sources: [{ id: id(3), accountId: id(1), householdId: id(2), kind: 'MANUAL', authoritativeFrom: '0001-01-01' }] });
const historical = transactionRevisionSchema.parse({ revisionId: id(4), version: 1, supersedesRevisionId: null, entryKind: 'MOVEMENT', openingCoverage: null, reason: '', createdAt: '2026-10-09T00:00:00Z', recordedAt: '2026-10-09T00:00:00Z', transaction: { id: id(5), householdId: id(2), accountId: id(1), transactionDate: '2026-10-01', description: 'Synthetic history', money: { amount: '-10', currency: 'ILS' }, status: 'POSTED', provenance: [{ source: { sourceId: id(3), kind: 'MANUAL' } }], allocations: [{ id: id(6), effect: 'EXPENSE', money: { amount: '-10', currency: 'ILS' }, ownership: { kind: 'HOUSEHOLD' }, categorization: { origin: 'USER', userLocked: true } }] } });

it.each(reportingEffectSchema.options)('new %s movement keeps categorization absent and unlocked', async (effect) => {
  const user = userEvent.setup(), submit = vi.fn();
  render(<TransactionForm record={record} correction={null} members={[]} disabled={false} submit={submit} />);
  await user.type(screen.getByLabelText('תיאור'), 'Synthetic movement');
  await user.type(screen.getByLabelText('סכום התנועה ב־ILS'), '-10');
  await user.type(screen.getByLabelText('סכום חלוקה 1'), '-10');
  if (effect !== 'UNCLASSIFIED') await user.selectOptions(screen.getByLabelText('משמעות חלוקה 1'), effect);
  await user.click(screen.getByRole('button', { name: 'שמירת תנועה' }));
  const command = manualTransactionCommandSchema.parse(submit.mock.calls[0]?.[0]);
  expect(command.transaction.allocations[0]).toMatchObject({ effect, categorization: { origin: 'UNCLASSIFIED', userLocked: false } });
  expect(command.transaction.allocations[0]).not.toHaveProperty('categoryId');
});

it.each([false, true])('correction preserves historical category metadata (category present: %s)', async (withCategory) => {
  const user = userEvent.setup(), submit = vi.fn();
  // Category persistence remains deliberately unavailable in Task 5. Exercise the
  // form against a canonical future category without relaxing that command guard.
  const transaction = transactionSchema.parse({ ...historical.transaction, allocations: historical.transaction.allocations.map((a) => ({ ...a, ...(withCategory ? { categoryId: id(7) } : {}) })) });
  render(<TransactionForm record={record} correction={{ ...historical, transaction }} members={[]} disabled={false} submit={submit} />);
  await user.type(screen.getByLabelText('סיבת התיקון / הערה'), 'Synthetic correction');
  await user.click(screen.getByRole('button', { name: 'שמירת תנועה' }));
  const raw = submit.mock.calls[0]?.[0];
  const output = transactionSchema.parse(raw.transaction);
  const original = transaction.allocations[0]!;
  expect(output.allocations[0]).toEqual({ ...original, id: output.allocations[0]!.id });
  expect({ ...output, allocations: transaction.allocations }).toEqual(transaction);
  expect(manualTransactionCommandSchema.safeParse(raw).success).toBe(!withCategory);
});
