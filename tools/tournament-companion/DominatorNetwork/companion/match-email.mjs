import {readFile, writeFile, rename, rm} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {requireThat} from './domain.mjs';

const deployment = /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/;
export function matchEmail(directory, attachment, request = fetch) {
 const settingsFile = path.join(directory, 'match-email.json');
 const sending = new Set();
 async function settings() {
  try { return JSON.parse(await readFile(settingsFile, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
 }
 async function contact(config, payload) {
  const options = {redirect:'manual', signal:AbortSignal.timeout(45000)};
  let response;
  try {
   response = await request(config.url, {...options, method:'POST',
    headers:{'Content-Type':'application/json'}, body:JSON.stringify({...payload, key:config.key})});
   if ([302, 303].includes(response.status)) {
    const next = new URL(response.headers.get('location'));
    requireThat(next.origin === 'https://script.googleusercontent.com', 'Check the Google web app deployment and access setting.');
    response = await request(next, options);
   }
  } catch (error) {
   if (error.status) throw error;
   throw Error('Google did not confirm the request. Retry with the same match.');
  }
  requireThat(response.ok, 'Google could not open the mail sender. Check the deployment URL.');
  const result = await response.json().catch(() => null);
  requireThat(result?.service === 'ddt2-mail/v1', 'The deployment did not return a DDT2 mail receipt.');
  requireThat(result.ok, typeof result.error === 'string' ? result.error.slice(0,180) : 'Google declined the request.');
  return result;
 }
 return {
  async status() { return {configured:Boolean(await settings())}; },
  async configure({url, key}) {
   requireThat(typeof url === 'string' && deployment.test(url) && /^[a-f0-9]{64}$/.test(key), 'Enter the deployment URL and 64-character operator key.');
   await contact({url,key},{action:'check'});
   const temp = settingsFile + '.' + randomUUID();
   try {
    await writeFile(temp,JSON.stringify({url,key}),{mode:0o600,flag:'wx'});
    await rename(temp,settingsFile);
   } finally { await rm(temp,{force:true}); }
   return {configured:true};
  },
  async send(matchId) {
   const config = await settings();
   requireThat(config, 'Connect the tournament mailbox first.');
   requireThat(!sending.has(matchId), 'This match is already being sent.',409);
   sending.add(matchId);
   try {
    const file = await attachment(matchId);
    requireThat(file.content.length <= 10000000, 'Match ZIP exceeds the 10 MB email limit.');
    return await contact(config,{action:'send', filename:file.filename, zip:file.content.toString('base64')});
   } finally { sending.delete(matchId); }
  }
 };
}
