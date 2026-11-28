/* Fertigungsstudio CAM – Bohrungen am Modell anklicken, Parameter speichern,
 * geprüfte 2.5D-Vorschau berechnen. Keine NC-Ausgabe. Apache-2.0. */
(()=>{'use strict';
const studio=globalThis.FertigungsstudioStudio;
const model=globalThis.CamDrillingModel;
const picker=()=>globalThis.FertigungsstudioSTLPicker;
if(!studio||!model||!studio.setDrillingLauncher)return;
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>Number(n).toLocaleString('de-DE',{maximumFractionDigits:4});
const op=()=>{const v=studio.currentOperation();return v?.kind==='drilling'?v:null};
const tools=()=>studio.project().tools.filter(t=>t.type==='Bohrer'&&t.category==='mill'&&Number(t.diameter)>0&&Number(t.cutLength)>0);
const fields=['depth','step','feed','clearance','tool','mode'];
let pending=null,tab='holes',picking=false,pickMode=null,pickRestore=null;
function config(){return op()?.drilling&&typeof op().drilling==='object'?op().drilling:{};}
function holeRefs(){return Array.isArray(config().holes)?config().holes:[];}
function holeGeometry(){const p=picker();if(!p?.hasModel())return [];
 return holeRefs().map(r=>{
  if(!r||!r.ref)throw Error('Ungültiger gespeicherter Bohrungseintrag.');
  const live=p.resolveLoop(r.ref);if(!live)throw Error('Eine ausgewählte Bohrung passt nicht mehr zum Modell oder Rohteil. Bitte Bohrungen neu auswählen.');
  return model.fromLoop(live,studio.project().stock.z);
 });
}
function floorGeometry(){const c=config(),p=picker();if(!c.floor)return null;
 const f=p?.resolveFace(c.floor);if(!f)throw Error('Gespeicherte Bohrungsbodenfläche passt nicht mehr zum Modell. Bitte neu auswählen.');
 return f;
}
function capture(){const v={...config(),...(pending||{})};for(const id of fields){const n=$('drill-'+id);if(n)v[id]=n.value;}return v;}
function changed(values){const c=op();if(!c)throw Error('Bitte die Bohrbearbeitung auswählen.');c.drilling={version:1,...config(),...values};studio.touch();studio.render();}
function message(v,error=false){const n=$('drill-message');if(n){n.textContent=v;n.classList.toggle('studio-error',error);}else studio.status(v);}
function save(){try{changed(capture());pending=null;message('Bohrparameter gespeichert. Datei → Speichern sichert das Projekt.');}catch(e){message(e.message,true);}}
function validate(){
 const c=capture(),p=studio.project(),hs=holeGeometry();
 if(!hs.length)throw Error('Bitte zuerst mindestens eine Bohrungskante anklicken.');
 const t=tools().find(t=>String(t.id)===String(c.tool));
 if(!t)throw Error('Bitte unter Werkzeugliste einen Bohrer mit Durchmesser und Schneidenlänge anlegen.');
 const depth=Number(c.depth),step=Number(c.step),feed=Number(c.feed),clearance=Number(c.clearance);
 const path=model.calculate({holes:hs,stock:[p.stock.x,p.stock.y,p.stock.z],tool:t,depth,step,feed,clearance,mode:c.mode});
 return {c,path,t,hs};
}
function run(){
 try{
  const {c,path,t,hs}=validate();
  globalThis.CamPathData.validate(path);
  const f=globalThis.FertigungsstudioFacingModel;
  const work=f.attachWorkCoordinates(path,studio.project());
  globalThis.CamPathData.validate(work);
  changed(c);studio.selectTool(t.id);
  if(typeof loadCore!=='function')throw Error('Werkzeugbahnanzeige ist nicht verfügbar.');
  loadCore(work);studio.enterSimulation();studio.closeDialog();
  studio.status('Bohren: '+hs.length+' Bohrungen · '+path.moves.length+' Vorschau-Bewegungen · geometrisch, keine CNC-Freigabe.');
 }catch(e){message(e.message,true);}
}
function setTab(name){tab=name;
 document.querySelectorAll('[data-drill-tab]').forEach(b=>{
  const show=b.dataset.drillTab===name;b.setAttribute('aria-selected',String(show));b.tabIndex=show?0:-1;
  $('drill-pane-'+b.dataset.drillTab).hidden=!show;
 });
}
function open(){
 if(!op())return;
 const p=studio.project(),c={depth:'3',step:'2',feed:'100',clearance:'5',mode:'simple',tool:String(tools()[0]?.id||''),...config(),...(pending||{})};
 const available=tools();
 const nav=[['holes','Bohrungen auswählen'],['params','Bohrparameter'],['tool','Werkzeugauswahl'],['cycle','Bohrzyklus']];
 const pane=(id,body)=>'<section id="drill-pane-'+id+'" class="studio-op-pane" role="tabpanel"'+(id!=='holes'?' hidden':'')+'>'+body+'</section>';
 const entry=(label,id,value)=>'<label>'+label+'<input id="drill-'+id+'" type="number" required min="0.001" step="any" value="'+esc(value)+'"></label>';
 let holes=[],pickError='';try{holes=holeGeometry();}catch(e){pickError=e.message;}
 let floor=null;try{floor=floorGeometry();}catch(e){pickError=pickError||e.message;}
 const holeText=holes.length?holes.map((h,i)=>'<div class="studio-row"><span><strong>Bohrung '+(i+1)+'</strong> · Ø '+fmt(h.diameter)+' mm · X '+fmt(h.center[0])+' / Y '+fmt(h.center[1])+(h.approximate?' · angenähert':' · STEP exakt')+'</span><button type="button" data-remove-drill="'+i+'" title="Bohrung entfernen">✕</button></div>').join(''):'<p>Noch keine Bohrung ausgewählt.</p>';
 const holePane='<p>Geschlossene <strong>Bohrungsinnenkante</strong> im Modell anklicken. Mehrere Bohrungen können nacheinander ausgewählt werden.</p><button type="button" id="drill-pick">Bohrung am Modell anklicken (+)</button><div id="drill-picked">'+holeText+'</div><p>STEP: exakter CAD-Kreis. DXF/STL: angenäherter Kreis mit Plausibilitätsprüfung.</p><button type="button" id="drill-clear">Bohrungen löschen</button>';
 const paramPane='<p><strong>Rohteilhöhe:</strong> '+fmt(p.stock.z)+' mm. Die gemeinsame Bohrtiefe für alle gewählten Bohrungen wird von der Rohteiloberseite aus gemessen.</p><button type="button" id="drill-pick-floor" '+(picker()?.modelFormat?.()==='dxf'?'disabled':'')+'>Bohrungsboden am Modell anklicken</button><p id="drill-floor-picked">'+(floor?'Boden Z '+fmt(floor.z)+' mm':'Kein Boden gewählt – Bohrtiefe manuell eingeben.')+'</p><div class="studio-modal-grid">'+entry('Bohrtiefe ab Rohteiloberseite (mm)','depth',c.depth)+entry('Bohrvorschub (mm/min)','feed',c.feed)+entry('Sicherheitshöhe über Rohteil (mm)','clearance',c.clearance)+'</div>';
 const toolPane='<p>Nur Werkzeuge vom Typ <strong>Bohrer</strong> sind auswählbar. Die Bohrergröße darf den gemessenen Bohrungsdurchmesser nicht überschreiten.</p><div class="studio-modal-grid"><label>Bohrwerkzeug<select id="drill-tool">'+(available.length?available.map(t=>'<option value="'+t.id+'" '+(String(c.tool)===String(t.id)?'selected':'')+'>T'+t.id+' · '+esc(t.name)+' · Ø '+fmt(t.diameter)+' · Schneide '+fmt(t.cutLength)+' mm</option>').join(''):'<option value="">Kein Bohrer in der Werkzeugliste</option>')+'</select></label></div>';
 const cyclePane='<div class="studio-modal-grid"><label>Bohrablauf<select id="drill-mode"><option value="simple" '+(c.mode==='simple'?'selected':'')+'>Durchgehend eintauchen</option><option value="peck" '+(c.mode==='peck'?'selected':'')+'>Bohrschritte mit vollem Rückzug</option></select></label>'+entry('Maximaler Bohrschritt (mm)','step',c.step)+'</div><p>Zwischen allen Bohrungen und nach jedem Bohrschritt wird bis zur eingestellten Sicherheitshöhe zurückgezogen. Kein G81/G83-Export; keine Spanbruch- oder Kühlschmierprüfung.</p>';
 studio.showDialog('Bohren · Modellgeometrie-Vorschau',
  '<nav class="studio-op-tabs" role="tablist" aria-label="Bohren">'+nav.map(([id,label])=>'<button type="button" role="tab" data-drill-tab="'+id+'">'+label+'</button>').join('')+'</nav>'+pane('holes',holePane)+pane('params',paramPane)+pane('tool',toolPane)+pane('cycle',cyclePane)+
  '<p id="drill-message" role="status" aria-live="polite"></p><div class="studio-modal-actions"><button type="button" id="drill-save">Parameter speichern</button><button type="button" class="primary" id="drill-run">Werkzeugbahn berechnen</button><button type="button" id="drill-close">Schließen</button></div><p class="studio-op-note">Experimentelle Bohrvorschau. Keine Prüfung von Spannmitteln, Werkzeughalter, vorhandenen Bohrungen oder Durchbruch. Kein NC-Code.</p>');
 nav.forEach(([id])=>{document.querySelector('[data-drill-tab="'+id+'"]').onclick=()=>setTab(id)});
 $('drill-save').onclick=save;$('drill-run').onclick=run;$('drill-close').onclick=()=>studio.closeDialog();
 $('drill-pick').onclick=()=>beginPick('hole');$('drill-pick-floor').onclick=()=>beginPick('floor');
 $('drill-clear').onclick=()=>{changed({holes:[],floor:null});pending=capture();studio.closeDialog();open();};
 document.querySelectorAll('[data-remove-drill]').forEach(b=>{b.onclick=()=>{
  const i=Number(b.dataset.removeDrill),refs=holeRefs().filter((_,j)=>i!==j);
  pending=capture();changed({holes:refs});studio.closeDialog();open();
 }});
 setTab(tab);if(pickError)message(pickError,true);
 pending=null;
}
function beginPick(kind){
 if(!picker()?.hasModel()){message('Zuerst ein STL-, DXF- oder STEP-Modell laden.',true);return;}
 pending=capture();tab=kind==='floor'?'params':'holes';picking=true;pickMode=kind;
 studio.closeDialog();
 try{
  const callback=d=>{
   picking=false;pickMode=null;
   try{
    if(kind==='hole'){
     const h=model.fromLoop(d,studio.project().stock.z);
     if(Math.abs(h.z-studio.project().stock.z)>0.001)throw Error('Bohrung nicht auf der Rohteiloberseite. Bitte Aufspannung prüfen.');
     if(holeRefs().some(x=>x.ref?.id===h.ref.id))throw Error('Diese Bohrung wurde bereits ausgewählt.');
     const existing=holeGeometry();if(existing.some(x=>Math.hypot(x.center[0]-h.center[0],x.center[1]-h.center[1])<0.001))throw Error('Diese Bohrungsmitte ist bereits ausgewählt.');
     if(existing.length>=200)throw Error('Maximal 200 Bohrungen je Bearbeitung.');
     const previous=holeGeometry(),newHoles=[...holeRefs(),{ref:h.ref}];
     if(previous.length&&config().floor){
      const otherFloor=picker().findBlindFloor?.(h);
      if(!otherFloor||Math.abs(otherFloor.z-config().floor.z)>0.001)
       throw Error('Unterschiedliche Bohrungsbodenhöhen: Bitte getrennte Bohrbearbeitungen anlegen.');
     }
     // For a blind STEP hole, an actual horizontal B-Rep bottom face at the
     // selected hole center provides its exact model Z. A through-hole has
     // no bottom face there, therefore no depth is inferred.
     const floor=previous.length===0?picker().findBlindFloor?.(h):null;
     if(floor){
      const measured=Number((studio.project().stock.z-floor.z).toFixed(6));
      if(measured>0){changed({holes:newHoles,floor:{cadFaceId:floor.cadFaceId,z:floor.z,point:floor.point.slice()},depth:String(measured)});
       pending={...pending,depth:String(measured)};
      }else changed({holes:newHoles});
     }else changed({holes:newHoles});
     try{globalThis.FertigungsstudioSharedGeometry?.recordEdge(d);}catch{}
    }else{
     const hs=holeGeometry();if(!hs.length)throw Error('Zuerst eine Bohrung auswählen.');
     if(!hs.some(h=>Math.hypot(h.center[0]-d.point[0],h.center[1]-d.point[1])<h.radius-0.001))throw Error('Bodenfläche liegt nicht innerhalb einer gewählten Bohrung.');
     const depth=studio.project().stock.z-d.z;
     if(depth<=0)throw Error('Bodenhöhe liegt nicht unter der Rohteiloberseite.');
     changed({floor:{cadFaceId:d.cadFaceId||null,z:d.z,point:d.point.slice()},depth:String(Number(depth.toFixed(6)))});
     pending={...pending,depth:String(Number(depth.toFixed(6)))};
     try{globalThis.FertigungsstudioSharedGeometry?.recordFace(d);}catch{}
    }
    pickRestore='';
   }catch(e){pickRestore=e.message;}
   open();if(pickRestore){message(pickRestore,true);pickRestore=null;}
  };
  if(kind==='hole')picker().begin(callback);
  else picker().beginFace(callback,{belowTop:true});
  const overlay=$('studioModelPickHint');if(overlay){overlay.querySelector('strong').textContent=kind==='hole'?'Bohrung auswählen':'Bohrungsboden auswählen';overlay.querySelector('span').textContent=kind==='hole'?'Geschlossenen Bohrungskreis anklicken (keine Außenkontur)':'Waagerechte Bodenfläche innerhalb einer gewählten Bohrung anklicken';}
 }catch(e){picking=false;open();message(e.message,true);}
}
function cancelPick(){if(!picking)return;picking=false;pickMode=null;open();message('Modellauswahl abgebrochen. Parameter bleiben erhalten.');}
$('studioModelPickCancel')?.addEventListener('click',cancelPick);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&picking){picker()?.end();cancelPick();e.stopPropagation();}},true);
studio.setDrillingLauncher(open);
globalThis.FertigungsstudioDrillingUI={open};
})();
