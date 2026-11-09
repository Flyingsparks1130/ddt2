/* Progressive motion: normal document navigation, with a short racing curtain. */
(function(){
  'use strict';
  const root=document.documentElement;
  const preference=window.matchMedia('(prefers-reduced-motion: reduce)');
  let paused=false,navigating=false,timer;
  try{paused=localStorage.getItem('ddt2-motion')==='paused';}catch{}
  const quiet=()=>paused||preference.matches;
  const curtain=document.createElement('div');curtain.className='ddt-transition';curtain.setAttribute('aria-hidden','true');
  curtain.innerHTML=`<div class="ddt-transition-lanes"><i></i><i></i><i></i></div><div class="ddt-transition-pack"><span>${DDT2.runner()}</span><span>${DDT2.runner()}</span><span>${DDT2.runner()}</span></div><span class="ddt-transition-word">DDT2 <b>ON YOUR MARK.</b></span>`;
  document.body.append(curtain);
  const update=()=>{
    root.classList.toggle('ddt-motion-off',quiet());
    document.querySelectorAll('.ddt-motion').forEach(button=>{
      button.setAttribute('aria-pressed',String(quiet()));
      button.setAttribute('aria-label',quiet()?'Enable animations':'Pause animations');
      button.title=preference.matches?'Reduced motion follows your device setting':quiet()?'Enable animations':'Pause animations';
      button.querySelector('span').textContent=quiet()?'▷':'Ⅱ';
    });
  };
  preference.addEventListener('change',update);
  const settle=()=>{clearTimeout(timer);navigating=false;root.classList.remove('ddt-leaving','ddt-arriving');};
  window.addEventListener('pageshow',settle);
  const observed=new WeakSet();
  const observer='IntersectionObserver' in window?new IntersectionObserver(entries=>entries.forEach(entry=>{
    if(entry.isIntersecting){entry.target.classList.add('ddt-revealed');observer.unobserve(entry.target);}
  }),{threshold:.08}):null;
  function enhance(){
    const main=document.querySelector('main');
    if(main&&!document.getElementById('main-content')){const anchor=document.createElement('span');anchor.id='main-content';anchor.tabIndex=-1;main.prepend(anchor);}
    document.querySelectorAll('[data-reveal],.dt-round,.race-club-card,.award-group,.rules-section').forEach((el,i)=>{
      if(observed.has(el))return;observed.add(el);
      if(observer){el.classList.add('ddt-reveal');el.style.setProperty('--reveal-delay',`${Math.min(i%4,3)*55}ms`);observer.observe(el);}
    });
    update();
  }
  const mutations=new MutationObserver(enhance);
  const main=document.querySelector('main');if(main)mutations.observe(main,{childList:true,subtree:true});
  enhance();
  document.addEventListener('click',event=>{
    const motion=event.target.closest('.ddt-motion');
    if(motion){paused=!paused;try{localStorage.setItem('ddt2-motion',paused?'paused':'enabled');}catch{}update();return;}
    const link=event.target.closest('a[href]');
    if(!link||event.defaultPrevented||event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey||link.hasAttribute('download')||link.target&&link.target!=='_self'||quiet())return;
    const target=new URL(link.href,location.href),current=new URL(location.href);
    if(target.origin!==current.origin||!target.pathname.endsWith('.html')||target.pathname===current.pathname&&target.search===current.search||!target.pathname.startsWith(current.pathname.slice(0,current.pathname.lastIndexOf('/')+1)))return;
    if(navigating){event.preventDefault();return;}
    event.preventDefault();navigating=true;root.classList.add('ddt-leaving');
    timer=setTimeout(()=>{location.assign(target.href);setTimeout(settle,1500);},420);
  });
})();
