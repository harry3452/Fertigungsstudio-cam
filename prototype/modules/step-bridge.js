/* STEP source, triangular preview and Open CASCADE B-Rep topology snapshot.
 * CAD identities are sourced from B-Rep, NEVER inferred from preview triangles.
 * Display polylines approximate curves; NC machining of exact STEP curves is NOT supported.
 * Apache-2.0.
 */
(function(root){'use strict';
let original=null,preview=null,topology=null;
const MAX=8_000_000, MAX_TOPO=4_000_000;
const asBytes=x=>x instanceof Uint8Array?x:new Uint8Array(x);
function fromBase64(s){
 if(typeof s!=='string'||!s||s.length>10_666_672||s.length%4||!/^[A-Za-z0-9+/]*={0,2}$/.test(s))throw Error('Ungültige STEP-Vorschauantwort.');
 const b=atob(s);if(!b.length||b.length>MAX)throw Error('STEP-Vorschau über 8 MB.');
 return Uint8Array.from(b,c=>c.charCodeAt(0));
}
const point=p=>Array.isArray(p)&&p.length===3&&p.every(v=>typeof v==='number'&&Number.isFinite(v)&&Math.abs(v)<1_000_001);
function validateTopology(value){
 if(!value||value.format!=='fertigungsstudio-step-topology-v1'||value.source!=='occt-brep'||!point(value.meshMin)||
 !Array.isArray(value.faces)||!value.faces.length||value.faces.length>2000||!Array.isArray(value.wires)||value.wires.length>4000)throw Error('Ungültige STEP-CAD-Topologie.');
 const fids=new Set(),wids=new Set();let triCount=0,pointCount=0;
 for(const f of value.faces){
  if(!/^F[1-9]\d{0,4}$/.test(f?.id)||fids.has(f.id)||!['plane','other'].includes(f.surface)||
   !(f.normal===null||point(f.normal))||!(f.z===null||Number.isFinite(f.z))||!Array.isArray(f.wireIds)||
   !Array.isArray(f.triangles))throw Error('Ungültige STEP-Fläche.');
  fids.add(f.id);triCount+=f.triangles.length;
  if(triCount>25000||f.triangles.some(t=>!Array.isArray(t)||t.length!==3||!t.every(point)))throw Error('Ungültige STEP-Flächentriangulierung.');
 }
 for(const w of value.wires){
  if(typeof w?.id!=='string'||!/^F[1-9]\d{0,4}-W[1-9]\d{0,4}$/.test(w.id)||wids.has(w.id)||!fids.has(w.faceId)||
    !Array.isArray(w.points)||!Array.isArray(w.segments)||!Array.isArray(w.edgeIds)||w.edgeIds.length!==w.segments.length||
    typeof w.horizontal!=='boolean'||!(w.z===null||Number.isFinite(w.z)))throw Error('Ungültiger STEP-Kantenring.');
  wids.add(w.id);pointCount+=w.points.length;
  if(pointCount>40000||w.points.some(p=>!point(p))||w.segments.some(s=>!/^E[1-9]\d{0,6}$/.test(s?.id)||!['line','circle','other'].includes(s.kind)||
       (s.kind==='circle'&&(!point(s.center)||!Number.isFinite(s.radius)||s.radius<0))))throw Error('Ungültige STEP-Kurvenwerte.');
 }
 for(const f of value.faces)if(f.wireIds.some(id=>!wids.has(id)||!value.wires.some(w=>w.id===id&&w.faceId===f.id)))throw Error('STEP-Fläche ohne zugehörige Kante.');
 const json=JSON.stringify(value);if(new TextEncoder().encode(json).length>MAX_TOPO)throw Error('STEP-Topologie größer als 4 MB.');
 return JSON.parse(json);
}
async function convertDetailed(data){
 const bytes=asBytes(data);
 if(!bytes.length||bytes.length>MAX)throw Error('STEP-Datei muss zwischen 1 Byte und 8 MB groß sein.');
 let response;
 try{response=await fetch('/api/step-convert',{method:'POST',headers:{'Content-Type':'application/x-fertigungsstudio-step'},body:bytes});}
 catch{throw Error('STEP-Import benötigt den lokalen Windows-Starter und die CAD-Komponente.');}
 if(!response.ok){const message=(await response.text()).slice(0,450);throw Error(message||'STEP-Konvertierung fehlgeschlagen.');}
 const obj=await response.json();
 if(obj?.format!=='stl'||!Number.isInteger(obj.byteLength)||obj.byteLength<134||obj.byteLength>MAX)throw Error('Ungültige Antwort der STEP-Komponente.');
 const output=fromBase64(obj.base64);
 if(output.length!==obj.byteLength)throw Error('STL-Vorschau ist unvollständig.');
 const topo=obj.topology==null?null:validateTopology(obj.topology);
 return {preview:output,topology:topo};
}
async function convert(data){return (await convertDetailed(data)).preview;}
function remember(a,b,t=null){
 const s=asBytes(a),p=asBytes(b);
 if(!s.length||s.length>MAX||!p.length||p.length>MAX)throw Error('STEP-Quelldatei oder Vorschau ist ungültig.');
 const checked=t==null?null:validateTopology(t);
 original=s.slice();preview=p.slice();topology=checked;
}
root.FertigungsstudioSTEP={convert,convertDetailed,validateTopology,remember,
 clear(){original=null;preview=null;topology=null;},original:()=>original?.slice()||null,
 preview:()=>preview?.slice()||null,topology:()=>topology?JSON.parse(JSON.stringify(topology)):null};
if(typeof module==='object'&&module.exports)module.exports=root.FertigungsstudioSTEP;
})(globalThis);
