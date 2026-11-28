/*
 * Fertigungsstudio CAM – zusammenhängende Taschenbahnen (experimentelle Vorschau).
 * Nur bereits geometrisch verifizierte 2D-Freiform-/Insel-Taschenbahnen.
 * Verbindet benachbarte Streifen auf gleicher Tiefe ausschließlich dann,
 * wenn das gesamte Werkzeugmittelpunktsegment mit Fräserradius frei liegt.
 * Kein Eilgang im Material; zwischen Tiefenlagen immer Rückzug.
 * Keine 3D-Kollisions-, Material-/Halter- oder CNC-Sicherheitsprüfung.
 */
(function(root){
'use strict';
const EPS=1e-7,MAX_MOVES=100000;
const same=(a,b)=>Math.abs(a-b)<=EPS;
const sameXY=(a,b)=>same(a[0],b[0])&&same(a[1],b[1]);
const xyDist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const cloneMove=m=>({to:m.to.slice(),motion:m.motion});
const polygon=()=>root.CamPolygonPocket||(typeof module==='object'&&module.exports?require('./polygon-taschenbahn.js'):null);
function fail(message){throw Error('Bahnverbindung: '+message)}
function parse(path){
 if(!path||path.operation!=='pocket'||path.format!=='fertigungsstudio-toolpath-v1'||
    !Array.isArray(path.moves)||path.moves.length===0||path.moves.length%4!==0||
    !Array.isArray(path.start)||path.start.length!==3)
  fail('Nur originale Freiform-Taschenstreifen können verbunden werden.');
 const safeZ=path.clearance_z,blocks=[];
 if(!Number.isFinite(safeZ)||!path.start.every(Number.isFinite)||!same(path.start[2],safeZ))fail('Sicherheitshöhe ungültig.');
 const m=path.moves;
 for(let i=0;i<m.length;i+=4){
  const [rapid,down,cut,up]=m.slice(i,i+4);
  if(![rapid,down,cut,up].every(v=>v&&Array.isArray(v.to)&&v.to.length===3&&v.to.every(Number.isFinite))||
     rapid.motion!=='rapid'||down.motion!=='feed'||cut.motion!=='feed'||up.motion!=='rapid'||
     !same(rapid.to[2],safeZ)||!same(up.to[2],safeZ)||
     !sameXY(rapid.to,down.to)||!sameXY(cut.to,up.to)||
     !same(down.to[2],cut.to[2])||!(down.to[2]<safeZ-EPS)||!same(down.to[1],cut.to[1])||
     sameXY(down.to,cut.to))
   fail('Die Ursprungsbahn enthält unbekannte Bewegungen. Keine Optimierung durchgeführt.');
  blocks.push({a:down.to.slice(),b:cut.to.slice(),z:down.to[2]});
 }
 if(!sameXY(path.start,path.moves[0].to))fail('Anfangspunkt passt nicht zur Ursprungsbahn.');
 return blocks;
}
function countRetracts(path){
 let prev=path.start,count=0;
 for(const m of path.moves){
  if(m.motion==='rapid'&&sameXY(prev,m.to)&&m.to[2]>prev[2]+EPS)count++;
  prev=m.to;
 }
 return count;
}
function optimize(path,{points,islands=[],mode='link'}={}){
 if(!['link','retract'].includes(mode))fail('Unbekannte Bahnführung.');
 const geo=polygon();if(!geo)fail('Geometrieprüfung fehlt.');
 const outer=geo.normalize(points).points,inners=geo.validateIslands(outer,islands);
 // Do not edit or normalize incoming machining coordinates before validating them.
 geo.verify(path,outer,inners);
 const blocks=parse(path),originalRetractions=countRetracts(path);
 if(mode==='retract')return {...path,optimization_mode:'retract',optimization_links:0,
   optimization_retracts:originalRetractions,optimization_saved_retracts:0,
   optimization_original_moves:path.moves.length};
 const toolR=Number(path.tool_diameter)/2+0.001;
 if(!Number.isFinite(toolR)||toolR<=0)fail('Werkzeugradius ungültig.');
 const r2=toolR*toolR,zsafe=path.clearance_z;
 let previousEnd=null,previousZ=null,links=0,retracts=0;
 const out=[];
 const push=(to,motion)=>{
  if(!to.every(Number.isFinite)||out.length>=MAX_MOVES)fail('Zu viele oder ungültige Bewegungen.');
  out.push({to:to.slice(),motion});
 };
 for(const block of blocks){
  const candidates=[{start:block.a,end:block.b},{start:block.b,end:block.a}];
  let chosen=candidates[0],canConnect=false;
  if(previousEnd){
   const options=candidates.map(c=>({c,d:xyDist(previousEnd,c.start),
    safe:same(previousZ,block.z)&&geo.clearSegment(previousEnd,c.start,outer,r2,inners)}));
   const safeOptions=options.filter(o=>o.safe);
   const pool=safeOptions.length?safeOptions:options;
   pool.sort((a,b)=>a.d-b.d);
   chosen=pool[0].c;
   canConnect=pool[0].safe;
  }
  if(canConnect){
   // Both ends and the entire connector are checked against wall/island offsets.
   // This is a cutting feed at the SAME Z level; it is never a rapid move.
   if(xyDist(previousEnd,chosen.start)>EPS)push(chosen.start,'feed');
   links++;
  }else{
   if(previousEnd){push([previousEnd[0],previousEnd[1],zsafe],'rapid');retracts++;}
   push([chosen.start[0],chosen.start[1],zsafe],'rapid');
   push(chosen.start,'feed');
  }
  push(chosen.end,'feed');
  previousEnd=chosen.end;previousZ=block.z;
 }
 push([previousEnd[0],previousEnd[1],zsafe],'rapid');retracts++;
 const result={...path,moves:out,optimization_mode:'link',optimization_links:links,
  optimization_retracts:retracts,optimization_saved_retracts:originalRetractions-retracts,
  optimization_original_moves:path.moves.length,optimization_saved_moves:path.moves.length-out.length};
 if(result.optimization_saved_retracts!==links||result.optimization_saved_retracts<0)
  fail('Interne Rückzugsprüfung fehlgeschlagen.');
 geo.verify(result,outer,inners);
 return result;
}
root.CamPocketPathOptimizer={optimize,parse,countRetracts};
if(typeof module==='object'&&module.exports)module.exports=root.CamPocketPathOptimizer;
})(typeof globalThis==='object'?globalThis:this);
