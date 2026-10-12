import { importRequestSchema, importReviewSchema, importResultSchema } from '../_shared/core/contracts/import-commit.ts';
import { importLimits } from '../_shared/core/contracts/import-preview.ts';
import { internalSafeError, safeErrorSchema } from '../_shared/core/contracts/safe-error.ts';
import { genericCsvAdapter, CsvError } from '../_shared/providers/generic-csv/adapter.ts';

const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS','Cache-Control':'no-store'};
const invalid=()=>safeErrorSchema.parse({code:'INVALID_INPUT',kind:'VALIDATION',safeMessage:'Some values are invalid.',retryable:false});
const denied=()=>safeErrorSchema.parse({code:'NOT_AUTHORIZED',kind:'AUTHORIZATION',safeMessage:'This action is not permitted.',retryable:false});
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:cors});
async function bounded(stream:ReadableStream<Uint8Array>|null,limit:number,signal:AbortSignal){
 if(!stream)throw invalid();const reader=stream.getReader(),parts:Uint8Array[]=[];let length=0;
 const abort=()=>{void reader.cancel();};signal.addEventListener('abort',abort);
 try{while(true){signal.throwIfAborted();const {done,value}=await reader.read();signal.throwIfAborted();if(done)break;length+=value.length;if(length>limit)throw invalid();parts.push(value);}}
 finally{signal.removeEventListener('abort',abort);await reader.cancel();}
 const result=new Uint8Array(length);let offset=0;for(const part of parts){result.set(part,offset);offset+=part.length;}return result;
}
async function hash(bytes:Uint8Array){const value=await crypto.subtle.digest('SHA-256',new Uint8Array(bytes).buffer);return Array.from(new Uint8Array(value),b=>b.toString(16).padStart(2,'0')).join('');}
const jsonHash=(value:unknown)=>hash(new TextEncoder().encode(JSON.stringify(value)));
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response(null,{headers:cors});
 if(req.method!=='POST')return reply({ok:false,error:invalid()},405);
 const authorization=req.headers.get('Authorization');if(!authorization?.startsWith('Bearer '))return reply({ok:false,error:denied()},401);
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);let leaseId:string|null=null;
 const base=Deno.env.get('SUPABASE_URL')!,anon=Deno.env.get('SUPABASE_ANON_KEY')!;
 async function rpc(name:string,payload:unknown,key=anon){
  const res=await fetch(base+'/rest/v1/rpc/'+name,{method:'POST',headers:{Authorization:key===anon?authorization!:'Bearer '+key,apikey:key,'Content-Type':'application/json','Content-Profile':'api'},body:JSON.stringify({payload}),signal:controller.signal});
  if(!res.ok)throw denied();const result=await res.json();if(result.ok!==true){const safe=safeErrorSchema.safeParse(result.error);throw safe.success?safe.data:internalSafeError();}return result;
 }
 try{
  let body:unknown;try{body=JSON.parse(new TextDecoder().decode(await bounded(req.body,262144,controller.signal)));}catch{throw invalid();}
  const parsed=importRequestSchema.safeParse(body);if(!parsed.success)throw invalid();
  const input=parsed.data;
  const command=input.action==='COMMIT'?{...input,decisions:[...input.decisions].sort((a,b)=>a.row-b.row)}:null;
  const context=await rpc('begin_import',command??{action:'REVIEW',id:input.action==='REVIEW'?input.id:''});
  if(context.result)return reply({ok:true,result:importResultSchema.parse(context.result)});
  leaseId=context.leaseId;
  const options=input.action==='REVIEW'?{adapter:'generic-csv-v1',format:input.format,mapping:input.mapping}:context.options;
  if(options.adapter!=='generic-csv-v1'||new TextEncoder().encode(JSON.stringify(options)).length>8192)throw invalid();
  const validated=importRequestSchema.safeParse({action:'REVIEW',id:context.upload.id,format:options.format,mapping:options.mapping});
  if(!validated.success||validated.data.action!=='REVIEW')throw invalid();
  // Database-issued path only. No provider/browser URL is ever fetched.
  const file=await fetch(base+'/storage/v1/object/authenticated/import-preview/'+context.upload.path,{headers:{Authorization:authorization,apikey:anon},signal:controller.signal});
  if(!file.ok)throw denied();const bytes=await bounded(file.body,importLimits.bytes,controller.signal);if(bytes.length!==context.upload.bytes)throw invalid();
  const preview=genericCsvAdapter.preview(bytes,validated.data.format,validated.data.mapping,context.currency);
  const rows=await Promise.all(preview.rows.map(async row=>{
   const evidence={row:row.row,lineStart:row.lineStart,lineEnd:row.lineEnd,state:row.state,date:row.date,money:row.money,description:row.description,reference:row.reference};
   return {...evidence,rowHash:await jsonHash(evidence)};
  }));
  controller.signal.throwIfAborted();
  const result=await rpc('finish_import',{leaseId,action:input.action,contentHash:await hash(bytes),previewHash:await jsonHash(preview),options,counts:{total:preview.total,valid:preview.valid,invalid:preview.invalid,unresolved:preview.unresolved},rows,command},Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  return reply(input.action==='REVIEW'?{ok:true,review:importReviewSchema.parse({...result.review,preview})}:{ok:true,result:importResultSchema.parse(result.result)});
 }catch(error){const safe=safeErrorSchema.safeParse(error);return reply({ok:false,error:safe.success?safe.data:error instanceof CsvError?invalid():internalSafeError()});}
 finally{
  clearTimeout(timer);
  if(leaseId){try{await fetch(base+'/rest/v1/rpc/release_import',{method:'POST',headers:{Authorization:authorization,apikey:anon,'Content-Type':'application/json','Content-Profile':'api'},body:JSON.stringify({payload:{id:leaseId}}),signal:AbortSignal.timeout(2000)});}catch{/* Bounded expiry remains the fallback. */}}
 }
});
