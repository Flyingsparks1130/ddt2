const $=id=>document.getElementById(id);
const textFields=['tournament','matchup','round','stage'],boolFields=['enabled','autoFit','compact','indicators'],numberFields=['scale','motion','opacity'];
let config=null,dirty=false,saving=false,timer=0;
$('source-url').value=location.origin+'/overlay';
function outputs(){$('scale-value').textContent=Number($('scale').value).toFixed(2)+'×';$('motion-value').textContent=$('motion').value+' ms';$('opacity-value').textContent=Math.round($('opacity').value*100)+'%';}
function populate(){for(const k of textFields)$(k).value=config[k]||'';for(const k of boolFields)$(k).checked=!!config[k];for(const k of numberFields)$(k).value=config[k];$('picks').value=(config.picks||[]).join(', ');outputs();}
function collect(){for(const k of textFields)config[k]=$(k).value;for(const k of boolFields)config[k]=$(k).checked;for(const k of numberFields)config[k]=Number($(k).value);config.picks=[...new Set($('picks').value.split(/[,\s]+/).filter(Boolean).map(Number).filter(n=>Number.isInteger(n)&&n>=1&&n<=32))].slice(0,3);outputs();}
function queue(){dirty=true;$('saved').textContent='Unsaved changes…';$('saved').classList.remove('error');clearTimeout(timer);timer=setTimeout(save,400);}
async function save(){if(!dirty||saving)return;saving=true;dirty=false;try{const response=await fetch('/api/config',{method:'POST',headers:{'Content-Type':'application/json','X-Dominator-Settings':'1'},body:JSON.stringify(config),signal:AbortSignal.timeout(2500)});if(!response.ok)throw Error(await response.text());$('saved').textContent=dirty?'Saving…':'All changes saved';$('saved').classList.remove('error');}catch(error){dirty=true;$('saved').textContent='Not saved — reconnecting…';$('saved').classList.add('error');}finally{saving=false;if(dirty)timer=setTimeout(save,1200);}}
function preview(){const params=new URLSearchParams();if($('demo').checked){params.set('demo','1');params.set('count',$('preview-count').value);params.set('lamp',$('test-lamp').value);}const url='/overlay'+(params.size?'?'+params:'');$('preview').src=url;$('preview-count').disabled=$('test-lamp').disabled=!$('demo').checked;}
for(const id of ['demo','preview-count','test-lamp'])$(id).addEventListener('change',preview);
$('settings').addEventListener('submit',e=>e.preventDefault());
$('settings').addEventListener('input',e=>{if(!config)return;collect();queue();});
$('reset-layout').addEventListener('click',()=>{if(!config)return;Object.assign(config,{autoFit:true,compact:false,scale:1,motion:320,opacity:1});populate();queue();});
function toast(message){$('toast').textContent=message;$('toast').style.display='block';setTimeout(()=>$('toast').style.display='none',2300);}
$('copy-url').addEventListener('click',async()=>{try{await navigator.clipboard.writeText($('source-url').value);toast('OBS URL copied');}catch{$('source-url').select();toast('Press Ctrl+C to copy the selected URL');}});
async function refresh(){try{const response=await fetch('/api/state',{cache:'no-store',signal:AbortSignal.timeout(1500)});if(!response.ok)throw Error();const state=await response.json();$('connection').textContent=state.active?`${state.runners.length} runners • ${state.paused?'Paused':'Live race'}`:'Game bridge connected • Waiting for race';$('connection').className='connection'+(state.active?' live':'');if(!config){config=state.config;populate();$('saved').textContent='All changes saved';}}catch{$('connection').textContent='Game bridge offline • Start Umamusume';$('connection').className='connection error';}setTimeout(refresh,1000);}
window.addEventListener('beforeunload',e=>{if(dirty||saving){e.preventDefault();e.returnValue='';}});
refresh();
