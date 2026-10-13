import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadForecast } from './forecast';
const mocks=vi.hoisted(()=>({getUser:vi.fn(),rpc:vi.fn()}));
vi.mock('@/shared/infrastructure/supabase-client',()=>({browserClient:()=>({auth:{getUser:mocks.getUser},rpc:mocks.rpc})}));
const snapshot={reporting:{households:[],members:[],accounts:[],history:[],observations:[],decisions:[],rates:[],references:[],size:0},revisions:[],payments:[],rejections:[],size:0};
describe('forecast authorized read boundary',()=>{
  beforeEach(()=>{vi.clearAllMocks();mocks.getUser.mockResolvedValue({data:{user:{id:'synthetic'}},error:null});mocks.rpc.mockResolvedValue({data:{ok:true,snapshot},error:null});});
  it('uses only the existing coherent read API',async()=>{expect(await loadForecast()).toEqual(snapshot);expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('obligations_snapshot');});
  it.each([401,403])('clears access on live Auth denial %s',async status=>{mocks.getUser.mockResolvedValue({data:{user:null},error:{status}});await expect(loadForecast()).rejects.toMatchObject({code:'NOT_AUTHORIZED'});expect(mocks.rpc).not.toHaveBeenCalled();});
  it('does not request financial data after missing session',async()=>{mocks.getUser.mockResolvedValue({data:{user:null},error:null});await expect(loadForecast()).rejects.toMatchObject({code:'NOT_AUTHORIZED'});expect(mocks.rpc).not.toHaveBeenCalled();});
  it('rejects an oversized or truncated snapshot instead of a partial success',async()=>{mocks.rpc.mockResolvedValue({data:{ok:true,snapshot:{...snapshot,size:1}},error:null});await expect(loadForecast()).rejects.toMatchObject({code:'INTERNAL_ERROR'});});
  it('propagates fixed authorization failures without raw server diagnostics',async()=>{mocks.rpc.mockResolvedValue({data:{ok:false,error:{code:'NOT_AUTHORIZED',kind:'AUTHORIZATION',safeMessage:'This action is not permitted.',retryable:false}},error:null});await expect(loadForecast()).rejects.toMatchObject({code:'NOT_AUTHORIZED'});});
  it('returns fixed safe errors for transport failures',async()=>{mocks.rpc.mockRejectedValue(new Error('sentinel secret'));await expect(loadForecast()).rejects.not.toHaveProperty('message','sentinel secret');});
});
