import {readFile,writeFile,mkdir,rename,copyFile} from 'node:fs/promises';
import path from 'node:path';
import {initialState} from './domain.mjs';
export async function atomicWrite(file,value){await mkdir(path.dirname(file),{recursive:true});const tmp=file+'.tmp';await writeFile(tmp,typeof value==='string'?value:JSON.stringify(value,null,2),'utf8');await rename(tmp,file);}
export async function openStore(directory,name){
 await mkdir(path.join(directory,'raw'),{recursive:true});const file=path.join(directory,'tournament.json');let state;
 try{state=JSON.parse(await readFile(file,'utf8'));if(state.schema!==1||!Array.isArray(state.races)||!Number.isInteger(state.revision))throw Error('Unsupported or damaged tournament store.');}
 catch(error){if(error.code!=='ENOENT')throw error;state=initialState(name);await atomicWrite(file,state);}
 let tail=Promise.resolve();
 return {get state(){return state;},directory,async transaction(operation){const run=tail.then(async()=>{const next=structuredClone(state);const result=await operation(next);next.revision=state.revision+1;await copyFile(file,file+'.bak');await atomicWrite(file,next);state=next;return result;});tail=run.catch(()=>{});return run;},
 async saveRaw(fingerprint,content){const file=path.join(directory,'raw',fingerprint+'.json');try{await writeFile(file,content,{encoding:'utf8',flag:'wx'});}catch(e){if(e.code!=='EEXIST')throw e;}}};
}
