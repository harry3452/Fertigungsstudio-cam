// First editable 2D rectangular contour operation; numerical Rust toolpaths only.
(()=>{
'use strict';
const studio=globalThis.FertigungsstudioStudio;
const model=globalThis.FertigungsstudioContourModel;
const facing=globalThis.FertigungsstudioFacingModel;
if(!studio||!model||!facing)return;
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','&#39;':'&#39;'}[c]));
const fmt=v=>Number(v).toLocaleString('de-DE',{maximumFractionDigits:3});
const errors={
 InvalidNumbers:'Ungültige Zahl.',InvalidNumberCount:'Falsche Anzahl an Parametern.',
 InvalidStock:'Rohteilmaße ungültig.',InvalidTool:'Werkzeugdaten ungültig.',
 InvalidToolNumber:'Werkzeugnummer ungültig.',InvalidBounds:'Konturgeometrie ungültig oder zu wenig Platz.',
 InvalidDirection:'Ungültige Umlaufrichtung.',InvalidDepth:'Abtragstiefe oder Schneidenlänge ungültig.',
 InvalidStep:'Tiefenzustellung ungültig.',InvalidFeed:'Vorschub ungültig.',
 InvalidClearance:'Sicherheitshöhe ungültig.',TooManyMoves:'Zu viele Bewegungen.',
 CoordinateLimit:'Koordinatengrenze überschritten.',Cancelled:'Berechnung abgebrochen.'
};
let controller=null,revision=0,activeDialog=false;
const connected=()=>$('camRuntimeStatus')?.dataset.live==='true';
const eligible=()=>studio.project().tools.filter(model.eligible);
const current=()=>studio.currentOperation();
const round=n=>Math.round(n*1000)/1000;
function fields(){
 const v=id=>$(id)?.value??'';
 return {toolId:Number(v('contour-tool')),side:v('contour-side'),direction:v('contour-direction'),
  spindle:v('contour-spindle'),depth:v('contour-depth'),stepdown:v('contour-stepdown'),
  clearance:v('contour-clearance'),cuttingFeed:v('contour-feed'),plungeFeed:v('contour-plunge'),
  marginX:v('contour-margin-x'),marginY:v('contour-margin-y')};
}
function toolSelected(){return studio.project().tools.find(t=>t.id===Number($('contour-tool')?.value))}
function message(msg,error=false){
 const e=$('contour-message');if(!e)return;
 e.textContent=msg;e.classList.toggle('studio-error',error);
}
function setToolInfo(reset=false){
 const p=studio.project(),t=toolSelected();if(!t)return;
 $('contour-tool-info').textContent=t.name+' · Ø'+fmt(t.diameter)+' mm · Schneidenlänge '+fmt(t.cutLength)+' mm';
 const rates=model.recommendedFeed(t,p.stock.materialId);
 $('contour-material-info').textContent=rates
  ?'Materialprofil: n ≈ '+fmt(Math.round(rates.rpm))+' 1/min · F ≈ '+fmt(round(rates.feed))+' mm/min. Nur rechnerisch.'
  :'Kein vollständiges Vc-/fz-Profil. Schnitt- und Eintauchvorschub selbst eingeben.';
 if(reset){$('contour-feed').value=rates?round(rates.feed):'';$('contour-plunge').value='';}
}
function refreshSide(){
 const inside=$('contour-side').value==='inside';
 $('contour-margins').hidden=!inside;
 $('contour-warning').textContent=inside
  ?'Innenkontur: Der Fräser taucht derzeit am Startpunkt senkrecht ein. Freigeschnittener Startbereich oder geeignete Vorbohrung ist vorausgesetzt, aber nicht geprüft. Keine Freigabe zum realen Fräsen.'
  :'Außenkontur: Werkzeugmittelpunkt um den halben Durchmesser nach außen versetzt; der Start liegt außerhalb des Rohblocks. Spannmittel und freier Raum sind ungeprüft.';
 if(!inside){$('contour-margin-x').value='0';$('contour-margin-y').value='0';}
 countPreview();
}
function countPreview(){
 const p=studio.project(),t=toolSelected();if(!t)return;
 try{
  const planned=model.prepare(p,t,{...fields(),cuttingFeed:1,plungeFeed:1});
  const mode=planned.settings.clockwise?'im Uhrzeigersinn':'gegen Uhrzeigersinn';
  const f=facing.workFrame(p);
  const wp=facing.toWork([planned.start.x,planned.start.y,planned.start.z],f);
  $('contour-count').textContent=planned.depthPasses+' Tiefenlagen · '+planned.estimatedMoves+
   ' Bewegungen · '+mode+' · Versatz Ø/2 · Start rohteilbezogen X'+fmt(planned.start.x)+
   ' Y'+fmt(planned.start.y)+' Z'+fmt(planned.start.z)+' mm · '+f.system+
   ' X'+fmt(wp[0])+' Y'+fmt(wp[1])+' Z'+fmt(wp[2])+' mm.';
 }catch(e){$('contour-count').textContent=e.message;}
}
function open(){
 if(controller)return;
 const p=studio.project(),op=current(),tools=eligible();
 if(!op||op.kind!=='contour'){studio.status('Bitte Konturfräsen auswählen.');return}
 const saved=op.contour||{},t=tools.find(x=>x.id===saved.toolId)||tools.find(x=>x.id===studio.selectedTool()?.id)||tools[0];
 const side=saved.side??(op.name==='Innenkontur'?'inside':'outside');
 const direction=saved.direction??'climb',spindle=saved.spindle??'M3';
 const depth=saved.depth??Math.min(1,Number(p.stock.z));
 const stepdown=saved.stepdown??depth;
 const clearance=saved.clearance??5;
 const suggested=t?model.recommendedFeed(t,p.stock.materialId):null;
 const feed=saved.cuttingFeed??(suggested?round(suggested.feed):'');
 const plunge=saved.plungeFeed??'';
 const mx=saved.marginX??(side==='inside'?round(p.stock.x/8):0);
 const my=saved.marginY??(side==='inside'?round(p.stock.y/8):0);
 const opt=(id,val,caption,selected)=>'<option value="'+val+'" '+(selected===val?'selected':'')+'>'+caption+'</option>';
 const input=(label,id,v)=>'<label>'+label+'<input id="'+id+'" type="number" min="0" step="any" value="'+esc(v)+'"></label>';
 studio.showDialog('2D-Konturfräsen · echte Rust-Berechnung',
  '<p><strong>Rohteil:</strong> '+fmt(p.stock.x)+' × '+fmt(p.stock.y)+' × '+fmt(p.stock.z)+
  ' mm · rechteckige Kontur, nicht aus CAD importiert.</p>'+
  '<div class="studio-modal-grid"><label>Kontur<select id="contour-side">'+
  opt('contour-side','outside','Außenkontur · Rohteilrand',side)+
  opt('contour-side','inside','Innenkontur · Rechteck',side)+'</select></label>'+
  '<label>Schaftfräser aus Werkzeugliste<select id="contour-tool">'+tools.map(x=>
  '<option value="'+esc(x.id)+'" '+(x.id===t?.id?'selected':'')+'>T'+x.id+' · '+esc(x.name)+' · Ø'+fmt(x.diameter)+'</option>').join('')+'</select></label></div>'+
  '<p id="contour-tool-info"></p><div class="studio-modal-grid">'+
  input('Abtragstiefe gesamt (mm)','contour-depth',depth)+
  input('Tiefenzustellung je Lage (mm)','contour-stepdown',stepdown)+
  input('Sicherheitshöhe über Rohteil (mm)','contour-clearance',clearance)+
  input('Schnittvorschub (mm/min)','contour-feed',feed)+
  input('Eintauchvorschub (mm/min)','contour-plunge',plunge)+'</div>'+
  '<div class="studio-modal-grid"><label>Fräsrichtung<select id="contour-direction">'+
  opt('contour-direction','climb','Gleichlauf',direction)+
  opt('contour-direction','conventional','Gegenlauf',direction)+'</select></label>'+
  '<label>Spindeldrehrichtung<select id="contour-spindle">'+
  opt('contour-spindle','M3','M3 · rechtsdrehend',spindle)+
  opt('contour-spindle','M4','M4 · linksdrehend',spindle)+'</select></label></div>'+
  '<div id="contour-margins" class="studio-modal-grid" '+(side==='outside'?'hidden':'')+'>'+
  input('Randabstand X für Innenkontur (mm)','contour-margin-x',mx)+
  input('Randabstand Y für Innenkontur (mm)','contour-margin-y',my)+'</div>'+
  '<p id="contour-material-info"></p><p id="contour-count" class="studio-pill"></p>'+
  '<p id="contour-warning" class="studio-error"></p>'+
  '<p>Werkzeugradiusversatz nur für die vier geraden Rechteckseiten. Gleichlauf/Gegenlauf beruht auf M3/M4 und der ausgewählten Innen-/Außenseite. Kein beliebiger CAD-Umriss, kein seitlicher Einfahrbogen, keine Kollisions-, Spannmittel- oder Materialabtragsprüfung. Nur Simulation, kein G-Code.</p>'+
  '<p id="contour-message" role="status" aria-live="polite"></p>'+
  '<div class="studio-modal-actions"><button id="contour-save" type="button">Parameter speichern</button>'+
  '<button id="contour-run" type="button" class="primary" '+(!connected()||!tools.length?'disabled':'')+
  '>Werkzeugbahn berechnen</button><button id="contour-close" type="button">Schließen</button></div>'+
  (!connected()?'<p class="studio-error">Rust-Server nicht verbunden. Lokal mit dem Windows-Starter öffnen.</p>':''));
 activeDialog=true;
 if(!tools.length){message('Kein geeigneter Schaftfräser in der Werkzeugliste. Bitte zuerst Werkzeug anlegen.',true);return}
 $('contour-tool').onchange=()=>{setToolInfo(true);countPreview()};
 $('contour-side').onchange=()=>{
  if($('contour-side').value==='inside'&&Number($('contour-margin-x').value)===0){
   $('contour-margin-x').value=round(p.stock.x/8);
   $('contour-margin-y').value=round(p.stock.y/8);
  }
  refreshSide();
 };
 for(const id of ['contour-depth','contour-stepdown','contour-clearance','contour-margin-x','contour-margin-y'])
  $(id).addEventListener('input',countPreview);
 $('contour-direction').onchange=countPreview;
 $('contour-spindle').onchange=countPreview;
 $('contour-save').onclick=save;
 $('contour-close').onclick=()=>studio.closeDialog();
 $('contour-run').onclick=calculate;
 setToolInfo(false);
 refreshSide();
}
function persist(values){
 const p=studio.project(),t=toolSelected(),op=current();
 if(!op||op.kind!=='contour')throw Error('Konturbearbeitung wurde gewechselt.');
 model.prepare(p,t,{...values,cuttingFeed:1,plungeFeed:1});
 for(const key of ['cuttingFeed','plungeFeed']){
  if(values[key]!==''&&(!Number.isFinite(Number(values[key]))||Number(values[key])<=0))
   throw Error('Schnitt- und Eintauchvorschub müssen positiv oder leer sein.');
 }
 op.contour={toolId:t.id,side:values.side,direction:values.direction,spindle:values.spindle,
  depth:Number(values.depth),stepdown:Number(values.stepdown),clearance:Number(values.clearance),
  marginX:Number(values.marginX),marginY:Number(values.marginY),
  cuttingFeed:values.cuttingFeed===''?'':Number(values.cuttingFeed),
  plungeFeed:values.plungeFeed===''?'':Number(values.plungeFeed)};
 op.name=values.side==='inside'?'Innenkontur':'Außenkontur';
 studio.selectTool(t.id);studio.touch();studio.render();
 return op.contour;
}
function save(){
 try{persist(fields());message('Konturparameter im Projekt gespeichert. Datei → Speichern sichert sie dauerhaft.')}
 catch(e){message(e.message,true)}
}
async function calculate(){
 if(controller)return;
 if(!connected()){message('Rust-Server nicht verbunden.',true);return;}
 const p=studio.project(),t=toolSelected(),values=fields();
 let prepared;
 try{prepared=model.prepare(p,t,values);persist(values)}
 catch(e){message(e.message,true);return}
 const mine=++revision,active=new AbortController();controller=active;
 $('contour-run').disabled=true;$('contour-save').disabled=true;
 message('Rust berechnet rechteckige '+(values.side==='inside'?'Innen-':'Außen-')+'kontur …');
 try{
  const response=await fetch('/api/contour',{method:'POST',headers:{'Content-Type':'application/x-fertigungsstudio'},
   body:prepared.numbers.join(' '),signal:active.signal});
  if(!response.ok){const code=(await response.text()).trim();throw Error(errors[code]||('Rust-Fehler: '+code.slice(0,120)))}
  const raw=await response.json();
  if(active.signal.aborted||mine!==revision)return;
  if(raw.contour_side!==values.side||
     raw.contour_direction!==(prepared.settings.clockwise?'cw':'ccw'))
   throw Error('Berechnete Kontur entspricht nicht den gewählten Parametern.');
  const transformed=facing.attachWorkCoordinates(raw,p);
  if(typeof loadCore!=='function')throw Error('3D-Bahnanzeige nicht vorhanden.');
  loadCore(transformed);
  studio.enterSimulation();
  controller=null;
  studio.closeDialog();
  studio.status((values.side==='inside'?'Innenkontur':'Außenkontur')+' berechnet: '+
   raw.moves.length+' Bewegungen · '+prepared.depthPasses+' Tiefenlagen · '+
   (values.direction==='climb'?'Gleichlauf':'Gegenlauf')+' · '+values.spindle+
   '. Nur Simulation, keine CNC-Freigabe.');
 }catch(e){
  if(!active.signal.aborted)message(e.name==='AbortError'?'Abgebrochen.':e.message,true);
 }finally{
  if(controller===active)controller=null;
  const run=$('contour-run'),save=$('contour-save');
  if(run)run.disabled=!connected();
  if(save)save.disabled=false;
 }
}
function cancel(){
 if(!controller)return;
 const c=controller;controller=null;revision++;c.abort();
 if(connected())fetch('/api/cancel',{method:'POST',
  headers:{'Content-Type':'application/x-fertigungsstudio'},body:''}).catch(()=>{});
}
$('studioDialog').addEventListener('close',()=>{if(activeDialog){activeDialog=false;cancel()}});
studio.setContourLauncher(open);
})();
