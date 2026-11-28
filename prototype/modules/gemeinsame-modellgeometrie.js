/* Fertigungsstudio CAM – gemeinsame, projektgebundene STL-Geometrieablage.
 * Kanten und waagerechte Modellflächen aus verschiedenen Frässtrategien wiederverwenden.
 * Referenzen werden vor jeder Übernahme erneut am exakt gleichen STL und Setup geprüft.
 * Keine Maschinen-, Kollisions- oder 3D-Fräsfreigabe. Apache-2.0.
 */
(function(root){'use strict';
const LIMIT=48;
const finite=n=>typeof n==='number'&&Number.isFinite(n);
function dependencies(){
 const studio=root.FertigungsstudioStudio,picker=root.FertigungsstudioSTLPicker,codec=root.FertigungsstudioProjectCodec;
 if(!studio||!picker?.hasModel?.()||!codec?.checksum)throw Error('Für die Geometrieablage muss ein STL-Modell geladen sein.');
 return {studio,picker,codec};
}
let lastVersion=null,lastSignature=null;
function signature(){
 const {studio,picker,codec}=dependencies(),p=studio.project(),raw=picker.modelBytes();
 if(!raw?.length)throw Error('STL-Modell ist nicht vollständig geladen.');
 const version=picker.modelVersion(),checksum=lastVersion===version?lastSignature:codec.checksum(raw)+':'+raw.length;
 if(lastVersion!==version){lastVersion=version;lastSignature=checksum;}
 const stock=p.stock||{},pos=p.partPlacement||{};
 const positions=[stock.x,stock.y,stock.z,pos.x,pos.y,pos.z];
 if(!positions.every(finite))throw Error('Rohteil- oder Bauteilposition fehlt.');
 return checksum+'|'+positions.join('|');
}
function view(create){
 const {studio}=dependencies(),p=studio.project(),key=signature();
 const existing=p.sharedGeometry;
 if(existing?.version===1&&existing.signature===key&&Array.isArray(existing.edges)&&Array.isArray(existing.faces))return existing;
 if(!create)return null;
 const result={version:1,signature:key,edges:[],faces:[]};
 p.sharedGeometry=result;
 studio.touch();
 return result;
}
function validRef(ref){return ref&&typeof ref==='object'&&typeof ref.side==='string'&&Array.isArray(ref.points)&&ref.points.length>=3&&ref.points.length<=2048&&ref.points.every(p=>Array.isArray(p)&&p.length===2&&p.every(finite));}
function recordEdge(detail){
 const {studio,picker}=dependencies();
 if(detail?.meshVersion!==picker.modelVersion()||!validRef(detail))throw Error('Kontur stammt nicht vom aktuellen STL-Modell.');
 const actual=picker.resolveLoop(detail);
 if(!actual)throw Error('Die gewählte Kontur wurde im Modell nicht wiedergefunden.');
 const state=view(true),index=state.edges.findIndex(e=>e.ref.id===actual.id&&e.ref.side===actual.side&&e.ref.z===actual.z);
 if(index>=0)return state.edges[index].id;
 if(state.edges.length>=LIMIT)throw Error('Maximal 48 gespeicherte Konturen.');
 const id='K'+(state.edges.reduce((m,e)=>Math.max(m,Number(e.id.slice(1))||0),0)+1);
 state.edges.push({id,ref:{id:actual.id,cadWireId:actual.cadWireId||null,cadFaceId:actual.cadFaceId||null,side:actual.side,z:actual.z,points:actual.points.map(p=>p.slice())}});
 studio.touch();return id;
}
function recordFace(detail){
 const {studio,picker}=dependencies();
 if(detail?.meshVersion!==picker.modelVersion()||!finite(detail.z)||!Array.isArray(detail.point)||detail.point.length!==3||!detail.point.every(finite))throw Error('Fläche stammt nicht vom aktuellen STL-Modell.');
 const actual=picker.resolveFace?.(detail);
 if(!actual)throw Error('Die gewählte waagerechte Fläche ist im STL nicht mehr vorhanden.');
 const state=view(true),index=state.faces.findIndex(e=>Math.abs(e.ref.z-actual.z)<1e-5&&e.ref.point.every((v,j)=>Math.abs(v-actual.point[j])<1e-5));
 if(index>=0)return state.faces[index].id;
 if(state.faces.length>=LIMIT)throw Error('Maximal 48 gespeicherte Modellflächen.');
 const id='F'+(state.faces.reduce((m,e)=>Math.max(m,Number(e.id.slice(1))||0),0)+1);
 state.faces.push({id,ref:{cadFaceId:actual.cadFaceId||null,z:actual.z,point:actual.point.slice()}});
 studio.touch();return id;
}
function listEdges(){
 const {picker}=dependencies(),s=view(false);
 return s?s.edges.filter(e=>picker.resolveLoop?.(e.ref)).map(e=>({id:e.id,label:e.id+' · '+(e.ref.side==='inside'?'Innenkante':'Außenkante')+' · Z '+Number((e.ref.z??0).toFixed(3))+' mm · '+e.ref.points.length+' Punkte',side:e.ref.side})):[];
}
function listFaces(){
 const {picker}=dependencies(),s=view(false);
 return s?s.faces.filter(e=>picker.resolveFace?.(e.ref)).map(e=>({id:e.id,label:e.id+' · Ebene Z '+Number(e.ref.z.toFixed(3))+' mm',z:e.ref.z})):[];
}
function getEdge(id){
 const {picker}=dependencies(),s=view(false),e=s?.edges.find(e=>e.id===id);
 if(!e)throw Error('Diese Kontur gehört nicht zum aktuellen STL und Rohteil-Setup.');
 const actual=picker.resolveLoop?.(e.ref);
 if(!actual)throw Error('Diese Kontur ist im STL nicht mehr vorhanden.');
 return {...actual,points:actual.points.map(p=>p.slice())};
}
function getFace(id){
 const {picker}=dependencies(),s=view(false),e=s?.faces.find(e=>e.id===id);
 if(!e)throw Error('Diese Ebene gehört nicht zum aktuellen STL und Rohteil-Setup.');
 const actual=picker.resolveFace?.(e.ref);
 if(!actual)throw Error('Diese Ebene ist im STL nicht mehr vorhanden.');
 return {...actual,point:actual.point.slice()};
}
root.FertigungsstudioSharedGeometry={signature,recordEdge,recordFace,listEdges,listFaces,getEdge,getFace};
if(typeof module==='object'&&module.exports)module.exports=root.FertigungsstudioSharedGeometry;
})(typeof globalThis==='object'?globalThis:this);
