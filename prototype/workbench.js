// Always-visible operation launcher shared by the offline prototype and
// the local Rust-backed preview. Offline mode never pretends to calculate.
(()=>{
'use strict';
const cards=[...document.querySelectorAll('[data-cam-operation]')];
const status=document.getElementById('camRuntimeStatus');
const names={facing:0,pocket:1,contour:2,drilling:3};
let launchLive=null;

function activate(kind){
  for(const card of cards){
    const active=card.dataset.camOperation===kind;
    card.classList.toggle('active',active);
    card.setAttribute('aria-pressed',String(active));
  }
}
function showConcept(kind){
  const index=names[kind];
  const ribbon=document.querySelector('[data-operation="'+index+'"]');
  if(ribbon)ribbon.click();
  activate(kind);
  toast('Nur schematische Bahn. Für Rust-Berechnung Start-Fertigungsstudio.cmd starten.');
}
for(const card of cards){
  card.addEventListener('click',()=>{
    const kind=card.dataset.camOperation;
    if(!Object.hasOwn(names,kind))return;
    activate(kind);
    if(launchLive)launchLive(kind);
    else showConcept(kind);
  });
}
document.querySelectorAll('[data-operation]').forEach(ribbon=>{
  ribbon.addEventListener('click',()=>{
    const kind=Object.keys(names).find(k=>names[k]===Number(ribbon.dataset.operation));
    if(kind)activate(kind);
  });
});
document.querySelectorAll('.op').forEach((node,i)=>{
  node.addEventListener('click',()=>{
    const kind=Object.keys(names).find(k=>names[k]===i);
    if(kind)activate(kind);
  });
});
activate('facing');

// Called only from live-preview.js, which the loopback-only Rust server embeds.
globalThis.FertigungsstudioCamWorkbench={
  connect(open){
    if(typeof open!=='function')throw Error('Invalid live operation callback');
    launchLive=open;
    status.textContent='Rust-Livebetrieb · Berechnung bereit';
    status.dataset.live='true';
  },
  highlight:activate,
};
})();
