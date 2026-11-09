/* Source-resolution race artwork. A missing outfit never falls back to a different one. */
(function(global){
 'use strict';
 const BASE='https://raw.githubusercontent.com/Flyingsparks1130/uma-race-art/82f9fc0876103ac2378ded370065e5838cdff2c5/';
 let catalog={assets:[]},pending;
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function resolve(row,source=catalog){
  const card=row.card_id??row.variant_id??row.cardId??row.card;
  const character=row.character_id??row.characterId,costume=row.costume_id??row.costumeId;
  let found=source.assets.filter(a=>card!=null?String(a.card_id)===String(card):character!=null&&costume!=null&&String(a.character_id)===String(character)&&String(a.costume_id)===String(costume));
  if(character!=null)found=found.filter(a=>String(a.character_id)===String(character));
  if(costume!=null)found=found.filter(a=>String(a.costume_id)===String(costume));
  return found.length===1&&found[0].status==='available'?found[0]:null;
 }
 function figure(row){const a=resolve(row);return a?`<span class="uma-art" data-art-id="${esc(a.card_id)}"><img src="${BASE+esc(a.path)}" width="${a.width}" height="${a.height}" alt="${esc(a.character_name+' — '+a.outfit_name)}" loading="lazy" decoding="async"></span>`:`<span class="uma-art-placeholder" role="img" aria-label="${esc((row.uma||row.name||'Uma')+': exact outfit artwork unavailable')}">◇</span>`;}
 function attach(el){const im=el.querySelector('img');if(!im||im.dataset.observed)return;im.dataset.observed='true';const fail=()=>{el.classList.add('is-unavailable');el.setAttribute('aria-label','Exact outfit artwork unavailable');};im.addEventListener('error',fail,{once:true});if(im.complete&&!im.naturalWidth)fail();}
 const attachAll=()=>document.querySelectorAll('[data-art-id]').forEach(attach);
 function load(){if(!pending)pending=fetch('assets/uma-race-art-catalog.json',{cache:'force-cache'}).then(r=>{if(!r.ok)throw Error('Artwork catalog unavailable');return r.json();}).then(c=>{catalog=c;return c;}).catch(()=>catalog);return pending;}
 global.UmaRaceArt={resolve,figure,load,attach,attachAll};
 if(typeof module!=='undefined'&&module.exports)module.exports=global.UmaRaceArt;
})(typeof window!=='undefined'?window:globalThis);
