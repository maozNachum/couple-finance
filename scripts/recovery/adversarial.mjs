// Explicit destructive *synthetic target* tests. No target adoption or volume deletion.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { readState, restore, saveState, status, assertOwned, root } from './local-drill.mjs';
import { seal, unseal, sha256, requireThat } from './guard.mjs';
import { client, verify } from './fixture.mjs';

const [mode, sourceLab, targetLab]=process.argv.slice(2);
try {
  const source=readState(sourceLab), target=readState(targetLab);
  const confirmation=`RESTORE ${target.project}`;
  let checks=0;
  if(mode==='preflight') {
    requireThat(target.phase==='EMPTY','TARGET_NOT_EMPTY');
    assert.throws(()=>restore(sourceLab,sourceLab,`RESTORE ${source.project}`),/TARGET_STATE/);checks++;
    assert.throws(()=>restore(sourceLab,targetLab,'yes'),/CONFIRMATION/);checks++;
    const invalid=join(sourceLab,'corrupt-case');mkdirSync(invalid);
    copyFileSync(join(sourceLab,'recovery.key'),join(invalid,'recovery.key'));
    writeFileSync(join(invalid,'state.json'),JSON.stringify(source));
    const encrypted=readFileSync(join(sourceLab,'backup.cf15a')),broken=Buffer.from(encrypted);broken[30]^=1;
    writeFileSync(join(invalid,'backup.cf15a'),broken);
    assert.throws(()=>restore(invalid,targetLab,confirmation),/AUTHENTICATION/);checks++;
    const key=readFileSync(join(sourceLab,'recovery.key')),payload=unseal(encrypted,key);delete payload.archives.storage;
    const incomplete=seal(payload,key);writeFileSync(join(invalid,'backup.cf15a'),incomplete);
    writeFileSync(join(invalid,'state.json'),JSON.stringify({...source,backupHash:sha256(incomplete)}));
    assert.throws(()=>restore(invalid,targetLab,confirmation),/INCOMPLETE/);checks++;
    assert.equal(readState(targetLab).phase,'EMPTY');checks++;
  } else if(mode==='interrupt') {
    requireThat(target.phase==='EMPTY','TARGET_NOT_EMPTY');
    const child=spawn(process.execPath,[join(root,'scripts/recovery/operator.mjs'),'restore',sourceLab,targetLab,confirmation],{stdio:'ignore',windowsHide:true});
    let stopped=false;
    const finished=new Promise(resolve=>child.once('exit',resolve));
    for(let n=0;n<6000 && child.exitCode===null;n++) {
      if(readState(targetLab).phase==='RESTORING') { child.kill();stopped=true;break; }
      await new Promise(resolve=>setTimeout(resolve,10));
    }
    if(!stopped)child.kill();
    await finished;
    assert.equal(stopped,true,'actual process interrupted after durable restore intent');checks++;
    assert.equal(readState(targetLab).phase,'RESTORING');checks++;
    assert.throws(()=>restore(sourceLab,targetLab,confirmation),/TARGET_STATE/);checks++;
  } else if(mode==='missing-object') {
    requireThat(target.phase==='VERIFYING' && target.project.endsWith('-target'),'REFUSED_TARGET_STATE');
    assertOwned(target);
    const expected=JSON.parse(readFileSync(join(sourceLab,'fixture-private.json'),'utf8'));
    const admin=client(status(target),true);
    const removed=await admin.storage.from(expected.inventory[0].bucket).remove([expected.inventory[0].name]);
    assert.equal(removed.error,null);checks++;
    await assert.rejects(()=>verify(sourceLab,targetLab),error=>error.code==='ERR_ASSERTION' && error.message.startsWith('all private bytes'));checks++;
    assert.notEqual(readState(targetLab).phase,'VERIFIED');checks++;
    target.phase='FAILED_MISSING_OBJECT';saveState(targetLab,target);
  } else throw new Error('INVALID_ARGUMENTS');
  console.log(JSON.stringify({case:mode,checks,result:'PASS',targetPhase:readState(targetLab).phase}));
} catch(error) {
  console.error(error.code==='ERR_ASSERTION'?'ADVERSARIAL_ASSERTION_FAILED':/^[A-Z_]+$/.test(error.message)?error.message:'ADVERSARIAL_TEST_FAILED');
  process.exitCode=1;
}
