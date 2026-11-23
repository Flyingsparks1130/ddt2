import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createHash,randomUUID} from 'node:crypto';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {matchEmail} from '../DominatorNetwork/companion/match-email.mjs';
import {packageZip} from '../DominatorNetwork/companion/production.mjs';

test('operators send the original ZIP only to the organizer, with one receipt per export', async t=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'ddt-mail-'));
 t.after(()=>rm(dir,{recursive:true,force:true}));
 const properties=new Map(),sent=[];
 const script={PropertiesService:{getScriptProperties:()=>({getProperty:k=>properties.get(k),setProperty:(k,v)=>properties.set(k,v)})},
  Session:{getEffectiveUser:()=>({getEmail:()=>'organizer@example.com'})},
  ContentService:{MimeType:{JSON:'json'},createTextOutput:text=>({setMimeType:()=>text})},
  LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock(){}})},
  Utilities:{getUuid:randomUUID,base64Decode:s=>Buffer.from(s,'base64'),base64EncodeWebSafe:b=>b.toString('base64url'),
   newBlob:(bytes,type,name)=>({bytes,type,name}),DigestAlgorithm:{SHA_256:'sha256'},
   computeDigest:(alg,bytes)=>createHash(alg).update(bytes).digest()},
  MailApp:{getRemainingDailyQuota:()=>10,sendEmail:mail=>sent.push(mail)}};
 vm.runInNewContext(await readFile(new URL('../mail-relay/Code.gs',import.meta.url),'utf8'),script);
 script.setupMatchEmail();
 const url='https://script.google.com/macros/s/test/exec',config={url,key:properties.get('OPERATOR_1')};
 let content=packageZip({score:4}),responseText;
 const client=matchEmail(dir,async()=>({filename:'DDT2-r1-m1.zip',content}),async(address,options)=>{
  if(address===url){responseText=script.doPost({postData:{contents:options.body,length:options.body.length}});
   return new Response(null,{status:302,headers:{location:'https://script.googleusercontent.com/macros/echo'}});}
  assert.equal(options.body,undefined);
  return new Response(responseText);
 });
 await assert.rejects(client.send('match'),/Connect/);
 await assert.rejects(client.configure({...config,key:'0'.repeat(64)}),/operator key/);
 await client.configure(config);
 assert.deepEqual(await client.status(),{configured:true});
 assert.equal(sent.length,0);
 assert.equal((await client.send('match')).alreadySent,false);
 await client.configure({...config,key:properties.get('OPERATOR_2')});
 assert.equal((await client.send('match')).alreadySent,true);
 assert.equal(sent.length,1);assert.equal(sent[0].to,'organizer@example.com');
 assert.deepEqual(sent[0].attachments[0],{bytes:content,type:'application/zip',name:'DDT2-r1-m1.zip'});
 content=packageZip({score:5});
 await client.send('match');assert.equal(sent.length,2);
});
