// Executes the unchanged canonical calculators against a recovered API snapshot.
import { financialDataQuality } from '../../supabase/functions/_shared/core/domain/data-quality.ts';
import { householdReport } from '../../supabase/functions/_shared/core/domain/reporting.ts';
import { budgetReport } from '../../supabase/functions/_shared/core/domain/budgets.ts';
import { expectedObligations } from '../../supabase/functions/_shared/core/domain/obligations.ts';
import { householdForecast } from '../../supabase/functions/_shared/core/domain/forecast.ts';

let input = '';
for await (const chunk of process.stdin) input += chunk;
const { snapshot, request } = JSON.parse(input);
const result = {
  reporting: householdReport(snapshot.obligations.reporting, request.reporting),
  budgets: budgetReport({ reporting: snapshot.obligations.reporting, categories: snapshot.categories, revisions: snapshot.budgets, size: snapshot.size }, request.reporting),
  obligations: expectedObligations(snapshot.obligations, request.reporting.householdId, '2026-10-01', '2026-11-30'),
  forecast: householdForecast(snapshot.obligations, request.forecast),
  quality: financialDataQuality(snapshot, request),
};
process.stdout.write(JSON.stringify(result));
