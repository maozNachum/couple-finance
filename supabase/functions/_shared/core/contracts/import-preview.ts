import { z } from 'zod';
import { accountIdSchema, householdIdSchema, sourceIdSchema } from './identity.ts';
import { moneySchema } from './money.ts';
import { financialDateSchema } from './financial-date.ts';
import { currencyCodeSchema } from './currency.ts';

export const importLimits = Object.freeze({ bytes: 1048576, rows: 2000, columns: 32, cell: 2048, uploads: 20 });
const column = z.number().int().min(0).max(importLimits.columns - 1);
export const formatSchema = z.strictObject({ encoding: z.literal('UTF-8'), delimiter: z.enum([',', ';']) }).readonly();
export const mappingSchema = z.strictObject({
 date: column, description: column, amount: column.nullable(), debit: column.nullable(), credit: column.nullable(),
 currency: column.nullable(), reference: column.nullable(), supplementary: column.nullable(),
 dateFormat: z.enum(['YYYY-MM-DD','DD/MM/YYYY','MM/DD/YYYY']), decimal: z.enum(['.', ',']), grouping: z.enum(['NONE', '.', ',']),
 sign: z.enum(['POSITIVE_INCREASES','POSITIVE_DECREASES','CREDIT_INCREASES','DEBIT_INCREASES']), fixedCurrency: currencyCodeSchema.nullable(),
}).refine(m => {
 const assigned = [m.date,m.description,m.amount,m.debit,m.credit,m.currency,m.reference,m.supplementary].filter(v=>v!==null);
 return new Set(assigned).size === assigned.length && (m.grouping === 'NONE' || m.grouping !== m.decimal)
 && ((m.amount !== null && m.debit === null && m.credit === null && m.sign.startsWith('POSITIVE_')) || (m.amount === null && m.debit !== null && m.credit !== null && !m.sign.startsWith('POSITIVE_')))
 && ((m.currency === null) !== (m.fixedCurrency === null));
}, 'Explicit, non-conflicting mapping required').readonly();
export type ColumnMapping = z.infer<typeof mappingSchema>;
export const previewIssueSchema = z.enum(['MISSING_DATE','INVALID_DATE','MISSING_DESCRIPTION','INVALID_DESCRIPTION','INVALID_AMOUNT','MISSING_AMOUNT','CONFLICTING_AMOUNT','MISSING_CURRENCY','INVALID_CURRENCY','CURRENCY_MISMATCH','INVALID_REFERENCE']);
export const previewRowSchema = z.strictObject({
 row: z.number().int().min(2).max(2001), lineStart: z.number().int().min(2).max(1048576), lineEnd: z.number().int().min(2).max(1048576),
 state: z.enum(['VALID','INVALID','UNRESOLVED']), date: financialDateSchema.nullable(), description: z.string().max(2048),
 money: moneySchema.nullable(), reference: z.string().max(2048).nullable(), supplementary: z.string().max(2048).nullable(),
 effect: z.literal('UNCLASSIFIED'), issues: z.array(previewIssueSchema).max(8).readonly(),
}).refine(r=>r.lineEnd>=r.lineStart && (r.state==='VALID' ? r.issues.length===0 && r.date!==null && r.money!==null && r.description.trim().length>0 && r.description.trim().length<=2000 : r.issues.length>0 && (r.state==='UNRESOLVED' ? r.issues.every(i=>i.startsWith('MISSING_')) : r.issues.some(i=>!i.startsWith('MISSING_'))))).readonly();
export const previewSchema = z.strictObject({
 adapter: z.literal('generic-csv-v1'), headers: z.array(z.string().min(1).max(2048)).min(1).max(32).readonly(),
 rows: z.array(previewRowSchema).max(2000).readonly(), total: z.number().int().min(0).max(2000),
 valid: z.number().int().min(0).max(2000), invalid: z.number().int().min(0).max(2000), unresolved: z.number().int().min(0).max(2000),
}).refine(p=>p.valid+p.invalid+p.unresolved===p.total && (p.rows.length===0 ? p.valid===0 && p.invalid===0 : p.rows.length===p.total && p.rows.filter(r=>r.state==='VALID').length===p.valid && p.rows.filter(r=>r.state==='INVALID').length===p.invalid)).readonly();
export type ImportPreview = z.infer<typeof previewSchema>;
export type PreviewRow = z.infer<typeof previewRowSchema>;
export const processImportSchema = z.strictObject({ id: z.uuid(), format: formatSchema, mapping: mappingSchema.nullable() }).readonly();
export const authorizeImportSchema = z.strictObject({ id: z.uuid(), householdId: householdIdSchema, accountId: accountIdSchema, sourceId: sourceIdSchema,
 filename: z.string().min(1).max(160).regex(/\.csv$/i), bytes: z.number().int().min(1).max(importLimits.bytes) }).readonly();
export const uploadSchema = z.strictObject({ id:z.uuid(), householdId:householdIdSchema, accountId:accountIdSchema, sourceId:sourceIdSchema,
 filename:z.string().max(160), bytes:z.number().int().min(1).max(importLimits.bytes), path:z.string().max(100),
 state:z.enum(['AUTHORIZED','UPLOADED','CANCELLED','EXPIRED']), expiresAt:z.string().max(40) }).readonly();
export type UploadRecord = z.infer<typeof uploadSchema>;
export const uploadListSchema = z.array(uploadSchema).max(200).readonly();


export const csvFailureSchema = z.enum(['CSV_FORMAT','CSV_LIMIT','COLUMN_MAPPING']);
