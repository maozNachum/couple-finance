import { importLimits, formatSchema, mappingSchema, previewSchema, type ImportPreview, type PreviewRow, type ColumnMapping } from '../../core/contracts/import-preview.ts';
import { financialDateSchema } from '../../core/contracts/financial-date.ts';
import { moneySchema } from '../../core/contracts/money.ts';
import { currencyCodeSchema } from '../../core/contracts/currency.ts';
import { negate } from '../../core/domain/money/decimal.ts';

type RawRow = { cells: string[]; lineStart: number; lineEnd: number };
export class CsvError extends Error { constructor(readonly code: 'FORMAT'|'LIMIT'|'MAPPING') { super(code); } }
// Linear scan, bounded bytes/cells/columns/rows. No regex supplied by the file is ever evaluated.
export function readCsv(bytes: Uint8Array, options: unknown): RawRow[] {
 const format = formatSchema.safeParse(options); if (!format.success) throw new CsvError('FORMAT');
 if (!bytes.length || bytes.length > importLimits.bytes) throw new CsvError('LIMIT');
 let text: string; try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { throw new CsvError('FORMAT'); }
 for(const c of text){const n=c.charCodeAt(0);if((n<32 && n!==9 && n!==10 && n!==13)||n===127)throw new CsvError('FORMAT');}
 const rows: RawRow[]=[]; let cells:string[]=[]; let cell=''; let quoted=false; let closed=false; let line=1; let start=1; let ended=false;
 function field() { cells.push(cell); cell=''; closed=false; if(cells.length>importLimits.columns)throw new CsvError('LIMIT'); }
 function row() { field(); rows.push({cells,lineStart:start,lineEnd:line}); cells=[]; if(rows.length>importLimits.rows+1)throw new CsvError('LIMIT'); }
 for(let i=0;i<text.length;i++) {
  const c=text[i]!; ended=false;
  if(quoted) {
   if(c==='"') { if(text[i+1]==='"'){cell+='"';i++;} else {quoted=false;closed=true;} }
   else if(c==='\r'||c==='\n') { if(c==='\r' && text[i+1]==='\n')i++; cell+='\n';line++; }
   else cell+=c;
  } else if(c===format.data.delimiter) field();
  else if(c==='\n'||c==='\r') { row(); if(c==='\r'&&text[i+1]==='\n')i++; line++;start=line;ended=true; }
  else if(closed) throw new CsvError('FORMAT');
  else if(c==='"') { if(cell.length)throw new CsvError('FORMAT'); quoted=true; }
  else cell+=c;
  if(cell.length>importLimits.cell)throw new CsvError('LIMIT');
 }
 if(quoted)throw new CsvError('FORMAT'); if(!ended)row();
 const headers=rows[0]?.cells; if(!headers?.length || headers.some(h=>!h.trim()) || new Set(headers.map(h=>h.trim())).size!==headers.length)throw new CsvError('FORMAT');
 if(rows.some(r=>r.cells.length!==headers.length))throw new CsvError('FORMAT');
 return rows;
}
function dateValue(raw:string, format:ColumnMapping['dateFormat']) {
 const match = format==='YYYY-MM-DD' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw) : /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(raw);
 if(!match)return null;
 const value=format==='YYYY-MM-DD'?raw:format==='DD/MM/YYYY'?`${match[3]}-${match[2]}-${match[1]}`:`${match[3]}-${match[1]}-${match[2]}`;
 const parsed=financialDateSchema.safeParse(value); return parsed.success?parsed.data:null;
}
function amountValue(raw:string,m:ColumnMapping,currency:unknown, signed:boolean) {
 if(!raw || (!signed && /^[+-]/.test(raw)))return null;
 let sign=''; if(signed && /^[+-]/.test(raw)){sign=raw[0]==='-'?'-':'';raw=raw.slice(1);}
 const pieces=raw.split(m.decimal); if(pieces.length>2)return null;
 let integer=pieces[0]!; const fraction=pieces[1];
 if(m.grouping!=='NONE' && integer.includes(m.grouping)) { const groups=integer.split(m.grouping); if(!/^\d{1,3}$/.test(groups[0]!) || groups.slice(1).some(g=>!/^\d{3}$/.test(g)))return null; integer=groups.join(''); }
 if(!/^\d+$/.test(integer) || (fraction!==undefined && !/^\d{1,8}$/.test(fraction)) || integer.length>16)return null;
 integer=integer.replace(/^0+(?=\d)/,'');
 const parsed=moneySchema.safeParse({amount:sign+integer+(fraction!==undefined?'.'+fraction:''),currency});return parsed.success?parsed.data:null;
}
export function previewCsv(bytes:Uint8Array, format:unknown, mapping:unknown, accountCurrency:unknown):ImportPreview {
 const raw=readCsv(bytes,format),headers=raw[0]!.cells;
 if(mapping===null)return previewSchema.parse({adapter:'generic-csv-v1',headers,rows:[],total:raw.length-1,valid:0,invalid:0,unresolved:raw.length-1});
 const parsed=mappingSchema.safeParse(mapping); if(!parsed.success)throw new CsvError('MAPPING'); const m=parsed.data;
 if([m.date,m.description,m.amount,m.debit,m.credit,m.currency,m.reference,m.supplementary].some(c=>c!==null && c>=headers.length))throw new CsvError('MAPPING');
 const rows:PreviewRow[]=raw.slice(1).map((r,index)=>{
  const get=(col:number|null)=>col===null?'':r.cells[col]!; const issues:PreviewRow['issues'][number][]=[];
  const date=dateValue(get(m.date).trim(),m.dateFormat);if(!date)issues.push(get(m.date).trim()?'INVALID_DATE':'MISSING_DATE');
  const description=get(m.description);if(!description.trim())issues.push('MISSING_DESCRIPTION');else if(description.trim().length>2000)issues.push('INVALID_DESCRIPTION');
  const currency=currencyCodeSchema.safeParse(m.fixedCurrency??get(m.currency).trim());
  if(!currency.success)issues.push(get(m.currency).trim()||m.fixedCurrency?'INVALID_CURRENCY':'MISSING_CURRENCY');
  else if(currency.data!==accountCurrency)issues.push('CURRENCY_MISMATCH');
  let money=null;
  if(m.amount!==null){const value=get(m.amount).trim(); money=amountValue(value,m,currency.success?currency.data:accountCurrency,true);if(!money)issues.push(value?'INVALID_AMOUNT':'MISSING_AMOUNT'); else if(m.sign==='POSITIVE_DECREASES')money={...money,amount:negate(money.amount)};}
  else {
   const debit=get(m.debit).trim(),credit=get(m.credit).trim();
   if(!debit&&!credit)issues.push('MISSING_AMOUNT');
   else {const d=debit?amountValue(debit,m,currency.success?currency.data:accountCurrency,false):null,c=credit?amountValue(credit,m,currency.success?currency.data:accountCurrency,false):null;
    if((debit&&!d)||(credit&&!c))issues.push('INVALID_AMOUNT');
    else if(d?.amount!=='0' && c?.amount!=='0' && d&&c)issues.push('CONFLICTING_AMOUNT');
    else {money=d&&d.amount!=='0'?d:c??d;if(money && ((money===d && m.sign==='CREDIT_INCREASES')||(money===c && m.sign==='DEBIT_INCREASES')))money={...money,amount:negate(money.amount)};}
   }
  }
  if(!currency.success)money=null;
  const reference=m.reference===null?null:get(m.reference); if(reference && reference.length>200)issues.push('INVALID_REFERENCE');
  const state=issues.some(i=>!i.startsWith('MISSING_'))?'INVALID':issues.length?'UNRESOLVED':'VALID';
  return {row:index+2,lineStart:r.lineStart,lineEnd:r.lineEnd,state,date,description,money,reference,supplementary:m.supplementary===null?null:get(m.supplementary),effect:'UNCLASSIFIED',issues};
 });
 return previewSchema.parse({adapter:'generic-csv-v1',headers,rows,total:rows.length,valid:rows.filter(r=>r.state==='VALID').length,invalid:rows.filter(r=>r.state==='INVALID').length,unresolved:rows.filter(r=>r.state==='UNRESOLVED').length});
}



export interface CsvPreviewAdapter {
 readonly id: 'generic-csv-v1';
 preview(bytes: Uint8Array, format: unknown, mapping: unknown, accountCurrency: unknown): ImportPreview;
}
export const genericCsvAdapter: CsvPreviewAdapter = Object.freeze({ id: 'generic-csv-v1', preview: previewCsv });
