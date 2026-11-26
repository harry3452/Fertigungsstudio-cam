// Local Rust-only CAM preview. No CNC communication or postprocessing.
(()=>{
'use strict';

const panel=document.createElement('dialog');
panel.className='settings-dialog';
panel.id='live-facing';
panel.innerHTML=`
<div class="dialog-head">
  <h2 id="live-heading">Rust-Bearbeitung berechnen</h2>
  <button type="button" id="live-close" aria-label="Schließen">✕</button>
</div>
<form id="live-form">
  <div class="dialog-body">
    <label>Bearbeitungsart
      <select id="live-operation">
        <option value="facing">Planfräsen</option>
        <option value="contour">Außenkontur · Rechteck</option>
        <option value="pocket">Tasche · Rechteck</option>
        <option value="drilling">Bohren · vier Positionen</option>
      </select>
    </label>
    <label>Werkzeugvorlage
      <select id="live-tool-preset">
        <option value="custom">Eigene Werte</option>
        <option value="10">T1 · Schaftfräser Ø 10 · Beispiel</option>
        <option value="6">T2 · Schaftfräser Ø 6 · Beispiel</option>
      </select>
    </label>
    <div class="twocol" id="live-fields"></div>
    <div class="twocol" id="live-margins">
      <label>Abstand X vom Rand · mm
        <input type="number" id="live-margin-x" value="15" min="0" step="any">
      </label>
      <label>Abstand Y vom Rand · mm
        <input type="number" id="live-margin-y" value="15" min="0" step="any">
      </label>
    </div>
    <p id="live-operation-note"></p>
    <p>Experimentelle Werkzeugbahnen ohne Kollisions-, Materialabtrags-
       oder Maschinenprüfung. Kein NC-Code. Beispielvorschübe sind keine
       Bearbeitungsempfehlung.</p>
    <p id="live-state" role="status" aria-live="polite"></p>
  </div>
  <div class="dialog-actions">
    <button type="button" id="live-cancel">Abbrechen</button>
    <button class="primary" type="submit" id="live-run">Berechnen</button>
  </div>
</form>`;
document.body.appendChild(panel);

// Preserve stable field IDs: the existing browser-local milling tool library
// uses fields 4, 7, 8, 9 and 10.
const specs=[
  ['Breite',120],['Länge',80],['Höhe',12],['Abtragstiefe',2],
  ['Werkzeugdurchmesser',10],['Tiefenzustellung',1],
  ['Seitliche Zustellung',4],['Werkzeugnummer',1],
  ['Schneidenlänge',20],['Schnittvorschub',800],['Eintauchvorschub',200],
];
const fields=document.getElementById('live-fields');
const fieldNodes=[];
for(let i=0;i<specs.length;i++){
  const label=document.createElement('label');
  label.textContent=specs[i][0]+(i===7?'':i>=9?' · mm/min':' · mm');
  const input=document.createElement('input');
  input.type='number';
  input.step=i===7?'1':'any';
  input.min=i===7?'1':'0.000001';
  if(i===7)input.max='9999';
  input.required=true;
  input.value=specs[i][1];
  input.id='live-v'+i;
  input.addEventListener('input',()=>document.getElementById('live-tool-preset').value='custom');
  label.appendChild(input);
  fields.appendChild(label);
  fieldNodes.push(label);
}
const operationSelect=document.getElementById('live-operation');
const margins=document.getElementById('live-margins');
const note=document.getElementById('live-operation-note');
const state=document.getElementById('live-state');
const run=document.getElementById('live-run');
const titles={
  facing:'Planfräsen',contour:'Außenkontur',pocket:'Rechtecktasche',drilling:'Bohren',
};
const descriptions={
  facing:'Gesamte Oberseite des rechteckigen Rohblocks planfräsen. Nur mittenschneidender Flachfräser.',
  contour:'Rohblock entlang seiner Außenkante mit Werkzeugradiusabstand umfahren. Außerhalb des Rohblocks ist freier Raum vorausgesetzt.',
  pocket:'Mittige rechteckige Tasche: Randabstände in X und Y eingeben. Innenecken bleiben entsprechend dem Fräserradius rund.',
  drilling:'Vier Bohrpunkte: links/rechts und vorne/hinten im angegebenen Randabstand. Tiefenzustellung = Bohrschritt (0 = ohne Zwischenrückzug).',
};
function refresh(){
  const kind=operationSelect.value;
  document.getElementById('live-heading').textContent=titles[kind]+' · Rust-Berechnung';
  note.textContent=descriptions[kind];
  margins.hidden=kind!=='pocket'&&kind!=='drilling';
  // The existing saved library only knows flat mills. Drills are entered
  // independently and must not be silently represented as end mills.
  const saved=document.getElementById('saved-tool');
  const savedPanel=saved?.parentElement?.parentElement;
  if(savedPanel)savedPanel.hidden=kind==='drilling';
  fieldNodes[6].hidden=kind==='contour'||kind==='drilling';
  fieldNodes[10].hidden=kind==='drilling';
  fieldNodes[5].firstChild.textContent=(kind==='drilling'?'Bohrschritt (0 = ohne)':'Tiefenzustellung')+' · mm';
  document.getElementById('live-v5').min=kind==='drilling'?'0':'0.000001';
  fieldNodes[9].firstChild.textContent=(kind==='drilling'?'Bohrvorschub':'Schnittvorschub')+' · mm/min';
  const preset=document.getElementById('live-tool-preset');
  preset.parentElement.hidden=kind==='drilling';
  state.textContent='';
}
operationSelect.addEventListener('change',refresh);
document.getElementById('live-tool-preset').onchange=e=>{
  const values=e.target.value==='10'
    ?{4:10,6:4,7:1,8:20,9:800,10:200}
    :e.target.value==='6'
      ?{4:6,6:2,7:2,8:15,9:600,10:150}
      :null;
  if(values){
    for(const [i,v] of Object.entries(values)){
      document.getElementById('live-v'+i).value=v;
    }
  }
};
const errors={
  InvalidNumbers:'Bitte gültige Zahlen eingeben.',
  InvalidNumberCount:'Anzahl der Eingabewerte ist ungültig.',
  InvalidStock:'Ungültige Rohteilmaße.',
  InvalidGeometry:'Ungültige Werkzeuggeometrie.',
  InvalidToolNumber:'Werkzeugnummer muss ganzzahlig zwischen 1 und 9999 liegen.',
  InvalidTool:'Ungültiges Werkzeug.',
  InvalidClearance:'Ungültige Sicherheitshöhe.',
  InvalidDepth:'Tiefe außerhalb des Rohteils oder länger als die gewählte Schneide.',
  InvalidStep:'Ungültige Zustellung. Seitliche Zustellung höchstens halber Werkzeugdurchmesser.',
  InvalidFeed:'Ungültiger Vorschub.',
  InvalidBounds:'Tasche zu klein oder außerhalb des Rohblocks.',
  InvalidPoint:'Bohrpunkt liegt außerhalb des Rohblocks oder zu nah am Rand.',
  InvalidPeck:'Ungültiger Bohrschritt.',
  NoDrillPoints:'Keine Bohrpositionen.',
  TooManyMoves:'Zu viele Bewegungen. Bitte größere Zustellungen wählen.',
  CoordinateLimit:'Koordinatengrenze überschritten.',
  Cancelled:'Berechnung abgebrochen.',
};
let revision=0;
let controller=null;
async function cancel(){
  revision++;
  if(controller)controller.abort();
  controller=null;
  run.disabled=false;
  state.textContent='Berechnung abgebrochen.';
  try{
    await fetch('/api/cancel',{
      method:'POST',
      headers:{'Content-Type':'application/x-fertigungsstudio'},
      body:'',
    });
  }catch{}
}
document.getElementById('live-cancel').onclick=cancel;
document.getElementById('live-close').onclick=()=>{void cancel();panel.close();};
panel.addEventListener('cancel',()=>{void cancel();});

function openForKind(kind){
  if(!Object.hasOwn(titles,kind))return;
  operationSelect.value=kind;
  refresh();
  if(!panel.open)panel.showModal();
}
function openForCurrent(){
  const selectedType=['facing','pocket','contour','drilling'][selected]||'facing';
  openForKind(selectedType);
}
globalThis.FertigungsstudioCamWorkbench?.connect(openForKind);
$('calculateTile').onclick=openForCurrent;
$('toolButton').onclick=openForCurrent;
const liveButton=document.createElement('button');
liveButton.textContent='Live-Bearbeitung';
liveButton.onclick=openForCurrent;
document.querySelector('.viewbuttons').prepend(liveButton);

document.getElementById('live-form').onsubmit=async event=>{
  event.preventDefault();
  const kind=operationSelect.value;
  const mine=++revision;
  if(controller)controller.abort();
  controller=new AbortController();
  run.disabled=true;
  state.textContent='Rust berechnet '+titles[kind]+' …';
  try{
    const values=specs.map((_,i)=>document.getElementById('live-v'+i).valueAsNumber);
    if(values.some((v,i)=>!Number.isFinite(v)||
      ((kind==='drilling'&&i===5)?v<0:v<=0))){
      throw Error('Bitte gültige positive Zahlen eingeben (Bohrschritt darf 0 sein).');
    }
    if(kind==='pocket'||kind==='drilling'){
      const mx=document.getElementById('live-margin-x').valueAsNumber;
      const my=document.getElementById('live-margin-y').valueAsNumber;
      if(!Number.isFinite(mx)||!Number.isFinite(my)||mx<0||my<0){
        throw Error('Randabstände müssen gültige nichtnegative Werte sein.');
      }
      values.push(mx,my);
    }
    const url=kind==='facing'?'/api/facing':'/api/'+kind;
    const response=await fetch(url,{
      method:'POST',
      headers:{'Content-Type':'application/x-fertigungsstudio'},
      body:values.join(' '),
      signal:controller.signal,
    });
    if(!response.ok){
      const code=await response.text();
      throw Error(errors[code]||'Berechnung fehlgeschlagen: '+code);
    }
    const data=await response.json();
    if(mine!==revision)return;
    loadCore(data);
    globalThis.FertigungsstudioCamWorkbench?.highlight(kind);
    state.textContent='Fertig: '+data.moves.length+' berechnete Bewegungen.';
    panel.close();
    toast(titles[kind]+': '+data.moves.length+' Bewegungen – nicht maschinell geprüft.');
  }catch(error){
    if(mine===revision){
      state.textContent=error.name==='AbortError'?'Abgebrochen.':error.message;
    }
  }finally{
    if(mine===revision){controller=null;run.disabled=false;}
  }
};
refresh();
})();
