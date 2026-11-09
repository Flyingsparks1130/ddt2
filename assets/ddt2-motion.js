/* Native navigation remains immediate on the standalone organizer and results tools. */
(function(){
 const main=document.querySelector('main');
 if(main&&!document.getElementById('season-root'))main.id='season-root';
 document.documentElement.classList.remove('ddt-motion-off','ddt-leaving');
})();
