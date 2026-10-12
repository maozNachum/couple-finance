import { householdListSchema } from '@finance/contracts/household';
import { browserClient } from '@/shared/infrastructure/supabase-client';
import { csvFailureSchema, authorizeImportSchema, uploadSchema, uploadListSchema, previewSchema, processImportSchema, type UploadRecord } from '@finance/contracts/import-preview';
import { accountRecordsSchema } from '@finance/contracts/valuation';
import { internalSafeError, safeErrorSchema } from '@finance/contracts/safe-error';
import { importRequestSchema, importReviewSchema, importResultSchema } from '@finance/contracts/import-commit';
const client=()=>{const c=browserClient();if(!c)throw internalSafeError();return c;};
export async function loadImports(){
 const c=client();const user=await c.auth.getUser();if(user.error||!user.data.user){if((!user.error&&!user.data.user)||user.error?.status===401||user.error?.status===403)throw safeErrorSchema.parse({code:'NOT_AUTHORIZED',kind:'AUTHORIZATION',safeMessage:'This action is not permitted.',retryable:false});throw internalSafeError();}
 const [a,u,h,e]=await Promise.all([c.from('accounts').select('payload').limit(1000),c.rpc('list_imports'),c.from('households').select('id,name,created_at').limit(1000),c.rpc('import_evidence')]);
 if(a.error||u.error||h.error||e.error||a.data.length>=1000||h.data.length>=1000)throw internalSafeError();
 return {households:householdListSchema.parse(h.data.map(r=>({id:r.id,name:r.name,createdAt:String(r.created_at).replace(/\+00:00$/,'Z')}))),accounts:accountRecordsSchema.parse(a.data.map(r=>r.payload)),uploads:uploadListSchema.parse(u.data),evidence:importResultSchema.array().parse(e.data)};
}
export async function reviewImport(input:unknown){
 const r=await client().functions.invoke('import-commit',{body:importRequestSchema.parse(input)});
 if(r.error)throw internalSafeError();if(r.data?.ok!==true){const e=safeErrorSchema.safeParse(r.data?.error);throw e.success?e.data:internalSafeError();}return importReviewSchema.parse(r.data.review);
}
export async function commitImport(input:unknown){
 const r=await client().functions.invoke('import-commit',{body:importRequestSchema.parse(input)});
 if(r.error)throw internalSafeError();if(r.data?.ok!==true){const e=safeErrorSchema.safeParse(r.data?.error);throw e.success?e.data:internalSafeError();}return importResultSchema.parse(r.data.result);
}
export async function importCommand(action:'AUTHORIZE'|'CANCEL'|'FORGET',input:unknown){
 const payload=action==='AUTHORIZE'?{...authorizeImportSchema.parse(input),action}:{id:input,action};
 const r=await client().rpc('import_command',{payload});if(r.error)throw internalSafeError();
 if(r.data?.ok!==true){const e=safeErrorSchema.safeParse(r.data?.error);throw e.success?e.data:internalSafeError();}return uploadSchema.parse(r.data.upload);
}
export async function uploadBytes(record:UploadRecord,file:File){
 if(file.size!==record.bytes)throw internalSafeError();
 const r=await client().storage.from('import-preview').upload(record.path,file,{contentType:'text/csv',upsert:false,cacheControl:'0'});
 if(r.error)throw internalSafeError();
}
export async function processUpload(input:unknown){
 const r=await client().functions.invoke('import-preview',{body:processImportSchema.parse(input)});
 if(r.error)throw internalSafeError(); if(r.data?.ok!==true){const failure=csvFailureSchema.safeParse(r.data?.failure);if(failure.success)throw failure.data;const e=safeErrorSchema.safeParse(r.data?.error);throw e.success?e.data:internalSafeError();}return previewSchema.parse(r.data.preview);
}
export async function cancelUpload(record:UploadRecord){
 await importCommand('CANCEL',record.id);
 const r=await client().storage.from('import-preview').remove([record.path]);if(r.error)throw internalSafeError();
 await importCommand('FORGET',record.id);
}
