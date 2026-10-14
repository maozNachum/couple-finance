import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadDataQuality } from './data-quality';
const mocks=vi.hoisted(()=>({getUser:vi.fn(),rpc:vi.fn()}));
vi.mock('@/shared/infrastructure/supabase-client',()=>({browserClient:()=>({auth:{getUser:mocks.getUser},rpc:mocks.rpc})}));
const obligations={reporting:{households:[],members:[],accounts:[],history:[],observations:[],decisions:[],rates:[],references:[],size:0},revisions:[],payments:[],rejections:[],size:0};
const snapshot={version:1,capturedAt:'2026-10-01T00:00:00Z',obligations,categories:[],budgets:[],size:0};

describe('quality authorized read boundary',()=>{
  beforeEach(()=>{vi.clearAllMocks();mocks.getUser.mockResolvedValue({data:{user:{id:'synthetic'}},error:null});mocks.rpc.mockResolvedValue({data:{ok:true,snapshot},error:null});});
  it('uses only the existing coherent read API',async()=>{expect(await loadDataQuality()).toEqual(snapshot);expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('data_quality_snapshot');});
  it.each([401,403])('clears access on live Auth denial %s',async status=>{mocks.getUser.mockResolvedValue({data:{user:null},error:{status}});await expect(loadDataQuality()).rejects.toMatchObject({code:'NOT_AUTHORIZED'});expect(mocks.rpc).not.toHaveBeenCalled();});
  it('does not request financial data after missing session',async()=>{mocks.getUser.mockResolvedValue({data:{user:null},error:null});await expect(loadDataQuality()).rejects.toMatchObject({code:'NOT_AUTHORIZED'});expect(mocks.rpc).not.toHaveBeenCalled();});
  it('rejects an oversized or truncated snapshot instead of a partial success',async()=>{mocks.rpc.mockResolvedValue({data:{ok:true,snapshot:{...snapshot,size:1}},error:null});await expect(loadDataQuality()).rejects.toMatchObject({code:'INTERNAL_ERROR'});});
  it('propagates fixed authorization failures without raw server diagnostics',async()=>{mocks.rpc.mockResolvedValue({data:{ok:false,error:{code:'NOT_AUTHORIZED',kind:'AUTHORIZATION',safeMessage:'This action is not permitted.',retryable:false}},error:null});await expect(loadDataQuality()).rejects.toMatchObject({code:'NOT_AUTHORIZED'});});
  it('returns fixed safe errors for transport failures',async()=>{mocks.rpc.mockRejectedValue(new Error('sentinel secret'));await expect(loadDataQuality()).rejects.not.toHaveProperty('message','sentinel secret');});
});
