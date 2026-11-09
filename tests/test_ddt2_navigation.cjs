'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const script=fs.readFileSync('assets/ddt2-motion.js','utf8');
function browser({reduced=false,paused=false,storageFails=false}={}){
 const events={},windowEvents={},classes=new Set(),timers=[],visits=[],attributes={};
 const button={setAttribute:(key,value)=>attributes[key]=value,querySelector:()=>({textContent:''})};
 const root={classList:{add:(...args)=>args.forEach(a=>classes.add(a)),remove:(...args)=>args.forEach(a=>classes.delete(a)),toggle:(key,on)=>on?classes.add(key):classes.delete(key)}};
 const media={matches:reduced,addEventListener:(key,fn)=>events.media=fn};
 const storage={getItem:()=>{if(storageFails)throw Error('blocked');return paused?'paused':null;},setItem:()=>{if(storageFails)throw Error('blocked');}};
 const context={console,URL,WeakSet,DDT2:{runner:()=>'<svg></svg>'},localStorage:storage,MutationObserver:class{observe(){}},
   setTimeout:(fn,delay)=>{timers.push({fn,delay});return timers.length;},clearTimeout(){},
   location:{href:'https://example.com/ddt2/index.html',assign:href=>visits.push(href)},
   window:{matchMedia:()=>media,addEventListener:(key,fn)=>windowEvents[key]=fn},
   document:{documentElement:root,body:{append(){}},createElement:()=>({setAttribute(){}}),querySelector:()=>null,querySelectorAll:()=>[button],addEventListener:(key,fn)=>events[key]=fn}};
 // Reveal enumeration uses an empty document; button enumeration supplies the control.
 context.document.querySelectorAll=selector=>selector==='.ddt-motion'?[button]:[];
 vm.runInNewContext(script,context);
 function click(href,opts={}){
   let prevented=false;
   const link={href,target:opts.target||'',hasAttribute:name=>name==='download'&&!!opts.download};
   const event={button:0,defaultPrevented:false,...opts,target:{closest:selector=>selector==='.ddt-motion'?opts.motion?button:null:link},preventDefault(){prevented=true;}};
   events.click(event);return prevented;
 }
 return{click,classes,timers,visits,attributes,media,events,windowEvents};
}
let page=browser();assert.equal(page.click('https://example.com/ddt2/bracket.html'),true);assert(page.classes.has('ddt-leaving'));assert.equal(page.timers[0].delay,420);page.timers[0].fn();assert.deepEqual(page.visits,['https://example.com/ddt2/bracket.html']);page.windowEvents.pageshow();assert(!page.classes.has('ddt-leaving'));
for(const [href,options] of [
 ['https://example.com/ddt2/index.html#schedule',{}],['https://outside.example/bracket.html',{}],['https://example.com/another/bracket.html',{}],['https://example.com/ddt2/data.json',{}],
 ['https://example.com/ddt2/bracket.html',{ctrlKey:true}],['https://example.com/ddt2/bracket.html',{metaKey:true}],['https://example.com/ddt2/bracket.html',{shiftKey:true}],['https://example.com/ddt2/bracket.html',{altKey:true}],['https://example.com/ddt2/bracket.html',{button:1}],['https://example.com/ddt2/bracket.html',{target:'_blank'}],['https://example.com/ddt2/bracket.html',{download:true}],['https://example.com/ddt2/bracket.html',{defaultPrevented:true}]
]){page=browser();assert.equal(page.click(href,options),false,JSON.stringify([href,options]));assert.equal(page.timers.length,0);}
for(const options of [{reduced:true},{paused:true}]){page=browser(options);assert(page.classes.has('ddt-motion-off'));assert.equal(page.click('https://example.com/ddt2/bracket.html'),false);}
page=browser({storageFails:true});page.click('',{motion:true});assert(page.classes.has('ddt-motion-off'));assert.equal(page.attributes['aria-pressed'],'true');page.click('',{motion:true});assert(!page.classes.has('ddt-motion-off'));page.media.matches=true;page.events.media();assert(page.classes.has('ddt-motion-off'));
console.log('DDT2 navigation: normal navigation, modified clicks, downloads, deep links, reduced motion, storage failures and back/forward restoration passed.');
