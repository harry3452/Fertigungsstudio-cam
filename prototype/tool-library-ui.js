// Browser-local library for the live form; separate from machining projects.
const toolControls=document.createElement('div');toolControls.innerHTML='<label>Eigene Werkzeugbibliothek<select id="saved-tool"><option value="">Werkzeug auswählen …</option></select></label><label>Werkzeugname<input id="saved-name" maxlength="80" placeholder="z. B. Alu-Fräser Ø 6"></label><div class="dialog-actions"><button type="button" id="save-tool">Werkzeug speichern</button><button type="button" id="delete-tool">Werkzeug löschen</button></div><p id="tool-storage-status" role="status" aria-live="polite">Lokal in diesem Browser gespeichert · nicht im Projekt.</p>';
document.getElementById('live-fields').before(toolControls);
let savedTools=[],storageBlocked=false;
const savedSelect=document.getElementById('saved-tool'),storageStatus=document.getElementById('tool-storage-status');
function refreshSaved(selected=''){savedSelect.replaceChildren(new Option('Werkzeug auswählen …',''));for(const t of savedTools)savedSelect.add(new Option('T'+t.number+' · '+t.name,String(t.number)));savedSelect.value=selected;document.getElementById('delete-tool').disabled=!savedSelect.value;}
try{savedTools=CamToolStorage.load(localStorage);}catch(e){storageBlocked=true;storageStatus.textContent='Werkzeugliste nicht geladen: '+e.message+' Bestehende Daten bleiben unverändert.';}
refreshSaved();
savedSelect.onchange=()=>{const t=savedTools.find(t=>String(t.number)===savedSelect.value);document.getElementById('delete-tool').disabled=!t;if(!t)return;document.getElementById('saved-name').value=t.name;for(const [i,v]of Object.entries({4:t.diameter,7:t.number,8:t.cuttingLength,9:t.cuttingFeed,10:t.plungeFeed}))document.getElementById('live-v'+i).value=v;document.getElementById('live-tool-preset').value='custom';storageStatus.textContent='Werkzeug geladen. Seitliche Zustellung bei anderem Durchmesser prüfen.';};
document.getElementById('save-tool').onclick=()=>{try{
if(storageBlocked)throw Error('Gespeicherte Liste ist nicht lesbar. Sie wird nicht überschrieben.');
const value=i=>document.getElementById('live-v'+i).valueAsNumber;
const t=CamToolStorage.validate({number:value(7),name:document.getElementById('saved-name').value,diameter:value(4),cuttingLength:value(8),cuttingFeed:value(9),plungeFeed:value(10)});
const existing=savedTools.find(x=>x.number===t.number);if(existing&&!confirm('Werkzeug T'+t.number+' „'+existing.name+'“ aktualisieren?'))return;
const next=savedTools.filter(x=>x.number!==t.number);next.push(t);savedTools=CamToolStorage.save(localStorage,next);refreshSaved(String(t.number));storageStatus.textContent='Werkzeug T'+t.number+' gespeichert. Nach erneutem Öffnen hier verfügbar.';
}catch(e){storageStatus.textContent='Nicht gespeichert: '+e.message;}};
document.getElementById('delete-tool').onclick=()=>{const t=savedTools.find(t=>String(t.number)===savedSelect.value);if(!t||!confirm('Werkzeug T'+t.number+' aus der lokalen Bibliothek löschen?'))return;try{savedTools=CamToolStorage.save(localStorage,savedTools.filter(x=>x.number!==t.number));refreshSaved();storageStatus.textContent='Werkzeug gelöscht. Aktuelle Eingabewerte bleiben erhalten.';}catch(e){storageStatus.textContent='Nicht gelöscht: '+e.message;}};
