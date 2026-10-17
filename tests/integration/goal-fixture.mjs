import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { reconciliationFixture } from './reconciliation-fixture.mjs';
import { localAdmin,localStatus,localSql,uuid } from '../../scripts/local-supabase.mjs';

export async function goalFixture(){
 const f=await reconciliationFixture(),admin=localAdmin(),status=localStatus();
 const invite=await admin.auth.admin.generateLink({type:'invite',email:`synthetic-goal-peer-${randomUUID()}@example.test`});
 if(invite.error||!invite.data.user||!invite.data.properties)throw new Error('Synthetic goal peer failed');
 const peerId=uuid(invite.data.user.id),memberId=randomUUID(),h=uuid(f.households[0]);
 localSql(`insert into finance.profiles(id,display_name) values('${peerId}','Synthetic peer');insert into finance.household_members(id,household_id,user_id,display_name) values('${memberId}','${h}','${peerId}','Synthetic peer');`);
 const peer=createClient(status.API_URL,status.ANON_KEY,{db:{schema:'api'},auth:{persistSession:false,autoRefreshToken:false}});
 assert.equal((await peer.auth.verifyOtp({token_hash:invite.data.properties.hashed_token,type:'invite'})).error,null);
 const command=(extra={})=>({id:randomUUID(),householdId:h,ownership:{kind:'HOUSEHOLD'},name:'Home down payment',target:{amount:'30000',currency:'ILS'},declared:{amount:'6000',currency:'ILS'},monthly:null,targetDate:'2027-10-31',action:'CREATE',expectedVersion:0,idempotencyKey:randomUUID(),acknowledge:true,...extra});
 return {...f,peer,peerId,memberId,command,async cleanup(){await admin.auth.admin.deleteUser(peerId);await f.cleanup();}};
}
