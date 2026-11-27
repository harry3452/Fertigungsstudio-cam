// Facing workflow for the one-row studio UI. Uses the local Rust engine only.
// No browser-side toolpath fabrication, NC code or machine connection.
(()=>{
'use strict';
const studio=globalThis.FertigungsstudioStudio;
const model=globalThis.FertigungsstudioFacingModel;
if(!studio||!model)return;
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','&#39;':'&#39;'}[c]));
const fmt=n=>Number(n).toLocaleString('de-DE',{maximumFractionDigits:3});
let activeController=null,sequence=0,activeDialog=false;
const errorMap={
 InvalidNumbers:'Ungültige Zahl.',InvalidNumberCount:'Ungültige Anzahl an Parametern.',
 InvalidStock:'Rohteilmaße ungültig.',InvalidGeometry:'Geometrie ungültig.',
 InvalidToolNumber:'Werkzeugnummer ungültig.',InvalidTool:'Werkzeugdaten ungültig.',
 InvalidDepth:'Abtragstiefe überschreitet Rohteil oder Schneidenlänge.',
 InvalidStep:'Tiefen-/Seitenzustellung ungültig.',InvalidFeed:'Vorschub ungültig.',
 InvalidClearance:'Sicherheitshöhe ungültig.',TooManyMoves:'Zu viele Werkzeugbewegungen.',
 CoordinateLimit:'Koordinatengrenze überschritten.',Cancelled:'Berechnung abgebrochen.'
};
function connected(){return $('camRuntimeStatus')?.dataset.live==='true'}
function eligibleTools(){return studio.project().tools.filter(model.eligible)}
function currentOperation(){return studio.currentOperation()}
function allFields(){
 const value=id=>$(id)?.value??'';
 return {turnMode:value('face-turn-mode'),toolId:Number(value('face-tool')),depth:value('face-depth'),stepdown:value('face-stepdown'),
   stepover:value('face-stepover'),clearance:value('face-clearance'),
   cuttingFeed:value('face-cutfeed'),plungeFeed:value('face-plunge')};
}
function selectedTool(){const p=studio.project();return p.tools.find(t=>t.id===Number($('face-tool')?.value))}
function message(text,error=false){
 const node=$('face-message');if(!node)return;
 node.textContent=text;node.classList.toggle('studio-error',error);
}
function round(n){return Math.round(n*1000)/1000}
function setToolInfo(resetRates=false){
 const p=studio.project(),t=selectedTool();
 if(!t)return;
 $('face-toolinfo').textContent=t.name+' · '+t.type+' · Ø '+fmt(t.diameter)+' mm · Schneidenlänge '+fmt(t.cutLength)+' mm'+(t.holder?' · Halter '+t.holder:'');
 const rec=model.recommendedFeed(t,p.stock.materialId);
 $('face-materialfeed').textContent=rec
  ?'Materialprofil: n ≈ '+fmt(Math.round(rec.rpm))+' 1/min, F ≈ '+fmt(round(rec.feed))+' mm/min. Nur rechnerische Werte, Maschinenlimits ungeprüft.'
  :'Kein vollständiges Vc-/fz-Profil für dieses Werkzeug/Material. Vorschub selbst eingeben.';
 if(resetRates){
   $('face-stepover').value=round(Number(t.diameter)/2);
   $('face-cutfeed').value=rec?round(rec.feed):'';
   $('face-plunge').value='';
 }
}
function countPreview(){
 const p=studio.project(),t=selectedTool();
 if(!t)return;
 try{
  const fields=allFields();
  // A geometric preview does not require feed values; a real calculation does.
  const planned=model.prepare(p,t,{...fields,cuttingFeed:1,plungeFeed:1});
  $('face-count').textContent='Voraussichtlich '+planned.depthPasses+' Tiefenlagen × '+planned.rows+
   ' Querbahnen · '+planned.estimatedMoves+' Bewegungen'+
   (planned.settings.turnMode==='round'?' mit halbrunden Wendekurven.':' mit Sicherheitsrückzügen.')+
   ' Start: X'+fmt(planned.start.x)+
   ' / Y0 / Z'+fmt(planned.start.z)+' mm (rohteilbezogen).';
  const wcs=model.toWork([planned.start.x,0,planned.start.z],model.workFrame(p));
  $('face-count').textContent+=' Start in '+(p.wcs||'G54')+': X'+fmt(wcs[0])+' / Y'+fmt(wcs[1])+' / Z'+fmt(wcs[2])+' mm.';
 }catch(e){
  $('face-count').textContent=e.message;
 }
}
function open(){
 if(activeController)return; // Never replace the form during an in-flight request.
 const p=studio.project(),op=currentOperation(),tools=eligibleTools(),stock=p.stock;
 const mat=p.materials.find(m=>m.id===stock.materialId);
 if(!op||op.kind!=='facing'){studio.status('Bitte Planfräsen im Bearbeitungsbaum wählen.');return}
 const saved=op.facing||{};
 const chosen=tools.find(t=>t.id===saved.toolId)||tools.find(t=>t.id===studio.selectedTool()?.id)||tools[0];
 const depth=saved.depth??Math.min(1,Number(stock.z));
 const stepdown=saved.stepdown??depth;
 const stepover=saved.stepover??(chosen?Math.round(Number(chosen.diameter)*500)/1000:'');
 const clearance=saved.clearance??5;
 const profile=chosen?model.recommendedFeed(chosen,stock.materialId):null;
 const cuttingFeed=saved.cuttingFeed??(profile?round(profile.feed):'');
 const plungeFeed=saved.plungeFeed??'';
 const turnMode=saved.turnMode??'round';
 const f=(label,id,value,opts='')=>'<label>'+label+'<input id="'+id+'" type="number" step="any" min="0.001" value="'+esc(value)+'" '+opts+'></label>';
 const chooser='<label>Fräswerkzeug aus der Bibliothek<select id="face-tool">'+tools.map(t=>
   '<option value="'+esc(t.id)+'" '+(t.id===chosen?.id?'selected':'')+'>T'+t.id+' · '+esc(t.name)+' · Ø'+fmt(t.diameter)+'</option>').join('')+'</select></label>';
 let wcsText='';
 try{
  const frame=model.workFrame(p);
  wcsText='<p><strong>Werkstücknullpunkt:</strong> '+frame.system+' · X '+fmt(frame.origin_local[0])+
   ' / Y '+fmt(frame.origin_local[1])+' / Z '+fmt(frame.origin_local[2])+
   ' mm · XY-Drehung '+frame.rotation_degrees+'° · Z+ '+(frame.reverse_z?'nach unten':'nach oben')+'.</p>';
 }catch(error){wcsText='<p class="studio-error">Nullpunktfehler: '+esc(error.message)+'</p>';}

 studio.showDialog('Planfräsen · echte Rust-Berechnung',
  '<p><strong>Rohteil aus Setup:</strong> '+fmt(stock.x)+' × '+fmt(stock.y)+' × '+fmt(stock.z)+
  ' mm · Material: '+esc(mat?.name||'nicht gefunden')+'. Bearbeitungsrichtung entlang X.</p>'+
  wcsText+
  '<div class="studio-modal-grid">'+chooser+'</div>'+
  '<p id="face-toolinfo"></p>'+
  '<div class="studio-modal-grid">'+
   f('Abtragstiefe gesamt (mm)','face-depth',depth)+
   f('Tiefenzustellung je Lage (mm)','face-stepdown',stepdown)+
   f('Seitliche Zustellung (mm, max. Ø/2)','face-stepover',stepover)+
   f('Sicherheitshöhe über Rohteil (mm)','face-clearance',clearance)+
   f('Schnittvorschub (mm/min)','face-cutfeed',cuttingFeed)+
   f('Eintauchvorschub (mm/min)','face-plunge',plungeFeed)+
  '</div><div class="studio-modal-grid"><label>Wenden am Bahnende<select id="face-turn-mode">'+
  '<option value="round" '+(turnMode==='round'?'selected':'')+'>Halbrunde Wendekurve · ohne Anheben</option>'+
  '<option value="lift" '+(turnMode==='lift'?'selected':'')+'>Anheben auf Sicherheitshöhe</option>'+
  '</select></label></div><p id="face-materialfeed"></p>'+
  '<p id="face-count" class="studio-pill"></p>'+
  '<p>Bei <strong>halbrunder Wende</strong> verbindet der Fräser die Bahnen auf gleicher Frästiefe und fährt die nächste Bahn gegenläufig. Der Bogen besteht aus kurzen geraden Vorschubsegmenten (Abweichung höchstens 0,02 mm); zwischen Tiefenlagen wird weiterhin auf Sicherheitshöhe zurückgezogen. Die Wendekurve läuft zusätzlich außerhalb der Rohteilkante. <strong>Außerhalb des Rohteils muss Freiraum vorhanden sein.</strong> Keine Spannmittel-, Kollisions-, Maschinen- oder Materialabtragsprüfung.</p>'+
  '<p id="face-message" role="status" aria-live="polite"></p>'+
  '<div class="studio-modal-actions"><button type="button" id="face-save">Parameter speichern</button>'+
  '<button type="button" id="face-calculate" class="primary" '+(!connected()||!tools.length?'disabled':'')+
  '>Werkzeugbahn berechnen</button><button type="button" id="face-close">Schließen</button></div>'+
  (!connected()?'<p class="studio-error">Nur offline geöffnet: Berechnung erst nach Start von Start-Fertigungsstudio.cmd im lokalen Rust-Livebetrieb möglich. Parameter können trotzdem gespeichert werden.</p>':''));
 activeDialog=true;
 if(!tools.length){
  message('Kein geeigneter Schaft- oder Planfräser mit gültiger Geometrie vorhanden. Zuerst Werkzeugbibliothek ergänzen.',true);
  return;
 }
 $('face-tool').addEventListener('change',()=>{setToolInfo(true);countPreview()});
 for(const id of ['face-depth','face-stepdown','face-stepover','face-clearance'])$(id).addEventListener('input',countPreview);
 $('face-turn-mode').addEventListener('change',countPreview);
 $('face-save').onclick=save;
 $('face-close').onclick=()=>studio.closeDialog();
 $('face-calculate').onclick=calculate;
 setToolInfo(false);countPreview();
}
function persist(fields){
 const p=studio.project(),t=selectedTool(),op=currentOperation();
 if(!op||op.kind!=='facing')throw Error('Planfräsen ist nicht mehr ausgewählt.');
 // Validate stock, geometry and depth even while the user has not entered feeds.
 model.prepare(p,t,{...fields,cuttingFeed:1,plungeFeed:1});
 for(const [label,value] of [['Schnittvorschub',fields.cuttingFeed],['Eintauchvorschub',fields.plungeFeed]]){
  if(value!==''&&(!Number.isFinite(Number(value))||Number(value)<=0))throw Error(label+' muss positiv sein oder leer bleiben.');
 }
 op.facing={
  toolId:t.id,
  depth:Number(fields.depth),stepdown:Number(fields.stepdown),
  stepover:Number(fields.stepover),clearance:Number(fields.clearance),
  turnMode:fields.turnMode,
  cuttingFeed:fields.cuttingFeed===''?'':Number(fields.cuttingFeed),
  plungeFeed:fields.plungeFeed===''?'':Number(fields.plungeFeed),
 };
 studio.selectTool(t.id);studio.touch();
 return op.facing;
}
function save(){
 try{
  persist(allFields());
  message('Planfräsparameter im Projekt gespeichert. Zum dauerhaften Sichern Datei → Speichern wählen.');
 }catch(e){message(e.message,true)}
}
async function calculate(){
 if(activeController)return;
 if(!connected()){message('Rust-Server nicht verbunden. Keine Berechnung möglich.',true);return;}
 const p=studio.project(),t=selectedTool(),fields=allFields();
 let prepared;
 try{prepared=model.prepare(p,t,fields)}catch(e){message(e.message,true);return;}
 persist(fields);
 const controller=new AbortController(),mine=++sequence;
 activeController=controller;
 $('face-calculate').disabled=true;$('face-save').disabled=true;
 message('Rust berechnet die Planfräsbahn …');
 try{
  const response=await fetch('/api/facing',{
    method:'POST',headers:{'Content-Type':'application/x-fertigungsstudio'},
    body:prepared.numbers.join(' '),signal:controller.signal,
  });
  if(!response.ok){
   const error=(await response.text()).trim();
   throw Error(errorMap[error]||('Rust-Fehler: '+error.slice(0,120)));
  }
  const result=await response.json();
  if(controller.signal.aborted||sequence!==mine)return;
  const framed=model.attachWorkCoordinates(result,p);
  // Use the existing strict neutral-toolpath validator; never draw unchecked data.
  if(typeof loadCore!=='function')throw Error('Rust-Werkzeugbahnansicht nicht geladen.');
  loadCore(framed);
  studio.enterSimulation();
  activeController=null; // Successful response must not trigger cancellation on dialog close.
  studio.closeDialog();
  studio.status('Planfräsen '+(fields.turnMode==='round'?'mit Wendekurve':'mit Rückzug')+': '+result.moves.length+' Bewegungen, '+
   result.depth_passes+' Tiefenlagen, '+result.rows_per_pass+
   ' Bahnen je Lage · '+(p.wcs||'G54')+'-Koordinaten vorhanden. Nur Simulation – keine Maschine/NC-Ausgabe.');
 }catch(e){
  if(controller.signal.aborted){return}
  message(e.name==='AbortError'?'Berechnung abgebrochen.':e.message,true);
 }finally{
  if(activeController===controller)activeController=null;
  const button=$('face-calculate'),saveBtn=$('face-save');
  if(button)button.disabled=!connected();
  if(saveBtn)saveBtn.disabled=false;
 }
}
function cancel(){
 if(!activeController)return;
 const controller=activeController;activeController=null;sequence++;controller.abort();
 if(connected())fetch('/api/cancel',{method:'POST',headers:{'Content-Type':'application/x-fertigungsstudio'},body:''}).catch(()=>{});
}
$('studioDialog').addEventListener('close',()=>{
 if(activeDialog){activeDialog=false;cancel()}
});
studio.setFacingLauncher(open);
})();
