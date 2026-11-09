function siteHeader(active){
 document.body.insertAdjacentHTML('afterbegin',`<header class="site-header">${DDT2.header(active)}</header>`);
}
function siteFooter(){document.body.insertAdjacentHTML('beforeend',`<footer class="site-footer">${DDT2.footer()}</footer>`)}
async function getJSON(path){const r=await fetch(`${path}?v=${Date.now()}`,{cache:"no-store"});if(!r.ok)throw new Error(`${path}: ${r.status}`);return r.json()}
function esc(v){return String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;")}
