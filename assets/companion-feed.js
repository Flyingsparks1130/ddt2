/* Read approved DDT2 series without rewriting the organizer's source records. */
(function(global){
 'use strict';let lastGood=null;
 async function merge(index,fetcher=fetch){
  try{const response=await fetcher('data/companion/approved-results.json',{cache:'no-store'});if(response.status===404){lastGood=null;return index;}if(!response.ok)throw Error('Published companion results unavailable');const raw=await response.text();if(raw.length>10*1024*1024)throw Error('Companion export is too large');const bundle=global.CompanionContract.validate(JSON.parse(raw),'ddt2');if(!bundle.series)return index;const merged=global.DDT2SeriesContract.apply(index,bundle);lastGood=bundle;return merged;
  }catch(error){const previous=lastGood?global.DDT2SeriesContract.apply(index,lastGood):index;return {...previous,companion_warning:lastGood?'Showing the last verified companion results.':'Companion results could not be verified.'};}
 }
 global.DDT2CompanionFeed={merge};if(typeof module==='object'&&module.exports)module.exports={merge};
})(typeof window!=='undefined'?window:globalThis);
