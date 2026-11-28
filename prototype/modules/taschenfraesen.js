// Taschenfräsen: Rechtecke weiterhin mit Rust; geschlossene freie STL-Innenkonturen
// über einen getrennten experimentellen Polygon-Vorschaualgorithmus.
// Kein G-Code, keine Kollisions-, Material- oder Maschinenprüfung.
(()=>{
'use strict';
const studio=globalThis.FertigungsstudioStudio, shared=()=>globalThis.FertigungsstudioSharedGeometry, f=globalThis.FertigungsstudioFacingModel;
if(!studio||!f||!studio.setPocketLauncher)return;
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const round=n=>Math.round(n*1000)/1000;
let controller=null,active=false,seq=0,selectedPocket=null,selectedIslands=[],selectedOperationId=null,pendingFields=null,pendingError='',pickingPocket=false,selectedFloor=null,resumeTab='shape';
// Keep selected geometry in each operation instead of losing it with the tab/dialog.
function selectionSnapshot(){
 if(!selectedPocket)return null;
 const ring=o=>({id:o.id,cadWireId:o.cadWireId||null,cadFaceId:o.cadFaceId||null,side:o.side||'inside',points:o.points.map(v=>v.slice())});
 return {version:1,outer:ring(selectedPocket),islands:selectedIslands.map(ring),
  floor:selectedFloor?{cadFaceId:selectedFloor.cadFaceId||null,z:selectedFloor.z,depth:selectedFloor.depth,point:selectedFloor.point.slice()}:null};
}
function saveSelection(){
 const op=current();if(!op||op.kind!=='pocket')return;
 op.pocket={...(op.pocket||{}),source:'model',modelSelection:selectionSnapshot()};
 studio.touch();
}
function restoreSelection(){
 const op=current(),saved=op?.pocket?.modelSelection,p=picker();
 if(!saved||saved.version!==1||!p?.hasModel()||selectedPocket)return;
 const outer=p.resolveLoop?.(saved.outer);
 if(!outer||outer.side!=='inside')return;
 try{
  selectedPocket=pickShape(outer);
  selectedIslands=[];
  for(const ref of (saved.islands||[])){
   const actual=p.resolveLoop(ref);if(!actual)throw Error('Gespeicherte Inselkontur nicht mehr vorhanden.');
   addIsland(actual);
  }
  const floor=saved.floor;
  if(floor&&Array.isArray(floor.point)&&floor.point.length===3&&floor.point.every(Number.isFinite)&&
     Number.isFinite(floor.z)&&Number.isFinite(floor.depth)&&floor.depth>0&&
     Math.abs(studio.project().stock.z-floor.z-floor.depth)<0.0001&&
     globalThis.FertigungsstudioMeshGeometry.contains(selectedPocket.points,floor.point.slice(0,2))&&
     !selectedIslands.some(island=>globalThis.FertigungsstudioMeshGeometry.contains(island.points,floor.point.slice(0,2)))){
    selectedFloor={cadFaceId:floor.cadFaceId||null,z:floor.z,depth:floor.depth,point:floor.point.slice(),meshVersion:p.modelVersion(),positionKey:positionKey()};
  }
 }catch(error){selectedPocket=null;selectedIslands=[];selectedFloor=null;}
}
// Captures both stock dimensions and STL placement. A previous pick must never
// be reused after the part was moved or the stock was resized.
function positionKey(){
 const p=studio.project(),st=p.stock||{},pos=p.partPlacement||{};
 return [st.x,st.y,st.z,pos.x,pos.y,pos.z].map(x=>String(x??'')).join('|');
}
const number=(id,name)=>{const s=$(id)?.value;if(s==null||s.trim()==='')throw Error(name+' fehlt.');const n=Number(s);if(!Number.isFinite(n))throw Error(name+' ist keine gültige Zahl.');return n};
const positive=(id,name)=>{const v=number(id,name);if(v<=0||v>1000000)throw Error(name+' muss größer als 0 sein.');return v};
const connected=()=>$('camRuntimeStatus')?.dataset.live==='true';
const current=()=>studio.currentOperation();
const tools=()=>studio.project().tools.filter(t=>f.eligible(t)&&t.type==='Schaftfräser');
const selTool=()=>studio.project().tools.find(t=>t.id===Number($('pocket-tool')?.value));
const picker=()=>globalThis.FertigungsstudioSTLPicker;
function notice(s,err=false){const e=$('pocket-message');if(e){e.textContent=s;e.classList.toggle('studio-error',err)}}
function clearIfStale(){
 const op=current();
 if(!op||op.id!==selectedOperationId){selectedPocket=null;selectedIslands=[];selectedFloor=null;selectedOperationId=op?.id??null;}
 if(selectedPocket&&(!picker()?.hasModel()||selectedPocket.meshVersion!==picker().modelVersion()||selectedPocket.positionKey!==positionKey())){selectedPocket=null;selectedIslands=[];selectedFloor=null;}
 if(selectedFloor&&(!picker()?.hasModel()||selectedFloor.meshVersion!==picker().modelVersion()||selectedFloor.positionKey!==positionKey()))selectedFloor=null;
 restoreSelection();
}
// Gültige, achsenparallele Rechteckkante: kollineare STL-Zwischenpunkte sind zulässig.
// Eine L-Form, ein schräges Rechteck oder eine äußere Silhouette wird NICHT zurechtgeraten.
function rectangle(detail){
 if(!detail||detail.side!=='inside')throw Error('Bitte eine geschlossene Innenkante der Tasche anklicken, nicht die Außenkontur des Bauteils.');
 const pts=detail.points;
 if(!Array.isArray(pts)||pts.length<4||pts.length>2048)throw Error('Die gewählte Tasche hat keine gültige Rechteckkontur.');
 if(pts.some(p=>!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite)))throw Error('Ungültige STL-Koordinaten.');
 const xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]);
 const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
 const w=maxX-minX,h=maxY-minY,eps=Math.max(0.00001,Math.max(w,h)*0.000002);
 if(w<=eps||h<=eps)throw Error('Die ausgewählte Kontur hat keine Fläche.');
 const near=(a,b)=>Math.abs(a-b)<=eps;
 const turns=[];
 for(let i=0;i<pts.length;i++){
  const a=pts[i],b=pts[(i+1)%pts.length];
  if(near(a[0],b[0])&&near(a[1],b[1]))continue;
  if(!near(a[0],b[0])&&!near(a[1],b[1]))throw Error('Diese Tasche ist nicht achsenparallel rechteckig. Freiformtaschen folgen in einer späteren Version.');
  if(!((near(a[0],b[0])&&(near(a[0],minX)||near(a[0],maxX)))||
        (near(a[1],b[1])&&(near(a[1],minY)||near(a[1],maxY)))))
   throw Error('Die gewählte Tasche ist kein achsenparalleles Rechteck.');
  turns.push({dx:b[0]-a[0],dy:b[1]-a[1]});
 }
 if(turns.length<4)throw Error('Rechteckkontur unvollständig.');
 const area=Math.abs(pts.reduce((s,p,i)=>{const q=pts[(i+1)%pts.length];return s+p[0]*q[1]-q[0]*p[1]},0)/2);
 if(Math.abs(area-w*h)>Math.max(eps*(w+h)*2,0.00001))throw Error('Die geschlossene Kante ist kein Rechteck.');
 // Every vertex must lie on one of four perimeter edges, not on an internal notch.
 if(!pts.every(p=>near(p[0],minX)||near(p[0],maxX)||near(p[1],minY)||near(p[1],maxY)))
  throw Error('Rechteckkontur mit Einbuchtung wird noch nicht unterstützt.');
 return {minX,maxX,minY,maxY,width:w,height:h};
}
function pickShape(detail){
 if(!detail||detail.side!=='inside')throw Error('Bitte eine geschlossene Innenkante der Tasche auswählen.');
 const poly=globalThis.CamPolygonPocket?.normalize(detail.points);
 if(!poly)throw Error('Freiform-Taschenbahnmodul nicht verfügbar.');
 let rect=null;
 try{rect=rectangle(detail);}catch(e){/* Nonrectangular inside loops use the polygon preview engine. */}
 return {kind:rect?'rectangle':'polygon',rect:rect||poly.bounds,
  points:poly.points,id:detail.id,meshVersion:detail.meshVersion,positionKey:positionKey()};
}
// Explicitly selected preserved areas. These are 2D exclusion boundaries,
// not inferred physical islands from the height/depth of the STL model.
function addIsland(detail){
 if(!selectedPocket)throw Error('Zuerst die äußere Tascheninnenkante auswählen.');
 if(!detail||!Array.isArray(detail.points))throw Error('Bitte eine geschlossene Inselkante anklicken.');
 if(detail.id===selectedPocket.id||selectedIslands.some(r=>r.id===detail.id))throw Error('Diese Kontur ist bereits ausgewählt.');
 if(detail.meshVersion!==selectedPocket.meshVersion||selectedPocket.positionKey!==positionKey())
  throw Error('STL-Modell oder Rohteil wurde seit der Auswahl verändert.');
 const poly=globalThis.CamPolygonPocket;
 if(!poly)throw Error('Freiform-Taschenbahnmodul fehlt.');
 const ring=poly.normalize(detail.points).points;
 poly.validateIslands(selectedPocket.points,[...selectedIslands.map(x=>x.points),ring]);
 selectedIslands.push({id:detail.id,side:detail.side||'inside',points:ring,meshVersion:detail.meshVersion,positionKey:positionKey()});
}
function fields(){return {
 source:$('pocket-source').value,toolId:Number($('pocket-tool').value),
 // Keep independent X/Y origin and dimensions. The previous dialog only
 // allowed a centrally placed rectangle with equal margins on both sides.
 startX:$('pocket-x').value,startY:$('pocket-y').value,
 sizeX:$('pocket-width').value,sizeY:$('pocket-height').value,
 depth:$('pocket-depth').value,stepdown:$('pocket-step').value,stepover:$('pocket-ae').value,clearance:$('pocket-clear').value,
 cuttingFeed:$('pocket-feed').value,plungeFeed:$('pocket-plunge').value,entry:$('pocket-entry').value,entryAngle:$('pocket-angle').value,helixRadius:$('pocket-radius').value,linkMode:$('pocket-link-mode').value,strategy:'zigzag'
};}
function prepare(){
 clearIfStale();
 const p=studio.project(),t=selTool();if(!p.stock)throw Error('Rohteil fehlt.');if(!t||!tools().includes(t))throw Error('Geeigneten Schaftfräser wählen.');
 const w=Number(p.stock.x),h=Number(p.stock.y),z=Number(p.stock.z),d=Number(t.diameter),fl=Number(t.cutLength);
 if(![w,h,z,d,fl].every(v=>Number.isFinite(v)&&v>0))throw Error('Rohteil- oder Werkzeugmaße ungültig.');
 if(!Number.isInteger(t.id)||t.id<1||t.id>9999)throw Error('Werkzeugnummer ungültig.');
 const source=$('pocket-source').value;
 let mx,my,rect,dx=0,dy=0,kind='rectangle',points=null,islands=[];
 if(source==='model'){
  if(!selectedPocket)throw Error('Bitte im Reiter „Tasche auswählen“ eine geschlossene Innenkante am STL anklicken.');
  rect=selectedPocket.rect;kind=selectedIslands.length?'polygon':(selectedPocket.kind||'rectangle');points=selectedPocket.points||null;
  if(!picker()?.hasModel()||selectedPocket.meshVersion!==picker().modelVersion()||selectedPocket.positionKey!==positionKey())
   throw Error('Rohteil oder STL-Position wurde geändert. Tasche bitte erneut anklicken.');
  islands=selectedIslands.map(r=>r.points);
  if(islands.length)globalThis.CamPolygonPocket.validateIslands(points,islands);
 }else if(source==='manual'){
  const minX=number('pocket-x','X-Start'),minY=number('pocket-y','Y-Start');
  const width=positive('pocket-width','Taschenbreite X'),height=positive('pocket-height','Taschenlänge Y');
  rect={minX,maxX:minX+width,minY,maxY:minY+height,width,height};
 }else throw Error('Unbekannte Taschenquelle.');
 // The Rust core still computes a centered rectangular raster. We translate
 // the entire neutral toolpath into the EXACT selected/metered rectangle.
 // No new CAM algorithm runs in JavaScript.
 const eps=0.00001;
 if(![rect.minX,rect.minY,rect.maxX,rect.maxY,rect.width,rect.height].every(Number.isFinite)||
   rect.minX<eps||rect.minY<eps||rect.maxX>w-eps||rect.maxY>h-eps)
  throw Error('Tasche liegt außerhalb des Rohteils oder berührt den Rohteilrand.');
 if(rect.width<=0||rect.height<=0)throw Error('Tasche hat keine gültigen Abmessungen.');
 mx=(w-rect.width)/2;my=(h-rect.height)/2;
 dx=(rect.minX+rect.maxX-w)/2;dy=(rect.minY+rect.maxY-h)/2;
 const depth=positive('pocket-depth','Taschentiefe'),step=positive('pocket-step','Tiefenzustellung');
 const stepover=positive('pocket-ae','Seitliche Zustellung'),clear=positive('pocket-clear','Sicherheitshöhe');
 const feed=positive('pocket-feed','Schnittvorschub'),plunge=positive('pocket-plunge','Eintauchvorschub');
 const entry=$('pocket-entry').value, entryAngle=number('pocket-angle','Eintauchwinkel'),helixRadius=positive('pocket-radius','Helix-Bahnradius');
 const linkMode=$('pocket-link-mode').value;
 if(!['link','retract'].includes(linkMode))throw Error('Unbekannte Bahnverbindung.');
 if(!['plunge','ramp','helix'].includes(entry))throw Error('Eintauchstrategie unbekannt.');
 if((entry==='ramp'||entry==='helix')&&(entryAngle<0.5||entryAngle>15))throw Error('Eintauchwinkel muss zwischen 0,5° und 15° liegen.');
 if(entry==='helix'&&kind!=='rectangle')throw Error('Helix ist derzeit nur für rechteckige Taschen freigegeben. Für Freiformtaschen bitte Rampe wählen.');
 if(mx<=0||my<=0||mx*2>=w||my*2>=h)throw Error('Die gewählte Tasche liegt nicht vollständig innerhalb des Rohteils.');
 if(rect.width<d||rect.height<d)throw Error('Tasche ist für den Fräser zu klein.');
 if(depth>z||depth>fl)throw Error('Taschentiefe überschreitet Rohteil oder Schneidenlänge.');
 if(stepover>d/2)throw Error('Seitliche Zustellung höchstens halber Fräserdurchmesser.');
 if(z+clear>1000000)throw Error('Sicherheitshöhe zu groß.');
 const passes=Math.ceil(depth/step),rows=Math.ceil(Math.max(0,rect.height-d)/stepover)+1;
 if(kind==='polygon'&&!globalThis.CamPolygonPocket)throw Error('Freiform-Taschenbahnmodul fehlt.');
 if(passes*(rows*2+2)>100000)throw Error('Zu viele Bahnbewegungen. Zustellungen vergrößern.');
 return {t,w,h,z,d,fl,mx,my,rect,dx,dy,source,kind,points,islands,depth,step,stepover,clear,feed,plunge,entry,entryAngle,helixRadius,linkMode,passes,rows,
   numbers:[w,h,z,depth,d,step,stepover,t.id,fl,feed,plunge,mx,my]};
}
function preview(){
 const e=$('pocket-summary');if(!e)return;
 try{const q=prepare();e.textContent=(q.kind==='polygon'?'Freiform-STL-Tasche ':q.source==='model'?'STL-Rechtecktasche ':'Rechtecktasche ')+round(q.rect.width)+' × '+round(q.rect.height)+' mm · Start X'+round(q.rect.minX)+'/Y'+round(q.rect.minY)+' · '+q.passes+' Tiefenlagen · '+(q.kind==='polygon'?'experimentelle Freiformbahn':q.rows+' Bahnen/Lage')+' · Inseln: '+q.islands.length+' · Bahn: '+(q.kind==='polygon'?(q.linkMode==='link'?'verbinden wenn frei':'Sicherheitsrückzug je Bahn'):'Rust-Zickzack')+' · Eintauchen: '+({plunge:'senkrecht',ramp:'Rampe',helix:'Helix'})[q.entry];notice('');}
 catch(error){e.textContent='Einstellungen prüfen';notice(error.message,true)}
}
function refreshSource(){
 const model=$('pocket-source').value==='model';
 $('pocket-manual').hidden=model;
 $('pocket-model').hidden=!model;const floorPanel=$('pocket-floor-section');if(floorPanel)floorPanel.hidden=!model;
 $('pocket-picked').textContent=selectedPocket?(selectedPocket.kind==='polygon'?'Freiformkontur ('+selectedPocket.points.length+' Punkte) · ':'Rechteck · ')+'X '+round(selectedPocket.rect.minX)+'…'+round(selectedPocket.rect.maxX)+' mm, Y '+round(selectedPocket.rect.minY)+'…'+round(selectedPocket.rect.maxY)+' mm.':
   'Noch keine Innenkante ausgewählt. Auf „Tasche am Modell anklicken“ klicken.';
 $('pocket-island-controls').hidden=!model||!selectedPocket;
 $('pocket-island-count').textContent=selectedIslands.length+' Insel(n) ausgewählt – bleiben bei der Taschenbearbeitung stehen. Für Änderungen am STL bitte neu auswählen.';
 $('pocket-remove-island').disabled=!selectedIslands.length;
 const floor=$('pocket-floor-picked');if(floor){floor.textContent=selectedFloor?('Bodenhöhe Z '+round(selectedFloor.z)+' mm · übernommene Frästiefe '+round(selectedFloor.depth)+' mm (ab Rohteiloberseite).'):'Noch kein Taschenboden am Modell ausgewählt.';const btn=$('pocket-pick-floor');if(btn)btn.disabled=!model||!selectedPocket;}
 preview();
}
function persist(q){
 const op=current();if(!op||op.kind!=='pocket')throw Error('Bitte Taschenfräsen auswählen.');
 op.pocket={...fields(),toolId:q.t.id,marginX:q.mx,marginY:q.my,depth:q.depth,stepdown:q.step,
  stepover:q.stepover,clearance:q.clear,cuttingFeed:q.feed,plungeFeed:q.plunge,
  source:q.source,startX:q.rect.minX,startY:q.rect.minY,sizeX:q.rect.width,sizeY:q.rect.height,
  selectedBounds:q.source==='model'?{...q.rect}:null,selectionType:q.kind,islandCount:q.islands.length,modelSelection:q.source==='model'?selectionSnapshot():null,measuredFloorZ:q.source==='model'?selectedFloor?.z??null:null,measuredFloorDepth:q.source==='model'?selectedFloor?.depth??null:null};
 studio.selectTool(q.t.id);studio.touch();studio.render();return op;
}
function save(){try{const q=prepare();persist(q);notice('Taschenparameter gespeichert. Datei → Speichern sichert das Projekt.');}catch(e){notice(e.message,true)}}
function shiftPath(raw,q){
 // Both manually positioned and STL-selected rectangles need translation.
 // The returned shape bounds and every move are checked after translation.
 const r=q.d/2,eps=0.00005;
 const shift=p=>{
  if(!Array.isArray(p)||p.length!==3||!p.every(Number.isFinite))throw Error('Ungültige Rust-Bahnkoordinaten.');
  const v=[p[0]+q.dx,p[1]+q.dy,p[2]];
  if(v[0]<q.rect.minX+r-eps||v[0]>q.rect.maxX-r+eps||v[1]<q.rect.minY+r-eps||v[1]>q.rect.maxY-r+eps)
   throw Error('Werkzeugmittelpunkt liegt außerhalb der ausgewählten Tasche.');
  return v;
 };
 raw.start=shift(raw.start);raw.moves=raw.moves.map(m=>({...m,to:shift(m.to)}));
 raw.geometry_source=q.source==='model'?'stl-rectangular-inner-edge':'manual-positioned-rectangle';
 raw.pocket_bounds=[q.rect.minX,q.rect.minY,q.rect.maxX,q.rect.maxY];
 return raw;
}
async function run(){
 if(controller)return;if(!connected()){notice('Rust-Server nicht verbunden.',true);return}
 let q;try{q=prepare();persist(q)}catch(e){notice(e.message,true);return}
 const mine=++seq,ctl=new AbortController();controller=ctl;
 $('pocket-run').disabled=true;$('pocket-save').disabled=true;notice(q.kind==='polygon'?'Experimenteller Freiform-Bahnplaner berechnet Tasche …':'Rust berechnet die Rechtecktasche …');
 try{
  let corrected;
  if(q.kind==='polygon'){
   // Separate original preview algorithm: no Rust/freeform machine-output claims.
   corrected=globalThis.CamPolygonPocket.calculate({points:q.points,stock:[q.w,q.h,q.z],diameter:q.d,
    depth:q.depth,stepdown:q.step,stepover:q.stepover,clearance:q.clear,feed:q.feed,
    plunge:q.plunge,toolNumber:q.t.id,cuttingLength:q.fl,islands:q.islands});
  }else{
   const res=await fetch('/api/pocket',{method:'POST',headers:{'Content-Type':'application/x-fertigungsstudio'},body:q.numbers.join(' '),signal:ctl.signal});
  if(!res.ok){const msg=(await res.text()).trim();throw Error(({InvalidNumbers:'Ungültige Zahlen.',InvalidNumberCount:'Falsche Parameteranzahl.',InvalidBounds:'Tasche geometrisch ungültig.',InvalidDepth:'Ungültige Tiefe.',InvalidStep:'Ungültige Zustellung.',InvalidFeed:'Ungültiger Vorschub.',InvalidClearance:'Sicherheitshöhe ungültig.',TooManyMoves:'Zu viele Bewegungen.',Cancelled:'Berechnung abgebrochen.'})[msg]||('Rust-Fehler: '+msg.slice(0,90)))}
  const raw=await res.json();if(ctl.signal.aborted||seq!==mine)return;
  if(raw.operation!=='pocket'||raw.format!=='fertigungsstudio-toolpath-v1'||!Array.isArray(raw.moves))throw Error('Unerwartetes Bahnformat.');
  if(!Array.isArray(raw.stock?.max)||Math.abs(raw.stock.max[0]-q.w)>0.00001||Math.abs(raw.stock.max[1]-q.h)>0.00001)
   throw Error('Rust-Rohteil stimmt nicht mit dem Setup überein.');
   corrected=shiftPath(raw,q);
  }
  if(ctl.signal.aborted||seq!==mine)return;
  // Keep the Rust rectangle planner unchanged; only the experimental polygon
  // raster can safely identify disconnected segments and link them.
  if(q.kind==='polygon'){
   if(!globalThis.CamPocketPathOptimizer?.optimize)throw Error('Bahnverbindungsmodul fehlt.');
   corrected=globalThis.CamPocketPathOptimizer.optimize(corrected,{points:q.points,islands:q.islands,mode:q.linkMode});
  }
  if(!globalThis.CamPocketEntry?.apply)throw Error('Eintauchbahnmodul fehlt.');
  corrected=globalThis.CamPocketEntry.apply(corrected,{type:q.entry,angle:q.entryAngle,radius:q.helixRadius,stockTop:q.z,toolDiameter:q.d,stepdown:q.step,shape:q.kind,bounds:[q.rect.minX,q.rect.minY,q.rect.maxX,q.rect.maxY]});
  if(q.kind==='polygon')globalThis.CamPolygonPocket.verify(corrected,q.points,q.islands);
  // Shared validator also checks safe rapid travel and complete retracts.
  if(!globalThis.CamPathData?.validate)throw Error('Werkzeugbahnprüfung fehlt.');
  globalThis.CamPathData.validate(corrected);
  const work=f.attachWorkCoordinates(corrected,studio.project());
  globalThis.CamPathData.validate(work);
  if(typeof loadCore!=='function')throw Error('Werkzeugbahnanzeige fehlt.');
  loadCore(work);studio.enterSimulation();controller=null;studio.closeDialog();
  studio.status((q.kind==='polygon'?'Experimentelle Freiform-STL-Tasche':q.source==='model'?'Angeklickte Rechtecktasche':'Rechtecktasche')+': '+corrected.moves.length+' Bewegungen · '+q.passes+' Tiefenlagen · '+q.islands.length+' Inseln · '+(corrected.optimization_links!==undefined?(corrected.optimization_saved_retracts+' Rückzüge eingespart · '):'')+'Eintauchen '+q.entry+'. Nur geometrische Simulation, keine CNC-Freigabe.');
 }catch(e){if(!ctl.signal.aborted)notice(e.name==='AbortError'?'Abgebrochen.':e.message,true)}
 finally{if(controller===ctl)controller=null;if($('pocket-run'))$('pocket-run').disabled=!connected();if($('pocket-save'))$('pocket-save').disabled=false;}
}
function stop(){if(!controller)return;const c=controller;controller=null;seq++;c.abort();if(connected())fetch('/api/cancel',{method:'POST',headers:{'Content-Type':'application/x-fertigungsstudio'},body:''}).catch(()=>{})}
function open(){
 const op=current();if(!op||op.kind!=='pocket'){studio.status('Bitte Taschenfräsen auswählen.');return;}
 clearIfStale();
 const p=studio.project(),ts=tools(),s={...(op.pocket||{}),...(pendingFields||{})},t=ts.find(x=>x.id===Number(s.toolId))||ts.find(x=>x.id===studio.selectedTool()?.id)||ts[0];
 pendingFields=null;
 const suggested=t?f.recommendedFeed(t,p.stock.materialId):null;
 const v=(k,def)=>s[k]??def;
 const input=(label,id,value)=>'<label>'+label+'<input type="number" min="0" max="1000000" step="any" id="'+id+'" value="'+esc(value)+'"></label>';
 const nav=[['shape','Tasche auswählen'],['cut','Fräsparameter'],['tool','Werkzeugauswahl'],['entry','Eintauchen']];
 const pane=(id,body)=>'<section id="pocket-pane-'+id+'" class="studio-op-pane" role="tabpanel" '+(id==='shape'?'':'hidden')+'>'+body+'</section>';
 const source=v('source',picker()?.hasModel()?'model':'manual');
 const sharedEdges=(()=>{try{return shared()?.listEdges()||[]}catch{return []}})();
 const sharedFaces=(()=>{try{return shared()?.listFaces()||[]}catch{return []}})();
 const sharedOptions=items=>'<option value="">Auswahl wählen …</option>'+items.map(g=>'<option value="'+esc(g.id)+'">'+esc(g.label)+'</option>').join('');
 const desc='<p><strong>Rohteil:</strong> '+round(p.stock.x)+' × '+round(p.stock.y)+' × '+round(p.stock.z)+' mm.</p>';
 const defaultMx=Number(s.marginX??round(p.stock.x/6)),defaultMy=Number(s.marginY??round(p.stock.y/6));
 const initialX=v('startX',defaultMx),initialY=v('startY',defaultMy);
 const initialW=v('sizeX',round(p.stock.x-2*defaultMx)),initialH=v('sizeY',round(p.stock.y-2*defaultMy));
 const shape=desc+'<div class="studio-modal-grid"><label>Taschenquelle<select id="pocket-source"><option value="model" '+(source==='model'?'selected':'')+'>Innenkante am STL-Modell anklicken</option><option value="manual" '+(source==='manual'?'selected':'')+'>Rechtecktasche über Maße</option></select></label></div>'+
  '<div id="pocket-model"><button type="button" id="pocket-pick-model">Tasche am Modell anklicken</button><p id="pocket-picked"></p><p>Auf die geschlossene Tascheninnenkante klicken. Danach bei Bedarf weitere geschlossene Kanten als stehen bleibende Inseln anklicken. Die Inseln sind 2D-Sperrflächen über die gesamte Frästiefe.</p><div id="pocket-island-controls"><button type="button" id="pocket-pick-island">Inselkante anklicken (+)</button> <button type="button" id="pocket-remove-island">Letzte Insel entfernen</button><p id="pocket-island-count"></p></div></div>'+
  '<div class="studio-modal-grid"><label>Gespeicherte Modellkante<select id="pocket-shared-edge">'+sharedOptions(sharedEdges)+'</select></label><button type="button" id="pocket-use-edge">Als Taschengrenze übernehmen</button><button type="button" id="pocket-use-island">Als Insel übernehmen</button></div>'+ 
  '<div id="pocket-manual"><p>Rechtecktasche frei im Rohteil platzieren. Nullpunkt der Maße: linke vordere Rohteilecke (X/Y).</p><div class="studio-modal-grid">'+input('X-Start (mm)','pocket-x',initialX)+input('Y-Start (mm)','pocket-y',initialY)+input('Breite X (mm)','pocket-width',initialW)+input('Länge Y (mm)','pocket-height',initialH)+'</div></div>';
 const cut='<div id="pocket-floor-section"><button type="button" id="pocket-pick-floor">Taschenboden am Modell anklicken</button><p id="pocket-floor-picked"></p><div class="studio-modal-grid"><label>Gespeicherte Ebene<select id="pocket-shared-face">'+sharedOptions(sharedFaces)+'</select></label><button type="button" id="pocket-use-face">Ebene als Taschenboden übernehmen</button></div></div><div class="studio-modal-grid">'+input('Taschentiefe ab Rohteiloberseite (mm)','pocket-depth',v('depth',2))+input('Tiefenzustellung (mm)','pocket-step',v('stepdown',1))+input('Seitliche Zustellung (mm)','pocket-ae',v('stepover',round(Number(t?.diameter||8)/3)))+input('Schnittvorschub (mm/min)','pocket-feed',v('cuttingFeed',suggested?round(suggested.feed):400))+input('Sicherheitshöhe über Rohteil (mm)','pocket-clear',v('clearance',5))+'</div><div class="studio-modal-grid"><label>Bahnverbindung bei Freiformtaschen<select id="pocket-link-mode"><option value="link" '+(v('linkMode','link')==='link'?'selected':'')+'>Benachbarte Bahnen verbinden, wenn frei</option><option value="retract" '+(v('linkMode','link')==='retract'?'selected':'')+'>Nach jedem Streifen abheben</option></select></label></div><p>Bahnführung: Zickzack. Bei Freiformtaschen mit oder ohne Inseln werden nur geometrisch geprüfte Streifen auf gleicher Tiefe verbunden; andernfalls bleibt der Sicherheitsrückzug. Für Rust-Rechtecktaschen bleibt die bisherige Bahnführung erhalten. Keine Materialabtrags-, Halter- oder 3D-Kollisionsprüfung.</p>';
 const tool='<div class="studio-modal-grid"><label>Schaftfräser aus Werkzeugliste<select id="pocket-tool">'+ts.map(x=>'<option value="'+esc(x.id)+'" '+(x.id===t?.id?'selected':'')+'>T'+x.id+' · '+esc(x.name)+' · Ø'+round(x.diameter)+'</option>').join('')+'</select></label></div><p id="pocket-tool-details"></p>';
 const entry='<div class="studio-modal-grid"><label>Eintauchart<select id="pocket-entry"><option value="plunge" '+(v('entry','plunge')==='plunge'?'selected':'')+'>Senkrecht (Testbetrieb)</option><option value="ramp" '+(v('entry','plunge')==='ramp'?'selected':'')+'>Schräge Rampe</option><option value="helix" '+(v('entry','plunge')==='helix'?'selected':'')+'>Spiralförmig (Helix, Rechteck)</option></select></label>'+input('Eintauchwinkel (Grad)','pocket-angle',v('entryAngle',2))+input('Helix-Bahnradius (mm)','pocket-radius',v('helixRadius',2))+input('Eintauchvorschub (mm/min)','pocket-plunge',v('plungeFeed',100))+'</div><p class="studio-op-note"><strong>Nur geometrische Vorschau:</strong> Rampe innerhalb des ersten Fräsabschnitts jeder Bahn; Helix nur bei Rechtecktaschen ohne Inseln mit genügend Randabstand. Wird der benötigte Platz nicht erreicht, erscheint ein Fehler. Kein Nachweis von freiem Material, Halterfreiheit oder Kollisionsschutz.</p>';
 studio.showDialog('Taschenfräsen · Geometrie-Vorschau',
  '<nav class="studio-op-tabs" role="tablist" aria-label="Taschenfräsen">'+nav.map(([id,label])=>'<button type="button" role="tab" data-pocket-tab="'+id+'" aria-selected="'+String(id==='shape')+'">'+label+'</button>').join('')+'</nav>'+pane('shape',shape)+pane('cut',cut)+pane('tool',tool)+pane('entry',entry)+
  '<p id="pocket-summary" class="studio-pill"></p><p id="pocket-message" role="status" aria-live="polite"></p><div class="studio-modal-actions"><button type="button" id="pocket-save">Parameter speichern</button><button type="button" class="primary" id="pocket-run" '+(!ts.length||!connected()?'disabled':'')+'>Werkzeugbahn berechnen</button><button type="button" id="pocket-close">Schließen</button></div>'+
  (!connected()?'<p class="studio-error">Rust-Vorschaudienst nicht verbunden. Über den Windows-Starter öffnen.</p>':''));
 active=true;
 const show=id=>nav.forEach(([name])=>{const n=$('pocket-pane-'+name),b=document.querySelector('[data-pocket-tab="'+name+'"]');n.hidden=name!==id;b.setAttribute('aria-selected',String(name===id));b.tabIndex=name===id?0:-1});
 const tabs=document.querySelector('.studio-op-tabs');
 tabs.addEventListener('click',e=>{const b=e.target.closest('[data-pocket-tab]');if(b)show(b.dataset.pocketTab)});
 tabs.addEventListener('keydown',e=>{if(!['ArrowRight','ArrowLeft'].includes(e.key))return;const i=nav.findIndex(([id])=>document.querySelector('[data-pocket-tab="'+id+'"]').getAttribute('aria-selected')==='true');const next=(i+(e.key==='ArrowRight'?1:-1)+nav.length)%nav.length;show(nav[next][0]);document.querySelector('[data-pocket-tab="'+nav[next][0]+'"]').focus();e.preventDefault()});
 const toolinfo=()=>{const t=selTool();$('pocket-tool-details').textContent=t?'Ø '+round(t.diameter)+' mm · Schneidenlänge '+round(t.cutLength)+' mm · Werkzeug T'+t.id:'Kein Schaftfräser in der Werkzeugliste.'};
 $('pocket-tool').onchange=()=>{toolinfo();preview()};
 for(const id of ['pocket-x','pocket-y','pocket-width','pocket-height','pocket-depth','pocket-step','pocket-ae','pocket-clear','pocket-feed','pocket-plunge','pocket-angle','pocket-radius'])$(id).addEventListener('input',preview);
 $('pocket-source').onchange=refreshSource;
 $('pocket-entry').onchange=preview;
 $('pocket-link-mode').onchange=preview;
 function pickModelEdge(mode){
  if(!picker()?.hasModel()){notice('Zuerst ein STL-Modell importieren.',true);return;}
  if(mode==='island'&&!selectedPocket){notice('Zuerst die äußere Tascheninnenkante auswählen.',true);return;}
  pendingFields={...fields(),source:'model'};resumeTab='shape';
  studio.closeDialog();
  try{
   picker().begin(detail=>{
    pickingPocket=false;
    try{
     if(mode==='island')addIsland(detail);
     else{selectedPocket=pickShape(detail);selectedIslands=[];selectedFloor=null;}
     try{shared()?.recordEdge(detail);}catch(error){console.warn('Geometrieablage: '+error.message);}saveSelection();pendingError='';
    }catch(e){if(mode==='outer'){selectedPocket=null;selectedIslands=[];}pendingError=e.message;}
    open();if(pendingError){notice(pendingError,true);pendingError='';}
   });
   pickingPocket=true;
   const overlay=$('studioModelPickHint');
   if(overlay){overlay.querySelector('strong').textContent=mode==='island'?'Insel auswählen':'Tasche auswählen';
    overlay.querySelector('span').textContent=mode==='island'?'Geschlossene Inselkante innerhalb der Tasche anklicken':'Geschlossene Tascheninnenkante anklicken';}
  }catch(e){pickingPocket=false;open();notice(e.message,true);}
 }
 function reuseEdge(mode){
  try{
   const detail=shared().getEdge($('pocket-shared-edge').value);
   if(mode==='island')addIsland(detail);
   else{selectedPocket=pickShape(detail);selectedIslands=[];selectedFloor=null;}
   pendingFields={...fields(),source:'model'};saveSelection();resumeTab='shape';
   studio.closeDialog();open();notice('Gespeicherte '+(mode==='island'?'Inselkante':'Taschenkante')+' übernommen.');
  }catch(error){notice(error.message,true);}
 }
function reuseFace(){
  try{
   if(!selectedPocket)throw Error('Bitte zuerst die Tascheninnenkante auswählen.');
   const face=shared().getFace($('pocket-shared-face').value);
   const xy=face.point.slice(0,2),geo=globalThis.FertigungsstudioMeshGeometry;
   if(!geo.contains(selectedPocket.points,xy))throw Error('Die gespeicherte Ebene liegt nicht innerhalb der gewählten Tasche.');
   if(selectedIslands.some(island=>geo.contains(island.points,xy)))throw Error('Die Ebene liegt auf einer stehen bleibenden Insel.');
   const depth=globalThis.FertigungsstudioSurfaceGeometry.faceDepth({z:face.z,horizontal:true},face.stockTop,face.modelTop,true);
   selectedFloor={cadFaceId:face.cadFaceId||null,z:face.z,depth,meshVersion:face.meshVersion,positionKey:positionKey(),point:face.point.slice()};
   pendingFields={...fields(),source:'model',depth:String(round(depth))};saveSelection();resumeTab='cut';
   studio.closeDialog();open();notice('Gespeicherte Ebene Z '+round(face.z)+' mm als Taschenboden übernommen.');
  }catch(error){notice(error.message,true)}
 }
function pickModelFloor(){
  if(!selectedPocket){notice('Zuerst die Tascheninnenkante auswählen.',true);return;}
  if(!picker()?.hasModel()){notice('Zuerst ein STL-Modell importieren.',true);return;}
  pendingFields={...fields(),source:'model'};resumeTab='cut';
  studio.closeDialog();
  try{
   picker().beginFace(face=>{
    pickingPocket=false;
    try{
     if(!selectedPocket||face.meshVersion!==selectedPocket.meshVersion||selectedPocket.positionKey!==positionKey())
      throw Error('Taschenkontur wurde inzwischen geändert. Bitte erneut auswählen.');
     const xy=face.point.slice(0,2),geo=globalThis.FertigungsstudioMeshGeometry;
     if(!geo.contains(selectedPocket.points,xy))throw Error('Die angeklickte Bodenfläche liegt nicht innerhalb der ausgewählten Tasche.');
     if(selectedIslands.some(island=>geo.contains(island.points,xy)))throw Error('Die gewählte Fläche liegt auf einer stehen bleibenden Insel.');
     const depth=globalThis.FertigungsstudioSurfaceGeometry.faceDepth({z:face.z,horizontal:true},face.stockTop,face.modelTop,true);
     selectedFloor={cadFaceId:face.cadFaceId||null,z:face.z,depth,meshVersion:face.meshVersion,positionKey:positionKey(),point:face.point.slice()};
     try{shared()?.recordFace(face);}catch(error){console.warn('Geometrieablage: '+error.message);}pendingFields={...pendingFields,depth:String(round(depth)),source:'model'};
     saveSelection();pendingError='';
    }catch(err){pendingError=err.message;}
    open();if(pendingError){notice(pendingError,true);pendingError='';}
   },{belowTop:true});
   pickingPocket=true;
   const overlay=$('studioModelPickHint');
   if(overlay){overlay.querySelector('strong').textContent='Taschenboden auswählen';overlay.querySelector('span').textContent='Waagerechte Bodenfläche innerhalb der Tasche anklicken';}
  }catch(err){pickingPocket=false;open();notice(err.message,true);}
 }
 $('pocket-use-edge').onclick=()=>reuseEdge('outer');
 $('pocket-use-island').onclick=()=>reuseEdge('island');
 $('pocket-use-face').onclick=reuseFace;
 $('pocket-pick-model').onclick=()=>pickModelEdge('outer');
 $('pocket-pick-floor').onclick=pickModelFloor;
 $('pocket-pick-island').onclick=()=>pickModelEdge('island');
 $('pocket-remove-island').onclick=()=>{selectedIslands.pop();saveSelection();refreshSource();};
 $('pocket-save').onclick=save;$('pocket-run').onclick=run;$('pocket-close').onclick=()=>studio.closeDialog();
 toolinfo();refreshSource();show(resumeTab);resumeTab='shape';
}
// Cancelling an STL pick must restore the previously entered parameters;
// the user should not have to navigate the operation tree again.
function restoreAfterCancelledPick(){
 if(!pickingPocket)return;
 pickingPocket=false;
 open();notice('Kantenauswahl abgebrochen. Die Eingaben wurden beibehalten.');
}
$('studioModelPickCancel')?.addEventListener('click',restoreAfterCancelledPick);
document.addEventListener('keydown',event=>{
 if(event.key==='Escape'&&pickingPocket){
  picker()?.end();restoreAfterCancelledPick();event.stopPropagation();
 }
},true);
$('studioDialog').addEventListener('close',()=>{if(active){active=false;stop()}});
studio.setPocketLauncher(open);
})();
