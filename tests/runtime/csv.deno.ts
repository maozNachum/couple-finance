import { csvCases } from '../providers/csv-cases.ts';
for(const c of csvCases)Deno.test(c.name,c.run);
