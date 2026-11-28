/* Fertigungsstudio CAM – eigenständiges, versioniertes Projektdateiformat.
 * Speichert Einstellungen und optional den Original-Modell-Dateiinhalt.
 * Keine Werkzeugbahnen und kein ausführbarer Maschinencode.
 * Apache-2.0 (wie das Hauptprojekt).
 */
(function(root){
'use strict';
const VERSION='fertigungsstudio-project-v5';
const MAX_MODEL_BYTES=24000000;
const MAX_FILE_BYTES=50000000;
const MAX_OPS=200,MAX_TOOLS=300,MAX_MATERIALS=300;
const finite=v=>typeof v==='number'&&Number.isFinite(v);
const obj=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
const fail=s=>{throw Error(s);};
const table=new Uint32Array(256);
for(let n=0;n<256;n++){let x=n;for(let i=0;i<8;i++)x=(x&1)?0xedb88320^(x>>>1):(x>>>1);table[n]=x>>>0;}
function checksum(bytes){let c=0xffffffff;for(const b of bytes)c=table[(c^b)&255]^(c>>>8);return ((c^0xffffffff)>>>0).toString(16).padStart(8,'0');}
function asBytes(bytes){if(bytes instanceof Uint8Array)return bytes;if(bytes instanceof ArrayBuffer)return new Uint8Array(bytes);fail('Modell-Datei ist kein Bytepuffer.');}
function encode(bytes){bytes=asBytes(bytes);if(!bytes.length||bytes.length>MAX_MODEL_BYTES)fail('Modell-Datei muss zwischen 1 Byte und 24 MB groß sein.');let chunks=[];const step=24576;for(let pos=0;pos<bytes.length;pos+=step){const end=Math.min(pos+step,bytes.length);let part='';for(let i=pos;i<end;i++)part+=String.fromCharCode(bytes[i]);chunks.push(btoa(part));}return chunks.join('');}
function decode(base64,expectedLength){if(typeof base64!=='string'||!Number.isInteger(expectedLength)||expectedLength<1||expectedLength>MAX_MODEL_BYTES||base64.length>Math.ceil(MAX_MODEL_BYTES/3)*4||base64.length%4!==0||!/^[A-Za-z0-9+/]*={0,2}$/.test(base64))fail('Ungültige eingebettete Modelldaten.');let binary;try{binary=atob(base64);}catch{fail('Modelldaten können nicht dekodiert werden.');}if(binary.length!==expectedLength)fail('STL-Größe stimmt nicht mit der Projektdatei überein.');const bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);return bytes;}
function safeProject(p){
 if(!obj(p)||typeof p.name!=='string'||!p.name.trim()||p.name.length>240)fail('Ungültiger Projektname.');
 if(!obj(p.stock)||![p.stock.x,p.stock.y,p.stock.z].every(x=>finite(x)&&x>0&&x<=100000))fail('Ungültige Rohteilabmessungen.');
 if(!obj(p.origin)||![p.origin.x,p.origin.y,p.origin.z].every(finite)||
   p.origin.x<0||p.origin.x>p.stock.x||p.origin.y<0||p.origin.y>p.stock.y||p.origin.z<0||p.origin.z>p.stock.z||
   ![0,90,180,270].includes(p.origin.rotation)||typeof p.origin.reverseZ!=='boolean')fail('Ungültiger Werkstücknullpunkt.');
 if(!['G54','G55','G56','G57','G58','G59'].includes(p.wcs))fail('Unbekanntes Werkstückkoordinatensystem.');
 for(const [key,limit] of [['materials',MAX_MATERIALS],['tools',MAX_TOOLS],['operations',MAX_OPS]])if(!Array.isArray(p[key])||!p[key].length||p[key].length>limit)fail('Ungültige Anzahl bei '+key+'.');
 function ids(items,required){const seen=new Set();for(const item of items){if(!obj(item)||!Number.isSafeInteger(item.id)||item.id<1||seen.has(item.id)||typeof item.name!=='string'||!item.name.trim()||item.name.length>250)fail('Ungültiger oder doppelter '+required+'-Eintrag.');seen.add(item.id);}return seen;}
 const materials=ids(p.materials,'Material'),tools=ids(p.tools,'Werkzeug'),operations=ids(p.operations,'Bearbeitung');
 if(!materials.has(p.stock.materialId))fail('Rohteilmaterial nicht in Materialliste.');
 for(const op of p.operations){if(!['facing','contour','pocket','drilling'].includes(op.kind)||typeof op.visible!=='boolean')fail('Unbekannte Bearbeitungsart.');}
 // Bohrungen dürfen nur strukturierte Geometriereferenzen enthalten.
 for(const op of p.operations){
  if(op.drilling===undefined)continue;
  const d=op.drilling;
  if(op.kind!=='drilling'||!obj(d)||d.version!==1||!Array.isArray(d.holes)||d.holes.length>200)
   fail('Ungültige Bohrbearbeitungsdaten.');
  for(const h of d.holes){
   if(!obj(h)||!obj(h.ref)||typeof h.ref.id!=='string'||h.ref.id.length>250||
     !['inside','outside'].includes(h.ref.side)||!Array.isArray(h.ref.points)||
     h.ref.points.length<8||h.ref.points.length>2048||
     !h.ref.points.every(v=>Array.isArray(v)&&v.length===2&&v.every(finite))||
     (h.ref.cadWireId!=null&&!/^F[1-9]\d{0,4}-W[1-9]\d{0,4}$/.test(h.ref.cadWireId)))
     fail('Ungültige gespeicherte Bohrungskontur.');
  }
  if(d.floor!=null&&(!obj(d.floor)||!finite(d.floor.z)||!Array.isArray(d.floor.point)||
    d.floor.point.length!==3||!d.floor.point.every(finite)||
    Math.abs(d.floor.z-d.floor.point[2])>0.0001||
    (d.floor.cadFaceId!=null&&!/^F[1-9]\d{0,4}$/.test(d.floor.cadFaceId))))
    fail('Ungültige gespeicherte Bohrungsbodenfläche.');
 }
 if(p.partPlacement!==undefined){if(!obj(p.partPlacement)||!['x','y','z'].every(k=>finite(p.partPlacement[k])&&p.partPlacement[k]>=0))fail('Ungültige STL-Position.');}
 if(p.stlInfo!==undefined){if(!obj(p.stlInfo))fail('Ungültige Modellmetadaten.');if(p.stlInfo.format!==undefined&&!['stl','dxf','step'].includes(p.stlInfo.format))fail('Ungültiges Modellformat.');if(!obj(p.stlInfo)||typeof p.stlInfo.name!=='string'||p.stlInfo.name.length>250||!Array.isArray(p.stlInfo.size)||p.stlInfo.size.length!==3||!p.stlInfo.size.every(x=>finite(x)&&x>=0)||!p.stlInfo.size.some(x=>x>0))fail('Ungültige Modell-Metadaten.');}
 // Shared picks are only references to the exact embedded STL + current setup.
 // Validate their shape and bounds, not just their presence in the JSON.
 if(p.sharedGeometry!==undefined){
  const g=p.sharedGeometry;
  if(!p.stlInfo||!p.partPlacement||!obj(g)||g.version!==1||typeof g.signature!=='string'||
     g.signature.length<10||g.signature.length>220||!Array.isArray(g.edges)||!Array.isArray(g.faces)||
     g.edges.length>48||g.faces.length>48)fail('Ungültige gemeinsame Geometrieablage.');
  const validPoint=(v,n)=>Array.isArray(v)&&v.length===n&&v.every(finite);
  const ids=new Set();
  for(const e of g.edges){
   if(!obj(e)||!/^K[1-9][0-9]{0,4}$/.test(e.id)||ids.has(e.id)||!obj(e.ref)||
      (e.ref.cadWireId!=null&&!/^F[1-9]\d{0,4}-W[1-9]\d{0,4}$/.test(e.ref.cadWireId))||
      typeof e.ref.id!=='string'||e.ref.id.length>250||!['inside','outside'].includes(e.ref.side)||
      !Array.isArray(e.ref.points)||e.ref.points.length<3||e.ref.points.length>2048||
      !e.ref.points.every(v=>validPoint(v,2)))fail('Ungültige gespeicherte Modellkante.');
   ids.add(e.id);
  }
  for(const e of g.faces){
   if(!obj(e)||!/^F[1-9][0-9]{0,4}$/.test(e.id)||ids.has(e.id)||!obj(e.ref)||
      (e.ref.cadFaceId!=null&&!/^F[1-9]\d{0,4}$/.test(e.ref.cadFaceId))||
      !finite(e.ref.z)||!validPoint(e.ref.point,3)||Math.abs(e.ref.z-e.ref.point[2])>0.0001)
      fail('Ungültige gespeicherte Modellfläche.');
   ids.add(e.id);
  }
 }
 // Structured project data, not executable instructions. Reject dangerous special keys.
 const stack=[p];let nodes=0;while(stack.length){if(++nodes>150000)fail('Projekt enthält zu viele Datenfelder.');const item=stack.pop();if(item&&typeof item==='object')for(const [k,v] of Object.entries(item)){if(['__proto__','prototype','constructor'].includes(k))fail('Ungültiger Schlüssel in Projektdatei.');if(v&&typeof v==='object')stack.push(v);else if(typeof v==='number'&&!Number.isFinite(v))fail('Ungültige Zahl in Projektdatei.');}}
 return {materials,tools,operations};
}
function pack(project,modelBytes,selectedOperationId,selectedToolId,previewBytes=null,stepTopology=null){
 safeProject(project);let mesh=null;
 if(modelBytes){const bytes=asBytes(modelBytes);if(!project.stlInfo||!project.partPlacement)fail('Modell-Metadaten und Platzierung fehlen.');mesh={format:project.stlInfo.format||'stl',fileName:project.stlInfo.name,byteLength:bytes.length,crc32:checksum(bytes),base64:encode(bytes)};}
 else if(project.stlInfo)fail('Das Modell ist nicht geladen. Bitte Bauteil erneut laden, bevor das Projekt gespeichert wird.');
 let preview=null;
 if(project.stlInfo?.format==='step'){
  if(!mesh||!previewBytes)fail('Die STEP-Vorschau fehlt. STEP-Modell erneut importieren.');
  const bytes=asBytes(previewBytes);
  preview={format:'stl',byteLength:bytes.length,crc32:checksum(bytes),base64:encode(bytes)};
 }else if(previewBytes)fail('Zusätzliche Vorschau nur für STEP zulässig.');
 let topology=null;
 if(project.stlInfo?.format==='step'&&stepTopology!=null){
  if(!root.FertigungsstudioSTEP?.validateTopology)fail('STEP-Topologieprüfung fehlt.');
  const validated=root.FertigungsstudioSTEP.validateTopology(stepTopology);
  const contents=new TextEncoder().encode(JSON.stringify(validated));
  if(contents.length>4000000)fail('STEP-Topologie überschreitet das Größenlimit.');
  topology={byteLength:contents.length,crc32:checksum(contents),data:validated};
 }else if(stepTopology!=null)fail('STEP-Topologie ohne STEP-Modell.');
 return {format:VERSION,savedAt:new Date().toISOString(),units:'mm',project:JSON.parse(JSON.stringify(project)),view:{selectedOperationId,selectedToolId},mesh,preview,topology};
}
function unpack(value){
 if(!obj(value))fail('Projektdatei ist kein gültiges Objekt.');
 const legacy=value.format==='fertigungsstudio-project-v1';
 if(!legacy&&value.format!==VERSION&&value.format!=='fertigungsstudio-project-v2'&&value.format!=='fertigungsstudio-project-v3'&&value.format!=='fertigungsstudio-project-v4')fail('Unbekannte Projektversion.');
 safeProject(value.project);
 const p=value.project;
 let bytes=null;
 if(!legacy&&value.mesh!==null&&value.mesh!==undefined){
  const m=value.mesh;
  if(!obj(m)||!['stl','dxf','step'].includes(m.format)||m.format!==(p.stlInfo?.format||'stl')||!p.stlInfo||!p.partPlacement||typeof m.fileName!=='string'||m.fileName!==p.stlInfo.name||typeof m.crc32!=='string'||!/^[0-9a-f]{8}$/.test(m.crc32))fail('Ungültige Modellbeschreibung.');
  bytes=decode(m.base64,m.byteLength);
  if(checksum(bytes)!==m.crc32)fail('Modell-Prüfsumme stimmt nicht. Die Datei ist beschädigt.');
 }else if(!legacy&&p.stlInfo)fail('Modelldaten fehlen im Projekt.');
 let previewMeshBytes=null;
 if(!legacy && value.mesh?.format==='step'){
  const v=value.preview;
  if(!obj(v)||v.format!=='stl'||!/^[0-9a-f]{8}$/.test(v.crc32))fail('STEP-Vorschau fehlt oder ist ungültig.');
  previewMeshBytes=decode(v.base64,v.byteLength);
  if(checksum(previewMeshBytes)!==v.crc32)fail('STEP-Vorschau-Prüfsumme stimmt nicht.');
 } else if(value.preview!==undefined&&value.preview!==null)fail('Unerwartete zusätzliche Modellvorschau.');
 let stepTopology=null;
 if(value.topology!=null){
  if(value.mesh?.format!=='step'||!obj(value.topology)||!Number.isInteger(value.topology.byteLength)||
     value.topology.byteLength<100||value.topology.byteLength>4000000||
     !/^[0-9a-f]{8}$/.test(value.topology.crc32)||
     !root.FertigungsstudioSTEP?.validateTopology)fail('Ungültige STEP-Topologiedaten.');
  const contents=new TextEncoder().encode(JSON.stringify(value.topology.data));
  if(contents.length!==value.topology.byteLength||checksum(contents)!==value.topology.crc32)
    fail('STEP-Topologie-Prüfsumme stimmt nicht.');
  stepTopology=root.FertigungsstudioSTEP.validateTopology(value.topology.data);
 }
 const view=obj(value.view)?value.view:{};
 return {project:p,meshBytes:bytes,previewMeshBytes,meshFormat:value.mesh?.format||null,stepTopology,legacy,selectedOperationId:p.operations.some(o=>o.id===view.selectedOperationId)?view.selectedOperationId:p.operations[0].id,selectedToolId:p.tools.some(t=>t.id===view.selectedToolId)?view.selectedToolId:p.tools[0].id};
}
const api={VERSION,MAX_MODEL_BYTES,MAX_FILE_BYTES,checksum,encode,decode,pack,unpack,safeProject};
root.FertigungsstudioProjectCodec=api;
if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof globalThis==='object'?globalThis:this);
