// Served only by the local Rust demo. No remote service or machine connection.
(()=>{
const panel=document.createElement('dialog');panel.className='settings-dialog';panel.id='live-facing';
panel.innerHTML='<div class="dialog-head"><h2>Planfräsen · Werkzeug und Schnittwerte</h2><button id="live-close" aria-label="Schließen">✕</button></div><form id="live-form"><div class="dialog-body"><label>Werkzeugvorlage<select id="live-tool-preset"><option value="custom">Eigene Werte</option><option value="10">T1 · Schaftfräser Ø 10 · Beispiel</option><option value="6">T2 · Schaftfräser Ø 6 · Beispiel</option></select></label><div class="twocol" id="live-fields"></div><p>Rechteckiger Rohblock · aktuell nur flache, zentrumschneidende Fräser. Vorlagen sind Beispielwerte, keine Materialempfehlung. Keine Spannmittel- oder Kollisionsprüfung.</p><p id="live-state" role="status" aria-live="polite"></p></div><div class="dialog-actions"><button type="button" id="live-cancel">Abbrechen</button><button class="primary" type="submit" id="live-run">Berechnen</button></div></form>';
document.body.appendChild(panel);
const specs=[['Breite',120],['Länge',80],['Höhe',12],['Abtragstiefe',2],['Fräserdurchmesser',10],['Tiefenzustellung',1],['Seitliche Zustellung',4],['Werkzeugnummer',1],['Schneidenlänge',20],['Schnittvorschub',800],['Eintauchvorschub',200]];
specs.forEach(([name,value],i)=>{const label=document.createElement('label');label.textContent=name+(i===7?'':i>8?' · mm/min':' · mm');const input=document.createElement('input');input.type='number';input.step=i===7?'1':'any';input.min=i===7?'1':'0.000001';if(i===7)input.max='9999';input.required=true;input.value=value;input.id='live-v'+i;input.oninput=()=>document.getElementById('live-tool-preset').value='custom';label.appendChild(input);document.getElementById('live-fields').appendChild(label);});
document.getElementById('live-tool-preset').onchange=e=>{const values=e.target.value==='10'?{4:10,6:4,7:1,8:20,9:800,10:200}:e.target.value==='6'?{4:6,6:2,7:2,8:15,9:600,10:150}:null;if(values)Object.entries(values).forEach(([i,v])=>document.getElementById('live-v'+i).value=v);};
let revision=0,controller=null;
const state=document.getElementById('live-state'),run=document.getElementById('live-run');
const errors={InvalidStock:'Ungültige Rohteilmaße.',InvalidGeometry:'Ungültige Werkzeuggeometrie.',InvalidToolNumber:'Werkzeugnummer muss ganzzahlig zwischen 1 und 9999 liegen.',InvalidTool:'Ungültiger Fräser.',InvalidClearance:'Ungültige Sicherheitshöhe.',InvalidDepth:'Tiefe außerhalb des Rohteils oder länger als die gewählte Schneide.',InvalidStep:'Zustellung ungültig. Seitliche Zustellung höchstens halber Fräserdurchmesser.',InvalidFeed:'Ungültiger Vorschub.',TooManyMoves:'Zu viele Bewegungen. Bitte größere Zustellungen wählen.',CoordinateLimit:'Koordinatengrenze überschritten.',Cancelled:'Berechnung abgebrochen.'};
async function cancel(){revision++;if(controller)controller.abort();controller=null;run.disabled=false;state.textContent='Berechnung abgebrochen.';try{await fetch('/api/cancel',{method:'POST',headers:{'Content-Type':'application/x-fertigungsstudio'},body:''});}catch{}}
document.getElementById('live-cancel').onclick=cancel;
document.getElementById('live-close').onclick=()=>{cancel();panel.close();};
panel.addEventListener('cancel',()=>{cancel();});
$('calculateTile').onclick=()=>panel.showModal();
$('toolButton').onclick=()=>panel.showModal();
const liveButton=document.createElement('button');liveButton.textContent='Live-Planfräsen';liveButton.onclick=()=>panel.showModal();document.querySelector('.viewbuttons').prepend(liveButton);
document.getElementById('live-form').onsubmit=async e=>{e.preventDefault();const mine=++revision;if(controller)controller.abort();controller=new AbortController();run.disabled=true;state.textContent='Rust berechnet …';try{
const values=specs.map((_,i)=>document.getElementById('live-v'+i).valueAsNumber);if(values.some(v=>!Number.isFinite(v)||v<=0))throw Error('Bitte positive Zahlen eingeben.');
const response=await fetch('/api/facing',{method:'POST',headers:{'Content-Type':'application/x-fertigungsstudio'},body:values.join(' '),signal:controller.signal});
if(!response.ok){const code=await response.text();throw Error(errors[code]||'Berechnung fehlgeschlagen: '+code);}
const data=await response.json();if(mine!==revision)return;loadCore(data);state.textContent='Fertig: '+data.moves.length+' berechnete Bewegungen.';panel.close();toast('Rust-Bahn berechnet: '+data.moves.length+' Bewegungen.');
}catch(err){if(mine===revision)state.textContent=err.name==='AbortError'?'Abgebrochen.':err.message;}finally{if(mine===revision){controller=null;run.disabled=false;}}};
})();
