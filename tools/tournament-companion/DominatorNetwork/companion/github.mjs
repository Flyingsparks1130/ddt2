import {digest,requireThat} from './domain.mjs';
export function targetFrom(raw={}){
 const target=Object.fromEntries(['owner','repo','branch','file'].map(k=>[k,String(raw[k]||'').trim()]));
 if(Object.values(target).every(v=>!v))return target;
 requireThat(/^[A-Za-z0-9][A-Za-z0-9-]{0,99}$/.test(target.owner),'Enter a valid GitHub owner.');
 requireThat(/^[A-Za-z0-9_.-]{1,100}$/.test(target.repo)&&!['.','..'].includes(target.repo),'Enter a valid repository name.');
 requireThat(target.branch.length>0&&target.branch.length<=150&&!/[\x00-\x20~^:?*\[\\]/.test(target.branch)&&!target.branch.includes('..'),'Enter a valid existing branch.');
 requireThat(/^[A-Za-z0-9_./-]+\.json$/.test(target.file)&&!target.file.startsWith('/')&&!target.file.split('/').some(s=>!s||s==='.'||s==='..'),'Choose a relative JSON file path, such as data/tournament.json.');
 return target;
}
export function publicationPreview(state,bundle,tokenAvailable){const hash=digest(bundle);const ready=Object.values(state.github).every(Boolean)&&tokenAvailable;
 return {hash,target:state.github,ready,tokenAvailable,approvedCount:bundle.results.length,manualCount:(bundle.series?.matches||[]).reduce((n,m)=>n+m.races.filter(r=>r.manual).length,0),alreadyPublished:state.publications.some(p=>p.hash===hash&&JSON.stringify(p.target)===JSON.stringify(state.github)),
  reason:!Object.values(state.github).every(Boolean)?'GitHub destination is a placeholder.':!tokenAvailable?'GitHub credentials are not configured.':null};}
export async function publishBundle(target,bundle,token,fetcher=fetch){
 requireThat(token&&Object.values(target).every(Boolean),'GitHub is not connected.');
 const base=`https://api.github.com/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repo)}/contents/${target.file.split('/').map(encodeURIComponent).join('/')}`;
 const headers={Accept:'application/vnd.github+json',Authorization:`Bearer ${token}`,'X-GitHub-Api-Version':'2026-03-10','User-Agent':'Dominator-Tournament-Companion','Content-Type':'application/json'};
 const request=(url,options={})=>fetcher(url,{...options,headers,signal:AbortSignal.timeout(15000),redirect:'error'});
 const hash=digest(bundle),content=JSON.stringify(bundle,null,2)+'\n';
 const readCurrent=async()=>{const response=await request(base+'?ref='+encodeURIComponent(target.branch));if(response.status===404)return null;
  requireThat(response.ok,`GitHub read failed (${response.status}).`,502);const file=await response.json();requireThat(file.type==='file'&&file.encoding==='base64','The GitHub destination is not a supported JSON file.');
  let previous;try{previous=JSON.parse(Buffer.from(file.content,'base64').toString());}catch{throw Error('The destination contains an unrelated file. Choose a new path.');}
  requireThat(previous.schema===bundle.schema&&previous.tournament?.id===bundle.tournament.id,'The destination belongs to another file or tournament. Choose a new path.');return {sha:file.sha,bundle:previous,url:file.html_url};};
 const existing=await readCurrent();if(existing&&digest(existing.bundle)===hash)return {hash,commit:null,url:existing.url,reconciled:true};
 try{
  const response=await request(base,{method:'PUT',body:JSON.stringify({message:`Tournament results: ${bundle.tournament.name} (${bundle.results.length} approved heats)`,content:Buffer.from(content).toString('base64'),branch:target.branch,...(existing?{sha:existing.sha}:{})})});
  requireThat(response.ok,`GitHub publish failed (${response.status}). No approval was lost; retry after checking the destination.`,502);
  const result=await response.json();return {hash,commit:result.commit?.sha,url:result.content?.html_url,reconciled:false};
 }catch(error){try{const current=await readCurrent();if(current&&digest(current.bundle)===hash)return {hash,commit:null,url:current.url,reconciled:true};}catch{}throw error;}
}
