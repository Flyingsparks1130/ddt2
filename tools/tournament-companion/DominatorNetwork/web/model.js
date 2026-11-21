export const styles={1:{name:'FRONT RUNNER',short:'F',color:'#35aaff'},2:{name:'PACE CHASER',short:'P',color:'#45d483'},3:{name:'LATE SURGER',short:'L',color:'#ffcf45'},4:{name:'END CLOSER',short:'E',color:'#ff5968'}};
export function podium(rank){return Number.isInteger(rank)&&rank>=1&&rank<=3?String(rank):'field';}
export function raceView(state,connected,lastCount=18){
 const live=!!(connected&&state?.active&&state.runners?.length);
 return {visible:connected,live,count:live?state.runners.length:lastCount};
}
export function renderDensity(value){return Math.min(3,Math.max(1,Number(value)||1));}
export const lamps=[['rushed','Rushed','#ffae45'],['stamina','Zero stamina','#ff5968'],['lateStart','Late start','#ffcf45'],['blocked','Blocked','#ff5968']];
export function raceLabels(info={}){
 return {track:info.track|| (info.trackId?`Track ${info.trackId}`:'TRACK TBD'),distance:info.distance>0?`${Math.round(info.distance)} m`:'DISTANCE TBD',surface:({1:'Turf',2:'Dirt'})[info.surface]||'SURFACE TBD',going:({1:'Firm',2:'Good',3:'Soft',4:'Heavy'})[info.going]||'GOING TBD',weather:({1:'Sunny',2:'Cloudy',3:'Rainy',4:'Snowy'})[info.weather]||'WEATHER TBD',season:({1:'Spring',2:'Summer',3:'Autumn',4:'Winter',5:'Spring (cherry blossoms)'})[info.season]||'SEASON TBD'};
}
export function fit(count,width,height,{compact=false,scale=1,autoFit=true,rowHeight=0}={}){
 const row=Math.max(compact?60:66,rowHeight), panelHeight=216+count*row+34;
 return {row,height:panelHeight,scale:autoFit?Math.max(.05,Math.min(scale,(width-24)/400,(height-24)/panelHeight)):scale};
}
export function teamFor(r,config){const teams=config.teams||{};return (Object.hasOwn(teams,r.trainer)?teams[r.trainer]:'')||r.club||'TEAM TBD';}
export function visibleLights(r,time){return Object.fromEntries(lamps.map(([key])=>[key,!r.finished&&!!r.lights?.[key]&&(key!=='lateStart'||(time>0&&time<6))]));}
const sampleCards=[[100601,'Oguri Cap','Starlight Beat'],[100602,'Oguri Cap','Ashen Miracle'],[100701,'Gold Ship','Red Strife'],[100901,'Daiwa Scarlet','Peak Blue'],[101301,'Mejiro McQueen','Frontline Elegance'],[106801,'Kitasan Black','Gilded Shrine to Glory'],[103001,'Rice Shower','Rosy Dreams'],[100101,'Special Week','Special Dreamer'],[100201,'Silence Suzuka','Innocent Silence'],[100301,'Tokai Teio','Peak Joy'],[100801,'Vodka','Wild Top Gear'],[106001,'Nice Nature','Poinsettia Ribbon'],[103201,'Agnes Tachyon','tach-nology'],[102101,'Tamamo Cross','Fast as Lightning'],[101401,'El Condor Pasa','El☆Número 1'],[101101,'Grass Wonder','Stone-Piercing Blue'],[106101,'King Halo','King of Emeralds'],[105201,'Haru Urara','Bestest Prize ♪']];
export function sampleRace(t,count=18,testLamp=''){
 const trainers=['ScarletAce','CrimsonFox','NightRunner','GoldRush','Moonlight','BlackCrown'];
 let runners=sampleCards.slice(0,count).map(([card,name,variant],id)=>({id,gate:id+1,card,name,variant,trainer:trainers[Math.floor(id/3)],club:id%2?'CRIMSON CLUB':'CROWN CLUB',style:id%4+1,player:id===0,distance:1200+(count-id)*3+Math.sin(t*.65+id*1.6)*9,speed:68+Math.sin(t+id)*4,finished:false,paceMode:0,lights:Object.fromEntries(lamps.map(([key],index)=>[key,testLamp==='all'||key===testLamp||(testLamp===''&&Math.floor(t/3+id)%8===index)]))}));
 runners.sort((a,b)=>b.distance-a.distance);runners.forEach((r,i)=>r.rank=i+1);
 return {active:true,demo:true,raceId:`sample-${count}`,time:testLamp==='lateStart'||testLamp==='all'?3:t%60,course:1600,raceInfo:{track:'Nakayama',distance:1600,surface:1,going:2,weather:2,season:4},runners};
}
