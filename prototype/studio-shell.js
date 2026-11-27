// Fertigungsstudio user-configurable desktop UI. The Rust CAM engine is unchanged.
// Dialogs store editable project/configuration data, not certified machining paths.
(()=>{
'use strict';
if(globalThis.FertigungsstudioStudio)return;
const host=document.createElement('div');
host.className='studio-shell';
host.id='studioShell';
host.innerHTML='<div class="studio-ribbon"><nav class="studio-menus" id="studioMenus" aria-label="Fertigungsfunktionen"></nav><div class="studio-theme"><small>DESIGN</small><div><button type="button" data-theme="light" aria-pressed="false" aria-label="Hell">☀</button><button type="button" data-theme="dark" aria-pressed="true" aria-label="Dunkel">☾</button></div></div></div><div class="studio-main"><aside class="studio-tree" aria-label="Bearbeitungsbaum"><h2>BEARBEITUNGSBAUM</h2><div class="studio-project" id="studioProject"></div><h3>Bearbeitungen</h3><div id="studioOperations"></div></aside><div class="studio-scene" id="studioScene"><div id="studioSim" class="studio-sim-controls" hidden><button id="studioPlay" type="button">▶ Start</button><input id="studioProgress" type="range" min="0" max="1000" value="0" aria-label="Simulationsposition"><label><input id="studioCut" type="checkbox" checked> <span style="color:#65e2b4">●</span> Schnitt</label><label><input id="studioRapid" type="checkbox" checked> <span style="color:#ee9191">●</span> Eilgang</label><label><input id="studioLead" type="checkbox" checked> <span style="color:#e9bf6f">●</span> An-/Abfahrt (Z)</label><label>Werkzeug <select id="studioToolMode"><option value="full">Komplett</option><option value="cut">Nur Schneide</option><option value="off">Ausblenden</option></select></label><label><input id="studioHolder" type="checkbox" checked> Halter</label><button id="studioShowAll" type="button">Alle Bahnen</button><button id="studioHideAll" type="button">Keine Bahnen</button></div></div></div><div class="studio-info" id="studioInfo" role="status">Bedienentwurf: keine NC-Ausgabe, keine Kollisionsprüfung.</div>';
document.body.insertBefore(host,document.body.firstChild);
const scene=document.querySelector('.layout .view');
if(!scene)throw Error('Legacy CAM scene missing');
host.querySelector('#studioScene').insertBefore(scene,host.querySelector('#studioSim'));
document.body.classList.add('studio-ready');
const $=id=>document.getElementById(id);
const escapeHTML=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','&#39;':'&#39;'}[c]));
const num=(v,def=0)=>{const n=Number(v);return Number.isFinite(n)?n:def};
const mm=v=>Number(v).toLocaleString('de-DE',{maximumFractionDigits:3});
const uid=arr=>Math.max(0,...arr.map(a=>a.id))+1;
const iconPaths={
'Datei':'M7 3h12l7 7v19H7z M19 3v8h7 M11 17h11 M11 22h11',
'Setup':'M16 3v26 M3 16h26 M16 6a10 10 0 1 1 0 20a10 10 0 1 1 0-20 M16 12a4 4 0 1 0 0 8a4 4 0 1 0 0-8',
'Werkzeugliste':'M5 4h9v12l-4.5 6L5 16z M5 10h9 M9.5 22v7 M21 4h7v20l-3.5 5-3.5-5z M21 12h7',
'Fräsen':'M4 22h24v6H4z M7 18h18 M12 3h8v10l-4 5-4-5z M12 9h8',
'3D Fräsen':'M16 3 28 10v13l-12 7L4 23V10z M4 10l12 7 12-7 M16 17v13',
'Drehen':'M5 7h7v18H5z M12 10h11v12H12z M23 11h4v10h-4 M2 16h28',
'Laser':'M9 3h14v7H9z M16 10v7 M10 27h12 M16 17l-5 8m5-8 5 8m-5-8v9',
'Sim':'M16 4a12 12 0 1 0 0 24a12 12 0 1 0 0-24 M12 9l11 7-11 7z',
'Post':'M7 3h12l7 7v19H7z M19 3v8h7 M11 17h11 M11 22h11 M11 26h7'
};
const opKinds={Planfräsen:'facing',Außenkontur:'contour',Taschenfräsen:'pocket',Bohren:'drilling','2D Kontur':'contour','2D Tasche':'pocket'};
const options={
 'Datei':[['Neues Projekt','new'],['Projekt öffnen','open'],['Bauteil laden','part'],['–','divider'],['Speichern','save'],['Speichern unter…','saveas'],['–','divider'],['Programm beenden','exit']],
 'Setup':[['Aufspannung','setup'],['Rohteil und Material','stock'],['Nullpunkt und Achsausrichtung','origin'],['–','divider'],['Materialverwaltung','materials']],
 'Fräsen':[['Planfräsen','facing'],['Außenkontur','contour'],['Taschenfräsen','pocket'],['Bohren','drilling'],['Gewindefräsen','future']],
 '3D Fräsen':[['3D Schruppen','future'],['3D Schlichten','future'],['Parallelfräsen','future'],['Restmaterial','future']],
 'Drehen':[['Plandrehen','future'],['Längsdrehen','future'],['Innendrehen','future'],['Einstechen','future'],['Gewindedrehen','future']],
 'Laser':[['Konturschnitt','future'],['Gravieren','future'],['Markieren','future']]
};
const defaults=()=>({
 formatVersion:1,name:'Neues Projekt',part:'Demobauteil (Illustration)',setup:'Aufspannung 1',wcs:'G54',
 stock:{x:120,y:80,z:20,materialId:1},
 origin:{x:0,y:0,z:20,rotation:0,reverseZ:false},
 materials:[
 {id:1,name:'Aluminium EN AW-6082',group:'Aluminium',grade:'EN AW-6082',hardness:''},
 {id:2,name:'Stahl C45',group:'Stahl',grade:'C45',hardness:''},
 {id:3,name:'Edelstahl 1.4301',group:'Edelstahl',grade:'1.4301',hardness:''}
 ],
 tools:[
 {id:1,name:'Planfräser Ø32',category:'mill',type:'Planfräser',diameter:32,cutLength:10,totalLength:80,teeth:4,radius:0,insert:'',holder:'',holderCad:'',coneAngle:30,threadPitch:1.5,threadHand:'Rechts',turnAngle:95,profiles:{}},
 {id:2,name:'Schaftfräser Ø8',category:'mill',type:'Schaftfräser',diameter:8,cutLength:24,totalLength:70,teeth:3,radius:0,insert:'',holder:'',holderCad:'',profiles:{}},
 {id:3,name:'Außendrehmeißel',category:'turn',type:'Außendrehmeißel',diameter:0,cutLength:0,totalLength:70,teeth:1,radius:.8,insert:'CNMG',holder:'20 × 20',holderCad:'',profiles:{}}
 ],
 operations:[{id:1,name:'Planfräsen',kind:'facing',visible:true},{id:2,name:'Taschenfräsen',kind:'pocket',visible:false},{id:3,name:'Außenkontur',kind:'contour',visible:false},{id:4,name:'Bohren',kind:'drilling',visible:false}]
});
const libraryKey='fertigungsstudio-studio-library-v1';
let project=defaults(),current=1,dirty=false,simulation=false,toolEdit=null,matEdit=null,matProfile=1,selectedTool=1;
try{
 const lib=JSON.parse(localStorage.getItem(libraryKey)||'null');
 if(lib&&Array.isArray(lib.materials)&&Array.isArray(lib.tools)&&lib.materials.length&&lib.tools.length){project.materials=lib.materials;project.tools=lib.tools;project.stock.materialId=project.materials[0].id;}
}catch{}
function storeLibrary(){
 try{localStorage.setItem(libraryKey,JSON.stringify({materials:project.materials,tools:project.tools}));}
 catch{status('Browser-Bibliothek konnte nicht dauerhaft gespeichert werden. Projektdatei exportieren.');}
}
const pop=document.createElement('div');pop.className='studio-menu-popup';pop.id='studioMenuPopup';pop.hidden=true;document.body.appendChild(pop);
const dlg=document.createElement('dialog');dlg.className='studio-modal';dlg.id='studioDialog';dlg.innerHTML='<div class="studio-modal-head"><h2 id="studioDialogTitle"></h2><button id="studioDialogClose" type="button" aria-label="Schließen">✕</button></div><div id="studioDialogBody"></div>';document.body.appendChild(dlg);
const projectPicker=document.createElement('input');projectPicker.type='file';projectPicker.accept='.json,.fscam';projectPicker.hidden=true;document.body.appendChild(projectPicker);
const partPicker=document.createElement('input');partPicker.type='file';partPicker.accept='.step,.stp,.stl,.igs,.iges';partPicker.hidden=true;document.body.appendChild(partPicker);
const holderPicker=document.createElement('input');holderPicker.type='file';holderPicker.accept='.step,.stp,.stl,.igs,.iges';holderPicker.hidden=true;document.body.appendChild(holderPicker);
function status(message){$('studioInfo').textContent=message}
function changed(){dirty=true}
function selectedOp(){return project.operations.find(o=>o.id===current)||project.operations[0]}
function closeMenu(){pop.hidden=true;document.querySelectorAll('.studio-menu-tile').forEach(b=>b.setAttribute('aria-expanded','false'))}
function showDialog(title,body){
 closeMenu();$('studioDialogTitle').textContent=title;$('studioDialogBody').innerHTML=body;
 if(!dlg.open)dlg.showModal();
}
function closeDialog(){if(dlg.open)dlg.close()}
function button(label,action,extra=''){return '<button type="button" data-studio-action="'+action+'" class="'+extra+'">'+escapeHTML(label)+'</button>'}
function field(label,id,value,type='text',opts=''){return '<label>'+escapeHTML(label)+'<input id="'+id+'" type="'+type+'" value="'+escapeHTML(value)+'" '+opts+'></label>'}
function chooser(label,id,items,chosen){return '<label>'+escapeHTML(label)+'<select id="'+id+'">'+items.map(o=>'<option value="'+escapeHTML(o[0])+'" '+(String(o[0])===String(chosen)?'selected':'')+'>'+escapeHTML(o[1])+'</option>').join('')+'</select></label>'}
function val(id){return $(id)?.value??''}
function renderTree(){
 $('studioProject').innerHTML='▣ '+escapeHTML(project.name)+'<small>'+escapeHTML(project.part)+'</small>';
 $('studioOperations').innerHTML=project.operations.map((o,i)=>'<div class="studio-tree-row '+(o.id===current?'current':'')+'"><button class="studio-op" data-op-id="'+o.id+'"><small>'+String(i+1).padStart(2,'0')+'</small>'+escapeHTML(o.name)+'</button><button class="studio-eye" data-visible-id="'+o.id+'" aria-pressed="'+o.visible+'" title="'+(o.visible?'Bahn ausblenden':'Bahn einblenden')+'">'+(o.visible?'◉':'○')+'</button></div>').join('');
}
function updateTheme(){
 document.body.classList.toggle('light',project.theme==='light');
 document.querySelectorAll('[data-theme]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.theme===(project.theme||'dark'))));
}
function render(){
 renderTree();updateTheme();
 $('studioSim').hidden=!simulation;
 $('studioProgress').value=$('progress').value;
 $('studioHolder').disabled=$('studioToolMode').value!=='full';
}
for(const name of ['Datei','Setup','Werkzeugliste','Fräsen','3D Fräsen','Drehen','Laser','Sim','Post']){
 const wrap=document.createElement('div');wrap.className='studio-menu-wrap';
 const btn=document.createElement('button');btn.type='button';btn.className='studio-menu-tile';btn.dataset.studioMenu=name;btn.setAttribute('aria-expanded','false');
 btn.innerHTML='<svg viewBox="0 0 32 32" aria-hidden="true"><path d="'+iconPaths[name]+'"/></svg><span>'+name+(options[name]?' ▾':'')+'</span>';
 wrap.appendChild(btn);$('studioMenus').appendChild(wrap);
 btn.onclick=()=>{
  if(!options[name]){closeMenu();route(name);return;}
  const was=!pop.hidden&&btn.getAttribute('aria-expanded')==='true';
  closeMenu();if(was)return;
  btn.setAttribute('aria-expanded','true');
  pop.replaceChildren();const h=document.createElement('h3');h.textContent=name;pop.appendChild(h);
  for(const [caption,action] of options[name]){
   if(action==='divider'){pop.appendChild(document.createElement('hr'));continue;}
   const child=document.createElement('button');child.type='button';child.textContent=caption;
   child.onclick=()=>{closeMenu();route(action,caption)};
   pop.appendChild(child);
  }
  const rect=btn.getBoundingClientRect();
  pop.style.left=Math.max(4,Math.min(rect.left,window.innerWidth-235))+'px';
  pop.style.top=Math.min(rect.bottom+4,window.innerHeight-70)+'px';pop.hidden=false;
 };
}
function launch(kind){
 const index={facing:0,pocket:1,contour:2,drilling:3}[kind];
 if(index==null)return;
 const card=document.querySelector('[data-cam-operation="'+kind+'"]');
 if(card)card.click();
 else document.querySelector('[data-operation="'+index+'"]')?.click();
 // The local Rust preview retains its own validated calculation form.
 const dims=[project.stock.x,project.stock.y,project.stock.z];
 for(let i=0;i<3;i++){const f=$('live-v'+i);if(f)f.value=dims[i]}
 const tool=project.tools.find(t=>t.id===selectedTool);
 if(tool){
  if($('live-v4')&&num(tool.diameter)>0)$('live-v4').value=tool.diameter;
  if($('live-v8')&&num(tool.cutLength)>0)$('live-v8').value=tool.cutLength;
  const profile=tool.profiles?.[project.stock.materialId];
  if(profile&&$('live-v9')){
   const vc=num(profile.vc),fz=num(profile.fz),d=num(tool.diameter),teeth=num(tool.teeth);
   if(vc>0&&fz>0&&d>0&&teeth>0)$('live-v9').value=Math.round(1000*vc/(Math.PI*d)*fz*teeth);
  }
  if($('live-tool-preset'))$('live-tool-preset').value='custom';
 }
 status($('live-operation')?'Rust-Parameterdialog geöffnet. Werte vor Bearbeitung prüfen.':'Schematische Bahn gewählt. Für Rust-Berechnung den lokalen Server starten.');
}
function selectOp(id,open=false){
 const op=project.operations.find(x=>x.id===id);if(!op)return;
 current=id;op.visible=true;changed();render();
 if(open)launch(op.kind);
 else status(op.name+' ausgewählt. Berechnung über Menü oder Live-Bearbeitung.');
}
function addOp(kind,name){
 const found=project.operations.find(o=>o.kind===kind&&o.name===name);
 if(found){selectOp(found.id,true);return;}
 const op={id:uid(project.operations),kind,name,visible:true};
 project.operations.push(op);selectOp(op.id,true);
}
function showSetup(){
 showDialog('Setup / Aufspannung','<div class="studio-modal-grid">'+field('Bezeichnung','su-name',project.setup)+chooser('Werkstücknullpunkt','su-wcs',['G54','G55','G56','G57','G58','G59'].map(x=>[x,x]),project.wcs)+'</div><p>Aufspannung und Nullpunkt werden im Projekt gespeichert. Maschinentransformationen sind noch nicht implementiert.</p><div class="studio-modal-actions">'+button('Speichern','save-setup','primary')+'</div>');
}
function stockDialog(){
 showDialog('Rohteil und Material','<div class="studio-modal-grid">'+field('Länge X (mm)','st-x',project.stock.x,'number','min="0.001" step="any"')+field('Breite Y (mm)','st-y',project.stock.y,'number','min="0.001" step="any"')+field('Höhe Z (mm)','st-z',project.stock.z,'number','min="0.001" step="any"')+chooser('Werkstückmaterial','st-material',project.materials.map(m=>[m.id,m.name]),project.stock.materialId)+'</div><p>Die Rohteilwerte werden für das Projekt und den Rust-Parameterdialog übernommen; die illustrative 3D-Platte ist noch kein importiertes CAD-Teil.</p><div class="studio-modal-actions">'+button('Übernehmen','save-stock','primary')+button('Materialverwaltung','materials')+'</div>');
}
const svgNS='http://www.w3.org/2000/svg';
function svgEl(tag,attrs,parent){
 const el=document.createElementNS(svgNS,tag);
 Object.entries(attrs).forEach(([k,v])=>el.setAttribute(k,v));
 if(parent)parent.appendChild(el);return el;
}
function originDialog(){
 const o=project.origin,s=project.stock;
 showDialog('Nullpunkt wählen und Achsen ausrichten','<p>Ecken, Kantenmitten, Mittelpunkt oder beliebige Punkte am Rohteil auswählen. Senkrechte Kanten sind direkt für Z anklickbar.</p><div class="studio-origin-view"><svg id="studioOriginSvg" viewBox="0 0 680 360" role="group" aria-label="Rohteilrahmen mit wählbaren Nullpunkten"><g id="studioOriginBox"></g><g id="studioOriginSelect"></g><g id="studioOriginMarker"></g><g id="studioOriginAxes"></g></svg><div class="studio-origin-fields"><div class="studio-modal-grid">'+field('X (mm)','origin-x',o.x,'number','step="any"')+field('Y (mm)','origin-y',o.y,'number','step="any"')+field('Z (mm)','origin-z',o.z,'number','step="any"')+chooser('Ebene','origin-level',[['top','Oberseite'],['middle','Mitte'],['bottom','Unterseite'],['custom','Frei']],o.z===s.z?'top':o.z===0?'bottom':o.z===s.z/2?'middle':'custom')+'</div><p id="origin-position-info"></p></div></div><h3>Achsausrichtung</h3><div class="studio-modal-grid">'+chooser('X/Y-Drehung','origin-angle',[[0,'0°'],[90,'90°'],[180,'180°'],[270,'270°']],o.rotation)+chooser('Z-Richtung','origin-reverse',[['no','Z+ nach oben'],['yes','Z+ nach unten']],o.reverseZ?'yes':'no')+chooser('Nullpunktsystem','origin-wcs',['G54','G55','G56','G57','G58','G59'].map(x=>[x,x]),project.wcs)+'</div><p>Die abhängige Y-Richtung folgt automatisch der Rechtshandregel. Die Achsausrichtung wird gespeichert, aber noch nicht auf die Rust-Werkzeugwege transformiert.</p><div class="studio-modal-actions">'+button('Nullpunkt übernehmen','save-origin','primary')+'</div>');
 redrawOrigin();
}
function redrawOrigin(){
 if(!$('studioOriginSvg'))return;
 const svg=$('studioOriginSvg'),box=$('studioOriginBox'),sel=$('studioOriginSelect'),marker=$('studioOriginMarker'),axes=$('studioOriginAxes');
 for(const e of [box,sel,marker,axes])e.replaceChildren();
 const s=project.stock,o={x:num(val('origin-x')),y:num(val('origin-y')),z:num(val('origin-z'))};
 const scale=Math.min(2,240/s.x,165/s.y,110/s.z);
 const P=(x,y,z)=>({x:285+x*scale-y*.82*scale,y:225+x*.28*scale+y*.4*scale-z*scale});
 const poly=points=>points.map(p=>{const q=P(...p);return q.x+','+q.y}).join(' ');
 const z=Math.max(0,Math.min(s.z,o.z));
 const faces=[
  [[0,0,0],[s.x,0,0],[s.x,s.y,0],[0,s.y,0]],
  [[0,0,0],[s.x,0,0],[s.x,0,s.z],[0,0,s.z]],
  [[s.x,0,0],[s.x,s.y,0],[s.x,s.y,s.z],[s.x,0,s.z]],
  [[0,0,s.z],[s.x,0,s.z],[s.x,s.y,s.z],[0,s.y,s.z]]
 ];
 for(let i=0;i<faces.length;i++)svgEl('polygon',{points:poly(faces[i]),fill:['#3f6679','#355d72','#547d8f','#a7c4d1'][i],'fill-opacity':i===3?.22:.12,stroke:'#98b9c7','stroke-width':1.6},box);
 const a=[[0,0,z],[s.x,0,z],[s.x,s.y,z],[0,s.y,z]];
 const face=svgEl('polygon',{points:poly(a),fill:'#67e3b4','fill-opacity':.10,stroke:'#72e8bd','stroke-width':1.8,class:'studio-origin-face'},sel);
 function setXYZ(x,y,z){
  $('origin-x').value=Math.round(Math.max(0,Math.min(s.x,x))*1000)/1000;
  $('origin-y').value=Math.round(Math.max(0,Math.min(s.y,y))*1000)/1000;
  $('origin-z').value=Math.round(Math.max(0,Math.min(s.z,z))*1000)/1000;
  $('origin-level').value='custom';redrawOrigin();
 }
 function fromEvent(e){
  const point=svg.createSVGPoint();point.x=e.clientX;point.y=e.clientY;
  const t=svg.getScreenCTM();return t?point.matrixTransform(t.inverse()):null;
 }
 face.addEventListener('click',e=>{
  const q=fromEvent(e);if(!q)return;const dx=(q.x-285)/scale,dy=(q.y-225+z*scale)/scale;
  // projected: u = x - .82*y; v = .28*x + .4*y
  const y=(dy-.28*dx)/(.4+.28*.82),x=dx+.82*y;
  setXYZ(x,y,z);
 });
 for(const x of [0,s.x/2,s.x])for(const y of [0,s.y/2,s.y]){
  const q=P(x,y,z);
  const circle=svgEl('circle',{cx:q.x,cy:q.y,r:7,fill:'#a7f5d7',stroke:'#1c6a55','stroke-width':2,class:'studio-origin-point',tabindex:0,role:'button','aria-label':'Punkt '+mm(x)+' / '+mm(y)+' / '+mm(z)},sel);
  circle.addEventListener('click',e=>{e.stopPropagation();setXYZ(x,y,z)});
  circle.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setXYZ(x,y,z)}});
 }
 for(const x of [0,s.x])for(const y of [0,s.y]){
  const lo=P(x,y,0),hi=P(x,y,s.z);
  svgEl('line',{x1:lo.x,y1:lo.y,x2:hi.x,y2:hi.y,stroke:'#7af3c3','stroke-width':3},sel);
  const hit=svgEl('line',{x1:lo.x,y1:lo.y,x2:hi.x,y2:hi.y,class:'studio-origin-edge',tabindex:0,role:'button','aria-label':'Z-Kante '+mm(x)+' / '+mm(y)},sel);
  hit.addEventListener('click',e=>{e.stopPropagation();const q=fromEvent(e);if(q)setXYZ(x,y,(lo.y-q.y)/scale)});
  hit.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setXYZ(x,y,s.z/2)}});
 }
 const center=P(Math.max(0,Math.min(s.x,o.x)),Math.max(0,Math.min(s.y,o.y)),z);
 svgEl('circle',{cx:center.x,cy:center.y,r:13,fill:'none',stroke:'#81ffd4','stroke-width':2,'stroke-dasharray':'4 3'},marker);
 svgEl('circle',{cx:center.x,cy:center.y,r:5,fill:'#48d5a4',stroke:'white','stroke-width':2},marker);
 const angle=num(val('origin-angle'))*Math.PI/180,sign=val('origin-reverse')==='yes'?-1:1;
 const vec=[[Math.cos(angle),Math.sin(angle),0,'#f18b8b','X+'],[-Math.sin(angle)*sign,Math.cos(angle)*sign,0,'#70dd9a','Y+'],[0,0,sign,'#80b9ff','Z+']];
 for(const [dx,dy,dz,color,label] of vec){
  const end=P(o.x+dx*35/scale,o.y+dy*35/scale,z+dz*35/scale);
  svgEl('line',{x1:center.x,y1:center.y,x2:end.x,y2:end.y,stroke:color,'stroke-width':3,'stroke-linecap':'round'},axes);
  svgEl('text',{x:end.x+5,y:end.y-4,fill:color,'font-size':13,'font-weight':'bold'},axes).textContent=label;
 }
 $('origin-position-info').textContent='Position: X '+mm(o.x)+' / Y '+mm(o.y)+' / Z '+mm(o.z)+' mm';
}
function materialsDialog(){
 showDialog('Materialverwaltung','<p>Materialien gelten gemeinsam für Fräsen und Drehen. Schnittwerte werden getrennt für jedes Werkzeug hinterlegt.</p>'+project.materials.map(m=>'<div class="studio-row"><div><strong>'+escapeHTML(m.name)+'</strong><small>'+escapeHTML(m.group)+' · '+escapeHTML(m.grade)+'</small></div>'+button('Bearbeiten','edit-material-'+m.id)+'</div>').join('')+'<div class="studio-modal-actions">'+button('Material hinzufügen','add-material','primary')+'</div>');
}
function materialEditor(id){
 matEdit=id==null?{id:0,name:'',group:'',grade:'',hardness:''}:{...project.materials.find(m=>m.id===id)};
 showDialog(matEdit.id?'Material bearbeiten':'Material hinzufügen','<div class="studio-modal-grid">'+field('Materialbezeichnung','mat-name',matEdit.name)+field('Werkstoffgruppe','mat-group',matEdit.group)+field('Norm / Werkstoffnummer','mat-grade',matEdit.grade)+field('Härte, falls bekannt','mat-hardness',matEdit.hardness)+'</div><div class="studio-modal-actions">'+button('Material speichern','save-material','primary')+(matEdit.id?button('Material löschen','delete-material'):'')+button('Zur Übersicht','materials')+'</div>');
}
function toolsDialog(){
 showDialog('Werkzeugbibliothek','<p>Werkzeuggeometrie, frei definierbare Werkzeugaufnahme und Material-Schnittwerte. Werkzeug und zugeordneter Halter bleiben verknüpft.</p>'+project.tools.map(t=>'<div class="studio-row"><div><strong>'+escapeHTML(t.name)+'</strong><small>'+escapeHTML(t.type)+' · '+escapeHTML(t.holder||'Noch kein Halter')+'</small></div>'+button('Bearbeiten','edit-tool-'+t.id)+'</div>').join('')+'<div class="studio-modal-actions">'+button('Neues Werkzeug','add-tool','primary')+button('Bibliothek exportieren','export-library')+'</div>');
}
const millingTypes=['Schaftfräser','Kugelfräser','Torusfräser','Kegelfräser','Planfräser','Bohrer','Gewindefräser','Gewindebohrer','Fasenfräser'];
const turningTypes=['Außendrehmeißel','Innendrehmeißel','Stechmeißel','Gewindedrehmeißel','Bohrstange'];
function blankTool(){return{id:0,name:'Neues Werkzeug',category:'mill',type:'Schaftfräser',diameter:10,cutLength:25,totalLength:75,teeth:4,radius:0,insert:'',holder:'',holderCad:'',profiles:{}}}
function toolEditor(id){
 toolEdit=id==null?blankTool():structuredClone(project.tools.find(t=>t.id===id));
 matProfile=project.stock.materialId;renderToolForm();
}
function collectTool(){
 if(!toolEdit||!$('tool-name'))return;
 const t=toolEdit;
 for(const [key,id] of Object.entries({name:'tool-name',type:'tool-type',insert:'tool-insert',holder:'tool-holder'}))t[key]=val(id);
 for(const [key,id] of Object.entries({diameter:'tool-diameter',cutLength:'tool-cutlength',totalLength:'tool-length',teeth:'tool-teeth',radius:'tool-radius'}))t[key]=num(val(id));
 for(const [key,id] of Object.entries({coneAngle:'tool-coneangle',threadPitch:'tool-threadpitch',turnAngle:'tool-turnangle'}))if($(id))t[key]=num(val(id));
 if($('tool-threadhand'))t.threadHand=val('tool-threadhand');
 t.profiles=t.profiles||{};
 t.profiles[matProfile]={vc:val('tool-vc'),feed:val('tool-feed'),ap:val('tool-ap'),ae:val('tool-ae'),coolant:val('tool-coolant')};
}
function toolSketch(t){
 const label=t.category==='turn'?'Drehmeißel + Schneidplatte':'Fräswerkzeug + Schaft';
 const shape=t.category==='turn'?
 '<path d="M15 69H170V100H15Z" fill="#7995a5" stroke="#c4d9e2" stroke-width="2"/><path d="M170 69L208 42L239 59L202 100H170Z" fill="#647d8b" stroke="#bcd1db" stroke-width="2"/><path d="M193 47L227 63L200 90L166 72Z" fill="#d0c17a" stroke="#fff2a3" stroke-width="2"/><circle cx="198" cy="67" r="5" fill="#4f6270"/>':
 '<rect x="105" y="14" width="50" height="57" rx="4" fill="#91a9b8" stroke="#d1e4eb" stroke-width="2"/><rect id="studio-tool-cutrect" x="105" y="71" width="50" height="50" rx="3" fill="#2da784" stroke="#bde6d8" stroke-width="2"/><path d="M108 118L139 74M128 119L153 88" fill="none" stroke="#bde6d8" stroke-width="3"/>';
 return '<div class="studio-tool-illustration"><svg viewBox="0 0 260 150" role="img" aria-label="'+label+'">'+shape+'<text x="130" y="142" fill="#b3c7d2" font-size="11" text-anchor="middle">'+label+' · schematisch</text></svg></div>';
}
function updateToolSketch(){
 const r=$('studio-tool-cutrect');if(!r)return;
 const d=Math.max(1,num(val('tool-diameter'),10)),len=Math.max(1,num(val('tool-cutlength'),25));
 const width=Math.min(90,Math.max(14,d*5)),height=Math.min(58,Math.max(12,len*2));
 r.setAttribute('x',130-width/2);r.setAttribute('width',width);r.setAttribute('y',121-height);r.setAttribute('height',height);
}
function renderToolForm(){
 const t=toolEdit,turn=t.category==='turn',types=turn?turningTypes:millingTypes;
 if(!types.includes(t.type))t.type=types[0];
 const p=t.profiles?.[matProfile]||{};
 showDialog(t.id?'Werkzeug bearbeiten':'Werkzeug anlegen','<div class="studio-modal-grid">'+chooser('Werkzeugbereich','tool-category',[['mill','Fräsen'],['turn','Drehen']],t.category)+chooser('Grundform','tool-type',types.map(x=>[x,x]),t.type)+field('Werkzeugname','tool-name',t.name)+'</div>'+toolSketch(t)+'<h3>Geometrie</h3><div class="studio-modal-grid">'+field('Durchmesser, falls zutreffend (mm)','tool-diameter',t.diameter,'number','step="any"')+field('Schneidenlänge (mm)','tool-cutlength',t.cutLength,'number','step="any"')+field('Gesamtlänge (mm)','tool-length',t.totalLength,'number','step="any"')+field('Schneidenzahl','tool-teeth',t.teeth,'number','step="1"')+field('Eckenradius (mm)','tool-radius',t.radius,'number','step="any"')+field('Schneidplatte, falls zutreffend','tool-insert',t.insert)+'</div><div class="studio-modal-grid">'+(t.type.includes('Kegel')?field('Kegelwinkel (°)','tool-coneangle',t.coneAngle??30,'number','step="any"'):'')+(t.type.includes('Gewinde')?field('Gewindesteigung (mm)','tool-threadpitch',t.threadPitch??1.5,'number','step="any"')+chooser('Gewinderichtung','tool-threadhand',[['Rechts','Rechts'],['Links','Links']],t.threadHand||'Rechts'):'')+(turn?field('Einstellwinkel (°)','tool-turnangle',t.turnAngle??95,'number','step="any"'):'')+'</div><h3>Werkzeugaufnahme und Halter</h3><div class="studio-modal-grid">'+field('Aufnahme / Halter frei eingeben','tool-holder',t.holder)+'</div><p>Zuordnung der 3D-CAD-Datei: '+escapeHTML(t.holderCad||'Keine')+'. STEP/STL/IGES-Geometrie kann hier noch nicht dargestellt oder für Kollisionen verwendet werden.</p><div class="studio-modal-actions">'+button('Halterdatei auswählen','choose-holder')+button('Halterdatei lösen','clear-holder')+'</div><h3>Materialspezifische Schnittwerte</h3><div class="studio-modal-grid">'+chooser('Werkstückmaterial','tool-material',project.materials.map(m=>[m.id,m.name]),matProfile)+field('Schnittgeschwindigkeit Vc (m/min)','tool-vc',p.vc||'','number','step="any"')+field(turn?'Vorschub f (mm/U)':'Zahnvorschub fz (mm/Zahn)','tool-feed',p.feed||'','number','step="any"')+field('Schnitttiefe ap (mm)','tool-ap',p.ap||'','number','step="any"')+field('Seitliche Zustellung ae (mm)','tool-ae',p.ae||'','number','step="any"')+chooser('Kühlung','tool-coolant',[['','Nicht festgelegt'],['Trocken','Trocken'],['KSS','Kühlschmierstoff'],['MMS','Minimalmengenschmierung']],p.coolant||'')+'</div><p id="tool-computed"></p><p>Bei Drehwerkzeugen wird die Drehzahl mit dem aktuellen Rohteil-Durchmesser als Beispiel gerechnet. Für echte G96/G97-Steuerung und Maschinenlimits ist weitere Implementierung nötig.</p><div class="studio-modal-actions">'+button('Werkzeug speichern','save-tool','primary')+button('Zur Werkzeugliste','tools')+'</div>');
 updateToolMath();updateToolSketch();
}
function updateToolMath(){
 if(!$('tool-computed'))return;
 const vc=num(val('tool-vc')),feed=num(val('tool-feed')),diameter=toolEdit.category==='turn'?num(project.stock.x):num(val('tool-diameter')),z=toolEdit.category==='turn'?1:num(val('tool-teeth'));
 $('tool-computed').textContent=vc>0&&diameter>0&&feed>0&&z>0?'Rechnerisch: n ≈ '+mm(1000*vc/(Math.PI*diameter))+' 1/min · F ≈ '+mm(1000*vc/(Math.PI*diameter)*feed*z)+' mm/min. Vor Maschinenbetrieb prüfen.':'Drehzahl/Vorschub: Materialwerte eintragen. Keine automatisch erfundenen Schnittwerte.';
}
function saveTool(){
 collectTool();
 const t=toolEdit;
 if(!t.name.trim()||num(t.totalLength)<=0){status('Werkzeugname und Gesamtlänge müssen gültig sein.');return}
 if(!t.id)t.id=uid(project.tools);
 const index=project.tools.findIndex(x=>x.id===t.id);
 if(index<0)project.tools.push(t);else project.tools[index]=t;
 selectedTool=t.id;changed();storeLibrary();toolsDialog();status(t.name+' in der Werkzeugbibliothek gespeichert.');
}
function download(name,obj){
 const blob=new Blob([JSON.stringify(obj,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download=name.replace(/[\\/:*?"<>|]/g,'_');
 document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
}
function saveProject(){
 download(project.name+'.fscam.json',{format:'fertigungsstudio-project-v1',project});
 dirty=false;status('Projektdatei zum Download angeboten. Noch keine maschinenfertigen CAM-Daten.');
}
function closeStudio(){
 closeDialog();
 const end=document.createElement('div');end.className='studio-ended';
 end.innerHTML='<strong>Fertigungsstudio CAM – Entwurf geschlossen</strong><p>Die Anwendung wurde in der Vorschau beendet.</p><button type="button">Erneut öffnen</button>';
 end.querySelector('button').onclick=()=>window.location.reload();
 host.replaceChildren(end);
}
function exitDialog(){
 showDialog('Programm beenden','<p>'+(dirty?'Das Projekt enthält ungespeicherte Änderungen.':'Der Bedienentwurf wird geschlossen.')+'</p><div class="studio-modal-actions">'+button('Speichern und beenden','exit-save')+button('Ohne Speichern beenden','exit-discard')+button('Abbrechen','close')+'</div><p>Im Browser wird nur die Bedienoberfläche geschlossen, nicht der Browser selbst.</p>');
}
function route(action,name=''){
 if(['facing','pocket','contour','drilling'].includes(action)){addOp(action,name);return}
 if(action==='future'){status(name+': Strategiemodul noch nicht implementiert.');return}
 if(action==='setup'){showSetup();return}
 if(action==='stock'){stockDialog();return}
 if(action==='origin'){originDialog();return}
 if(action==='materials'){materialsDialog();return}
 if(action==='Werkzeugliste'||action==='tools'){toolsDialog();return}
 if(action==='Sim'){simulation=true;render();status('Simulation: Pfadfilter und Werkzeugdarstellung. Keine Kollisions- oder Materialabtragsprüfung.');return}
 if(action==='Post'){showDialog('Postprozessor','<p>NC-Ausgabe ist noch nicht freigegeben. Experimentelle Rust-Bahnen besitzen keine Kollisions- und Maschinenprüfung.</p>');return}
 if(action==='new'){showDialog('Neues Projekt','<p>Aktuelle, nicht exportierte Projektdaten können verloren gehen.</p><div class="studio-modal-actions">'+button('Neues Projekt erstellen','do-new')+button('Abbrechen','close')+'</div>');return}
 if(action==='open'){projectPicker.click();return}
 if(action==='part'){partPicker.click();return}
 if(action==='save'){saveProject();return}
 if(action==='saveas'){showDialog('Speichern unter…','<div class="studio-modal-grid">'+field('Projektname','save-name',project.name)+'</div><div class="studio-modal-actions">'+button('Projektdatei speichern','do-saveas')+'</div>');return}
 if(action==='exit'){exitDialog();return}
}
$('studioOperations').addEventListener('click',event=>{
 const s=event.target.closest('[data-op-id]'),v=event.target.closest('[data-visible-id]');
 if(s)selectOp(Number(s.dataset.opId),true);
 else if(v){const o=project.operations.find(x=>x.id===Number(v.dataset.visibleId));if(o){o.visible=!o.visible;changed();render();status(o.name+(o.visible?' eingeblendet.':' ausgeblendet.'))}}
});
document.querySelectorAll('[data-theme]').forEach(b=>b.onclick=()=>{project.theme=b.dataset.theme;changed();render()});
$('studioDialogClose').onclick=closeDialog;
dlg.addEventListener('click',e=>{if(e.target===dlg)closeDialog()});
dlg.addEventListener('change',e=>{
 if(['origin-level','origin-angle','origin-reverse','origin-x','origin-y','origin-z'].includes(e.target.id)){
  if(e.target.id==='origin-level'){
   const level=e.target.value;if(level==='top')$('origin-z').value=project.stock.z;
   if(level==='middle')$('origin-z').value=project.stock.z/2;
   if(level==='bottom')$('origin-z').value=0;
  }
  redrawOrigin();
 }
 if(e.target.id==='tool-category'){
  collectTool();toolEdit.category=e.target.value;
  toolEdit.type=toolEdit.category==='turn'?turningTypes[0]:millingTypes[0];
  renderToolForm();
 }
 if(e.target.id==='tool-type'){collectTool();toolEdit.type=e.target.value;renderToolForm()}
 if(e.target.id==='tool-material'){
  const id=Number(e.target.value);collectTool();matProfile=id;renderToolForm();
 }
});
dlg.addEventListener('input',e=>{
 if(['tool-vc','tool-feed','tool-diameter','tool-teeth'].includes(e.target.id))updateToolMath();
 if(['tool-diameter','tool-cutlength'].includes(e.target.id))updateToolSketch();
});
dlg.addEventListener('click',e=>{
 const btn=e.target.closest('[data-studio-action]');if(!btn)return;
 const act=btn.dataset.studioAction;
 if(act.startsWith('edit-material-')){materialEditor(Number(act.slice(14)));return}
 if(act.startsWith('edit-tool-')){toolEditor(Number(act.slice(10)));return}
 if(act==='close'){closeDialog();return}
 if(act==='materials'){materialsDialog();return}
 if(act==='add-material'){materialEditor(null);return}
 if(act==='save-material'){
  matEdit.name=val('mat-name').trim();matEdit.group=val('mat-group');matEdit.grade=val('mat-grade');matEdit.hardness=val('mat-hardness');
  if(!matEdit.name){status('Materialname fehlt.');return}
  if(!matEdit.id)matEdit.id=uid(project.materials);
  const i=project.materials.findIndex(x=>x.id===matEdit.id);if(i<0)project.materials.push(matEdit);else project.materials[i]=matEdit;
  changed();storeLibrary();materialsDialog();status('Material gespeichert: '+matEdit.name);return;
 }
 if(act==='delete-material'){
  const linked=project.stock.materialId===matEdit.id||project.tools.some(t=>Object.hasOwn(t.profiles||{},matEdit.id));
  if(linked){status('Material wird noch von Rohteil oder Werkzeugprofilen verwendet. Erst Zuordnungen ändern.');return}
  if(project.materials.length===1){status('Mindestens ein Material wird benötigt.');return}
  project.materials=project.materials.filter(m=>m.id!==matEdit.id);changed();storeLibrary();materialsDialog();return;
 }
 if(act==='tools'){toolsDialog();return}
 if(act==='add-tool'){toolEditor(null);return}
 if(act==='save-tool'){saveTool();return}
 if(act==='choose-holder'){holderPicker.click();return}
 if(act==='clear-holder'){collectTool();toolEdit.holderCad='';renderToolForm();return}
 if(act==='export-library'){download('fertigungsstudio-werkzeuge-materialien.json',{format:'fertigungsstudio-library-v1',materials:project.materials,tools:project.tools});return}
 if(act==='save-setup'){
  project.setup=val('su-name').trim()||project.setup;project.wcs=val('su-wcs');
  changed();closeDialog();status('Aufspannung und WCS im Projekt gespeichert.');return;
 }
 if(act==='save-stock'){
  const x=num(val('st-x')),y=num(val('st-y')),z=num(val('st-z'));
  if(!(x>0&&y>0&&z>0&&x<=100000&&y<=100000&&z<=100000)){status('Rohteilmaße müssen positiv und begrenzt sein.');return}
  project.stock={x,y,z,materialId:Number(val('st-material'))};
  project.origin.x=Math.min(project.origin.x,x);project.origin.y=Math.min(project.origin.y,y);project.origin.z=Math.min(project.origin.z,z);
  changed();closeDialog();status('Rohteil und Material gespeichert.');return;
 }
 if(act==='save-origin'){
  const o={x:num(val('origin-x'),NaN),y:num(val('origin-y'),NaN),z:num(val('origin-z'),NaN),rotation:num(val('origin-angle')),reverseZ:val('origin-reverse')==='yes'},s=project.stock;
  if(![o.x,o.y,o.z].every(Number.isFinite)||o.x<0||o.x>s.x||o.y<0||o.y>s.y||o.z<0||o.z>s.z){status('Nullpunkt muss innerhalb des Rohteils liegen.');return}
  project.origin=o;project.wcs=val('origin-wcs');changed();closeDialog();status('Nullpunkt und rechtshändige Achsausrichtung gespeichert (noch keine Werkzeugwegtransformation).');return;
 }
 if(act==='do-new'){
  const oldLib={materials:project.materials,tools:project.tools};
  project=defaults();project.materials=oldLib.materials;project.tools=oldLib.tools;project.stock.materialId=project.materials[0].id;
  current=1;dirty=false;closeDialog();render();status('Neues Projekt angelegt. Die gemeinsame Werkzeug- und Materialbibliothek bleibt erhalten.');return;
 }
 if(act==='do-saveas'){project.name=val('save-name').trim()||'Neues Projekt';closeDialog();render();saveProject();return}
 if(act==='exit-save'){saveProject();closeStudio();return}
 if(act==='exit-discard'){closeStudio();return}
});
holderPicker.addEventListener('change',e=>{
 const f=e.target.files?.[0];if(f&&toolEdit){collectTool();toolEdit.holderCad=f.name;renderToolForm();status('CAD-Dateiname vorgemerkt. Geometrieimport und Kollisionsmodell noch nicht umgesetzt.')}
 e.target.value='';
});
partPicker.addEventListener('change',e=>{
 const f=e.target.files?.[0];if(f){project.part=f.name+' (Geometrieimport ausstehend)';changed();render();status('Bauteildatei vorgemerkt; noch keine CAD-Geometrie importiert.')}
 e.target.value='';
});
projectPicker.addEventListener('change',async e=>{
 const f=e.target.files?.[0];if(!f)return;
 try{
  if(f.size>2_000_000)throw Error('Datei zu groß');
  const value=JSON.parse(await f.text());
  if(value.format!=='fertigungsstudio-project-v1'||!value.project||!Array.isArray(value.project.materials)||!Array.isArray(value.project.tools)||!Array.isArray(value.project.operations)||!value.project.materials.length||!value.project.tools.length||!value.project.operations.length||value.project.operations.length>200||value.project.tools.length>300||value.project.materials.length>300)throw Error('Ungültiges Projektformat');
  for(const o of value.project.operations)if(!o||!['facing','pocket','contour','drilling'].includes(o.kind)||typeof o.name!=='string')throw Error('Ungültige Bearbeitung');
  for(const m of value.project.materials)if(!m||!Number.isInteger(m.id)||typeof m.name!=='string')throw Error('Ungültiges Material');
  for(const t of value.project.tools)if(!t||!Number.isInteger(t.id)||typeof t.name!=='string')throw Error('Ungültiges Werkzeug');
  if(!value.project.stock||![value.project.stock.x,value.project.stock.y,value.project.stock.z].every(x=>Number.isFinite(x)&&x>0))throw Error('Ungültiges Rohteil');
  project=value.project;current=project.operations[0].id;dirty=false;storeLibrary();render();status('Projektdatei geöffnet. Werkzeugwege müssen separat berechnet werden.');
 }catch(err){status('Projekt nicht geöffnet: '+err.message)}
 e.target.value='';
});
$('studioToolMode').onchange=()=>{render();};
$('studioHolder').onchange=()=>{render();};
for(const [id,kind] of [['studioCut','cut'],['studioRapid','rapid'],['studioLead','lead']]){
 $(id).addEventListener('change',()=>{status('Bahnanzeige '+kind+' aktualisiert. Keine Werkzeugwege gelöscht.')});
}
$('studioPlay').onclick=()=>$('play').click();
$('studioProgress').oninput=e=>{$('progress').value=e.target.value;$('progress').dispatchEvent(new Event('input',{bubbles:true}))};
$('studioShowAll').onclick=()=>{project.operations.forEach(o=>o.visible=true);changed();render()};
$('studioHideAll').onclick=()=>{project.operations.forEach(o=>o.visible=false);changed();render()};
document.addEventListener('pointerdown',e=>{
 if(!pop.hidden&&!pop.contains(e.target)&&!e.target.closest('.studio-menu-tile'))closeMenu();
});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeMenu()});
$('studioMenus').onscroll=closeMenu;
globalThis.FertigungsstudioStudio={
 allowMove:(kind)=>!!$('studio'+({cut:'Cut',rapid:'Rapid',lead:'Lead'}[kind]||'Cut')).checked,
 activeVisible:()=>!!selectedOp()?.visible,
 toolVisibility:()=>simulation?$('studioToolMode').value:'full',
 showHolder:()=>!simulation||$('studioHolder').checked,
 selectedTool:()=>project.tools.find(t=>t.id===selectedTool)||null,
 project:()=>project,
 render,
};
project.theme='dark';
render();
})();
