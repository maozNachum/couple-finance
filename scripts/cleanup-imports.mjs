import { localAdmin,localSql,uuid } from './local-supabase.mjs';
// Operator-only, loopback-verified cleanup. Never delete Storage metadata directly.
export async function cleanupImports(){
 const admin=localAdmin();const rows=JSON.parse(localSql('select private.reserve_import_cleanup()'));
 let cleaned=0;
 for(const row of rows){
  const id=uuid(row.id),h=uuid(row.household_id);
  if(row.object_path!==`${h}/${id}.csv`)throw new Error('Unexpected staging path.');
  const response=await admin.storage.from('import-preview').remove([row.object_path]);if(response.error)throw new Error('Staging object cleanup failed; metadata retained for retry.');
  localSql(`begin; insert into private.import_audit(upload_id,household_id,operation) select id,household_id,'CLEANED' from finance.import_uploads u where id='${id}' and (cancelled or expires_at<=now()) and not exists(select 1 from storage.objects where bucket_id='import-preview' and name=u.object_path); delete from finance.import_uploads u where id='${id}' and (cancelled or expires_at<=now()) and not exists(select 1 from storage.objects where bucket_id='import-preview' and name=u.object_path); delete from finance.import_jobs j where upload_id='${id}' and result is null and not exists(select 1 from finance.import_uploads where id=j.upload_id); commit;`);cleaned++;
 }
 localSql("delete from private.import_audit where occurred_at<now()-interval '30 days'");
 return cleaned;
}
if(process.argv[1]?.replaceAll('\\','/').endsWith('/cleanup-imports.mjs'))console.log(`Expired/cancelled staging records cleaned: ${await cleanupImports()}. Audit retention: 30 days.`);
