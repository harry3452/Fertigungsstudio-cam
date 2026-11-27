// Limited but actual STL triangle geometry with closed horizontal top-face loops.
// No STEP/B-Rep, hidden-edge classification, arbitrary machining setup, or collision analysis.
(function(root){
'use strict';
const LIMIT_TRIANGLES=20000,LIMIT_VERTICES=2048;
function finite(p){return p.every(v=>Number.isFinite(v)&&Math.abs(v)<=1_000_000)}
function parse(input){
 let triangles=[];
 if(!(input instanceof ArrayBuffer))throw Error('STL-Import erwartet Dateibytes.');
 if(input.byteLength>8_000_000)throw Error('STL zu groß (maximal 8 MB).');
 const dv=new DataView(input);
 const bin=input.byteLength>=84&&dv.getUint32(80,true)>0&&
   84+dv.getUint32(80,true)*50===input.byteLength;
 if(bin){
  const count=dv.getUint32(80,true);
  if(count>LIMIT_TRIANGLES)throw Error('STL hat mehr als 20.000 Dreiecke.');
  for(let i=0;i<count;i++){
   const base=84+i*50,triangle=[];
   for(let v=0;v<3;v++){
    const at=base+12+v*12;
    const p=[dv.getFloat32(at,true),dv.getFloat32(at+4,true),dv.getFloat32(at+8,true)];
    if(!finite(p))throw Error('STL enthält ungültige Koordinaten.');
    triangle.push(p);
   }
   triangles.push(triangle);
  }
 }else{
  const data=new TextDecoder('utf-8',{fatal:false}).decode(input);
  if(!/^\s*solid\b/i.test(data)||!/\bfacet\b/i.test(data))
   throw Error('Keine gültige ASCII- oder Binär-STL-Datei.');
  const rx=/\bvertex\s+([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)\s+([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)\s+([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/gi;
  let m,verts=[];
  while((m=rx.exec(data))!==null){
   const p=m.slice(1,4).map(Number);
   if(!finite(p))throw Error('STL enthält ungültige Koordinaten.');
   verts.push(p);
   if(verts.length===3){triangles.push(verts);verts=[];}
   if(triangles.length>LIMIT_TRIANGLES)throw Error('STL hat mehr als 20.000 Dreiecke.');
  }
  if(verts.length)throw Error('Unvollständige ASCII-STL.');
 }
 if(!triangles.length)throw Error('STL enthält keine Dreiecke.');
 const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
 for(const t of triangles)for(const p of t)for(let k=0;k<3;k++){
  min[k]=Math.min(min[k],p[k]);max[k]=Math.max(max[k],p[k]);
 }
 const size=min.map((v,i)=>max[i]-v);
 if(size[0]<=0||size[1]<=0)throw Error('STL hat keine XY-Ausdehnung.');
 triangles=triangles.map(t=>t.map(v=>v.map((n,k)=>n-min[k])));
 const loops=findTopLoops(triangles,size);
 return {triangles,loops,size,sourceBounds:{min,max}};
}
function key(p){return Math.round(p[0]*100000)+','+Math.round(p[1]*100000)}
function area(vertices){
 let v=0;
 for(let i=0;i<vertices.length;i++){
  const p=vertices[i],q=vertices[(i+1)%vertices.length];v+=p[0]*q[1]-q[0]*p[1];
 }
 return v/2;
}
function contains(points,point){
 const [x,y]=point;let result=false;
 for(let i=0,j=points.length-1;i<points.length;j=i++){
  const p=points[i],q=points[j];
  if((p[1]>y)!==(q[1]>y)&&x<(q[0]-p[0])*(y-p[1])/(q[1]-p[1])+p[0])result=!result;
 }
 return result;
}
function findTopLoops(triangles,size){
 const epsilon=Math.max(0.00002,size[2]*0.000005);
 const edges=new Map(),coord=new Map();
 function edge(a,b){
  const ka=key(a),kb=key(b);
  if(ka===kb)return;
  coord.set(ka,[a[0],a[1]]);coord.set(kb,[b[0],b[1]]);
  const id=ka<kb?ka+'|'+kb:kb+'|'+ka;
  const entry=edges.get(id);
  if(entry){entry.count++;}else edges.set(id,{a:ka,b:kb,count:1});
 }
 for(const t of triangles){
  if(!t.every(p=>Math.abs(p[2]-size[2])<=epsilon))continue;
  const a=t[0],b=t[1],c=t[2];
  const cross=(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
  if(Math.abs(cross)<1e-9)continue;
  edge(a,b);edge(b,c);edge(c,a);
 }
 const adj=new Map(),remaining=new Set();
 for(const [id,e] of edges){
  if(e.count!==1)continue;
  remaining.add(id);
  if(!adj.has(e.a))adj.set(e.a,[]);
  if(!adj.has(e.b))adj.set(e.b,[]);
  adj.get(e.a).push({other:e.b,id});
  adj.get(e.b).push({other:e.a,id});
 }
 const validLoops=[];
 for(const id of [...remaining]){
  if(!remaining.has(id))continue;
  const e=edges.get(id),start=e.a,vertices=[],visited=new Set();
  let cur=start,prev=null,closed=false;
  while(vertices.length<=LIMIT_VERTICES){
   if(visited.has(cur)){closed=cur===start;break}
   visited.add(cur);
   const neighbors=adj.get(cur)||[];
   if(neighbors.length!==2)break;
   vertices.push(coord.get(cur));
   const next=neighbors.find(n=>n.other!==prev);
   if(!next)break;
   remaining.delete(next.id);
   prev=cur;cur=next.other;
   if(cur===start){closed=true;break}
  }
  if(closed&&vertices.length>=3&&vertices.length<=LIMIT_VERTICES
    &&Math.abs(area(vertices))>1e-7)validLoops.push(vertices);
 }
 const loops=validLoops.map((points,i)=>{
  const depth=validLoops.filter((other,j)=>j!==i&&contains(other,points[0])).length;
  const side=depth%2?'inside':'outside';
  return {id:'stl-loop-'+i,points,side,area:area(points),z:size[2]};
 });
 loops.sort((a,b)=>Math.abs(b.area)-Math.abs(a.area));
 return loops;
}
// An imported mesh initially defines the rectangular stock envelope exactly.
function fitStock(mesh){
 const [x,y,z]=mesh.size;
 if(![x,y,z].every(v=>Number.isFinite(v)&&v>=0&&v<=100000)||x<=0||y<=0)
  throw Error('STL-Abmessungen außerhalb des Rohteilbereichs (maximal 100.000 mm).');
 const height=Math.max(1,z);
 return {stock:{x,y,z:height},position:{x:0,y:0,z:height-z}};
}
// Position is the normalized part minimum measured from the stock minimum.
// Without an explicit position legacy center-XY/top-Z behavior is retained.
function validatePlacement(size,stock,position){
 const dims=[Number(stock.x),Number(stock.y),Number(stock.z)];
 if(dims.some(v=>!Number.isFinite(v)||v<=0||v>100000))
  throw Error('Rohteilabmessungen müssen positiv und höchstens 100.000 mm sein.');
 const shifts=position?['x','y','z'].map(key=>Number(position[key])):
  [(dims[0]-size[0])/2,(dims[1]-size[1])/2,dims[2]-size[2]];
 if(shifts.some((v,i)=>!Number.isFinite(v)||v<0||v+size[i]>dims[i]+1e-6))
  throw Error('STL-Bauteil liegt außerhalb des Rohteils. Rohteil vergrößern oder Bauteillage ändern.');
 return {dims,shifts};
}
function locate(mesh,stock,position){
 const {dims,shifts}=validatePlacement(mesh.size,stock,position);
 const translated=p=>p.map((v,i)=>v+shifts[i]);
 return {
  triangles:mesh.triangles.map(t=>t.map(translated)),
  loops:mesh.loops.map(loop=>({...loop,points:loop.points.map(p=>[p[0]+shifts[0],p[1]+shifts[1]])})),
  size:mesh.size,stock:dims,position:shifts,partTopZ:shifts[2]+mesh.size[2]
 };
}
const api={parse,fitStock,locate,validatePlacement,findTopLoops,area,contains};
root.FertigungsstudioMeshGeometry=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(globalThis);
