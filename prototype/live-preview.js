// Served only by the local Rust demo. No remote service or machine connection.
(()=>{
const panel=document.createElement('dialog');panel.className='settings-dialog';panel.id='live-facing';
panel.innerHTML='<div class="dialog-head"><h2>Planfräsen · Rust-Berechnung</h2><button id="live-close" aria-label="Schließen">✕</button></div><form id="live-form"><div class="dialog-body"><div class="twocol" id="live-fields"></div><p>Rechteckiger Rohblock · mm · Werkzeugschneidenlänge 20 mm. Keine Spannmittel- oder Kollisionsprüfung.</p><p id="live-state" role="status" aria-live="polite"></p></div><div class="dialog-actions"><button type="button" id="live-cancel">Abbrechen</button><button class="primary" type="submit" id="live-run">Berechnen</button></div></form>';
document.body.appendChild(panel);
const specs=[['Breite',120],['Länge',80],['Höhe',12],['Abtragstiefe',2],['Fräserdurchmesser',10],['Tiefenzustellung',1],['Seitliche Zustellung',4]];
specs.forEach(([name,value],i)=>{const label=document.createElement('label');label.textContent=name+' · mm';const input=document.createElement('input');input.type='number';input.step='any';input.min='0.000001';input.required=true;input.value=value;input.id='live-v'+i;label.appendChild(input);document.getElementById('live-fields').appendChild(label);});
let revision=0,controller=null;
const state=document.getElementById('live-state'),run=document.getElementById('live-run');
const errors={InvalidStock:'Ungültige Rohteilmaße.',InvalidTool:'Ungültiger Fräser.',InvalidClearance:'Ungültige Sicherheitshöhe.',InvalidDepth:'Tiefe außerhalb des Rohteils oder länger als die Schneide (20 mm).',InvalidStep:'Zustellung ungültig. Seitliche Zustellung höchstens halber Fräserdurchmesser.',InvalidFeed:'Ungültiger Vorschub.',TooManyMoves:'Zu viele Bewegungen. Bitte größere Zustellungen wählen.',CoordinateLimit:'Koordinatengrenze überschritten.',Cancelled:'Berechnung abgebrochen.'};
async function cancel(){revision++;if(controller)controller.abort();controller=null;run.disabled=false;state.textContent='Berechnung abgebrochen.';try{await fetch('/api/cancel',{method:'POST',headers:{'Content-Type':'application/x-fertigungsstudio'},body:''});}catch{}}
document.getElementById('live-cancel').onclick=cancel;
document.getElementById('live-close').onclick=()=>{cancel();panel.close();};
panel.addEventListener('cancel',()=>{cancel();});
$('calculateTile').onclick=()=>panel.showModal();
const liveButton=document.createElement('button');liveButton.textContent='Live-Planfräsen';liveButton.onclick=()=>panel.showModal();document.querySelector('.viewbuttons').prepend(liveButton);
document.getElementById('live-form').onsubmit=async e=>{e.preventDefault();const mine=++revision;if(controller)controller.abort();controller=new AbortController();run.disabled=true;state.textContent='Rust berechnet …';try{
const values=specs.map((_,i)=>document.getElementById('live-v'+i).valueAsNumber);if(values.some(v=>!Number.isFinite(v)||v<=0))throw Error('Bitte positive Zahlen eingeben.');
const response=await fetch('/api/facing',{method:'POST',headers:{'Content-Type':'application/x-fertigungsstudio'},body:values.join(' '),signal:controller.signal});
if(!response.ok){const code=await response.text();throw Error(errors[code]||'Berechnung fehlgeschlagen: '+code);}
const data=await response.json();if(mine!==revision)return;loadCore(data);state.textContent='Fertig: '+data.moves.length+' berechnete Bewegungen.';panel.close();toast('Rust-Bahn berechnet: '+data.moves.length+' Bewegungen.');
}catch(err){if(mine===revision)state.textContent=err.name==='AbortError'?'Abgebrochen.':err.message;}finally{if(mine===revision){controller=null;run.disabled=false;}}};
})();
