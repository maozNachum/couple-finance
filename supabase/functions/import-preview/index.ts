import { processImportSchema, importLimits } from '../_shared/core/contracts/import-preview.ts';
import { internalSafeError, safeErrorSchema } from '../_shared/core/contracts/safe-error.ts';
import { genericCsvAdapter, CsvError } from '../_shared/providers/generic-csv/adapter.ts';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Cache-Control':'no-store' };
function reply(body:unknown,status=200){return Response.json(body,{status,headers:cors});}
const invalid=()=>safeErrorSchema.parse({code:'INVALID_INPUT',kind:'VALIDATION',safeMessage:'Some values are invalid.',retryable:false});
const denied=()=>safeErrorSchema.parse({code:'NOT_AUTHORIZED',kind:'AUTHORIZATION',safeMessage:'This action is not permitted.',retryable:false});
async function bounded(body:ReadableStream<Uint8Array>|null,limit:number,signal:AbortSignal){
 if(!body)throw invalid(); const reader=body.getReader();const parts:Uint8Array[]=[];let size=0;
 const abort=()=>{void reader.cancel();};signal.addEventListener('abort',abort);
 try{while(true){signal.throwIfAborted();const item=await reader.read();signal.throwIfAborted();if(item.done)break;size+=item.value.length;if(size>limit)throw invalid();parts.push(item.value);}}
 finally{signal.removeEventListener('abort',abort);await reader.cancel();}
 const result=new Uint8Array(size);let offset=0;for(const p of parts){result.set(p,offset);offset+=p.length;}return result;
}
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response(null,{headers:cors});
 if(req.method!=='POST')return reply({ok:false,error:invalid()},405);
 const authorization=req.headers.get('Authorization');if(!authorization?.startsWith('Bearer '))return reply({ok:false,error:denied()},401);
 const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),15000);
 try{
  let body:unknown;try{body=JSON.parse(new TextDecoder().decode(await bounded(req.body,8192,controller.signal)));}catch{throw invalid();}
  const parsed=processImportSchema.safeParse(body);if(!parsed.success)throw invalid();const input=parsed.data;
  const base=Deno.env.get('SUPABASE_URL')!;const apikey=Deno.env.get('SUPABASE_ANON_KEY')!;
  const headers={Authorization:authorization,apikey,'Content-Type':'application/json','Content-Profile':'api'};
  async function authorize(){
   const res=await fetch(base+'/rest/v1/rpc/import_command',{method:'POST',headers,body:JSON.stringify({payload:{action:'PROCESS',id:input.id}}),signal:controller.signal});
   if(!res.ok)throw denied();const result=await res.json();if(result.ok!==true)throw denied();return result;
  }
  const context=await authorize();
  // The URL comes exclusively from a database-generated UUID path, never CSV or browser path data.
  const file=await fetch(base+'/storage/v1/object/authenticated/import-preview/'+context.upload.path,{headers:{Authorization:authorization,apikey},signal:controller.signal});
  if(!file.ok)throw denied();const bytes=await bounded(file.body,importLimits.bytes,controller.signal);if(bytes.length!==context.upload.bytes)throw invalid();
  const preview=genericCsvAdapter.preview(bytes,input.format,input.mapping,context.currency);
  await authorize(); // Recheck cancellation, expiration, membership and session after processing.
  return reply({ok:true,preview});
 }catch(error){const safe=safeErrorSchema.safeParse(error);return reply({ok:false,error:safe.success?safe.data:error instanceof CsvError?invalid():internalSafeError(),...(error instanceof CsvError?{failure:{FORMAT:'CSV_FORMAT',LIMIT:'CSV_LIMIT',MAPPING:'COLUMN_MAPPING'}[error.code]}:{})});}
 finally{clearTimeout(timer);}
});
