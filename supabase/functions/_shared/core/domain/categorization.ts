import { catalogSchema } from '../contracts/categorization.ts';
import type { Rule } from '../contracts/categorization.ts';
import { transactionSchema } from '../contracts/transaction.ts';
import { allocationIdSchema } from '../contracts/identity.ts';
import { ruleCategorizationCandidateSchema } from '../contracts/allocation.ts';

// Version 1 deliberately avoids locale/collation/Unicode-version dependent folding.
export function normalizeDescription(value: string): string {
  return value.replace(/[A-Z]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 32)).replace(/[ \t\r\n]+/g, ' ').replace(/^ | $/g, '');
}
export type RulePreview = Readonly<{
  state: 'MATCHED' | 'LOCKED' | 'INELIGIBLE' | 'UNMATCHED' | 'AMBIGUOUS';
  rule: Rule | null; matches: readonly Rule[]; normalizedDescription: string;
}>;
export function previewCategorization(transactionInput: unknown, allocationIdInput: unknown, catalogInput: unknown, accountActive = true): RulePreview {
  const t = transactionSchema.parse(transactionInput), id = allocationIdSchema.parse(allocationIdInput), catalog = catalogSchema.parse(catalogInput);
  const allocation = t.allocations.find((a) => a.id === id);
  if (!allocation || t.householdId !== catalog.householdId) throw new RangeError('Invalid categorization context');
  const normalizedDescription = normalizeDescription(t.description);
  const result = (state: RulePreview['state'], matches: readonly Rule[] = [], rule: Rule | null = null): RulePreview => ({ state, matches, rule, normalizedDescription });
  if (!accountActive || t.status === 'VOIDED' || !['INCOME', 'EXPENSE'].includes(allocation.effect)) return result('INELIGIBLE');
  const matches = catalog.rules.filter((r) => r.status === 'ACTIVE' && r.effect === allocation.effect &&
    catalog.categories.some((c) => c.id === r.categoryId && c.status === 'ACTIVE' && c.kind === allocation.effect) &&
    (r.operator === 'EQUALS' ? normalizedDescription === normalizeDescription(r.pattern) : normalizedDescription.includes(normalizeDescription(r.pattern))))
    .sort((a, b) => a.priority - b.priority || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const top = matches.filter((r) => r.priority === matches[0]?.priority);
  const chosen = new Set(top.map((r) => r.categoryId)).size === 1 ? top[0] ?? null : null;
  if (!ruleCategorizationCandidateSchema.safeParse(allocation).success) return result('LOCKED', matches, chosen);
  if (matches.length === 0) return result('UNMATCHED');
  return result(chosen ? 'MATCHED' : 'AMBIGUOUS', matches, chosen);
}
