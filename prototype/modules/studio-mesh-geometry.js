// STL geometry with top contours and selectable edges on all horizontal levels.
(function(root){'use strict';const LIMIT_TRIANGLES=250000,LIMIT_VERTICES=2048,LIMIT_RAW_VERTICES=250000,MAX_STL_BYTES=24_000_000;function finite(p){return p.every(v=>Number.isFinite(v)&&Math.abs(v)<=1_000_000)}function parse(input){let triangles=[];if(!(input instanceof ArrayBuffer))throw Error('STL-Import erwartet Dateibytes.');if(input.byteLength>MAX_STL_BYTES)throw Error('STL zu groß (maximal 24 MB). Bitte STL beim Export gröber triangulieren.');const dv=new DataView(input);const bin=input.byteLength>=84&&dv.getUint32(80,true)>0&&
84+dv.getUint32(80,true)*50<=input.byteLength&&input.byteLength-(84+dv.getUint32(80,true)*50)<=128;if(bin){const count=dv.getUint32(80,true);if(count>LIMIT_TRIANGLES)throw Error('STL hat mehr als 250.000 Dreiecke. Bitte mit gröberer STL-Auflösung aus CAD exportieren.');for(let i=0;i<count;i++){const base=84+i*50,triangle=[];for(let v=0;v<3;v++){const at=base+12+v*12;const p=[dv.getFloat32(at,true),dv.getFloat32(at+4,true),dv.getFloat32(at+8,true)];if(!finite(p))throw Error('STL enthält ungültige Koordinaten.');triangle.push(p);}triangles.push(triangle);}}else{const data=new TextDecoder('utf-8',{fatal:false}).decode(input);if(!/^\s*solid\b/i.test(data)||!/\bfacet\b/i.test(data))
throw Error('Keine gültige ASCII- oder Binär-STL-Datei.');const rx=/\bvertex\s+([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)\s+([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)\s+([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/gi;let m,verts=[];while((m=rx.exec(data))!==null){const p=m.slice(1,4).map(Number);if(!finite(p))throw Error('STL enthält ungültige Koordinaten.');verts.push(p);if(verts.length===3){triangles.push(verts);verts=[];}if(triangles.length>LIMIT_TRIANGLES)throw Error('STL hat mehr als 250.000 Dreiecke. Bitte mit gröberer STL-Auflösung aus CAD exportieren.');}if(verts.length)throw Error('Unvollständige ASCII-STL.');}if(!triangles.length)throw Error('STL enthält keine Dreiecke.');const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(const t of triangles)for(const p of t)for(let k=0;k<3;k++){min[k]=Math.min(min[k],p[k]);max[k]=Math.max(max[k],p[k]);}const size=min.map((v,i)=>max[i]-v);if(size[0]<=0||size[1]<=0)throw Error('STL hat keine XY-Ausdehnung.');triangles=triangles.map(t=>t.map(v=>v.map((n,k)=>n-min[k])));const loops=findTopLoops(triangles,size);
 const horizontalLevels=detectHorizontalLevels(triangles,size);
 // Each horizontal planar patch has its own perimeter. The top contours
 // remain separate for backwards-compatible STL topology and existing projects.
 // Bucket planes once so a dense STL is not rescanned for each Z level.
 const planeBuckets=new Map(), planeTolerance=Math.max(.00002,size[2]*.000005);
 for(const tri of triangles){
  if(Math.abs(tri[0][2]-tri[1][2])>planeTolerance||Math.abs(tri[0][2]-tri[2][2])>planeTolerance)continue;
  const k=Math.round(tri[0][2]*1000);
  if(!planeBuckets.has(k))planeBuckets.set(k,[]);
  planeBuckets.get(k).push(tri);
 }
 const lowerLoops=[];
 const bounds=points=>{const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);return [Math.min(...xs),Math.max(...xs),Math.min(...ys),Math.max(...ys)];};
 for(const level of horizontalLevels){
  if(Math.abs(level.z-size[2])<=planeTolerance)continue;
  const planeTriangles=planeBuckets.get(Math.round(level.z*1000))||[];
  for(const ring of findTopLoops(planeTriangles,size,level.z)){
   // In a straight pocket, the top opening and the floor edge have identical
   // XY outlines but different Z coordinates. Keep their inside/outside sense.
   const rb=bounds(ring.points);
   const matchingTop=loops.find(top=>{
    if(Math.abs(Math.abs(top.area)-Math.abs(ring.area))>Math.max(.002,Math.abs(top.area)*.001))return false;
    const tb=bounds(top.points);
    return tb.every((v,i)=>Math.abs(v-rb[i])<.002);
   });
   if(matchingTop)ring.side=matchingTop.side;
   lowerLoops.push(ring);
  }
 }
 const levelLoops=[...loops,...lowerLoops];
 return {triangles,loops,levelLoops,size,horizontalLevels,sourceBounds:{min,max}};}function key(p){return Math.round(p[0]*100000)+','+Math.round(p[1]*100000)}function area(vertices){let v=0;for(let i=0;i<vertices.length;i++){const p=vertices[i],q=vertices[(i+1)%vertices.length];v+=p[0]*q[1]-q[0]*p[1];}return v/2;}function contains(points,point){const [x,y]=point;let result=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const p=points[i],q=points[j];if((p[1]>y)!==(q[1]>y)&&x<(q[0]-p[0])*(y-p[1])/(q[1]-p[1])+p[0])result=!result;}return result;}// Remove redundant collinear STL tessellation vertices without altering CAD dimensions.
function simplifyCollinear(vertices){
 const out=[]; const n=vertices.length;
 for(let i=0;i<n;i++){
  const a=vertices[(i+n-1)%n], b=vertices[i], c=vertices[(i+1)%n];
  const ax=b[0]-a[0],ay=b[1]-a[1],bx=c[0]-b[0],by=c[1]-b[1];
  const la=Math.hypot(ax,ay),lb=Math.hypot(bx,by);
  if(la<1e-8||lb<1e-8)continue;
  const normal=Math.abs(ax*by-ay*bx)/(la+lb);
  if(normal<=0.000005&&ax*bx+ay*by>=0)continue;
  out.push(b);
 }
 return out;
}
function detectHorizontalLevels(triangles,size){
 const planes=new Map(),eps=Math.max(.00002,size[2]*.000005),minArea=Math.max(.0001,size[0]*size[1]*.00001);
 for(const t of triangles){
  if(Math.abs(t[0][2]-t[1][2])>eps||Math.abs(t[0][2]-t[2][2])>eps)continue;
  const a=t[0],b=t[1],c=t[2],area=Math.abs((b[0]-a[0])*(c[1]-a[1])-(c[0]-a[0])*(b[1]-a[1]))/2;
  if(area<1e-9)continue;
  const key=Math.round(a[2]*1000),old=planes.get(key)||{z:0,area:0,triangles:0};
  old.z+=a[2];old.area+=area;old.triangles++;planes.set(key,old);
 }
 return [...planes.values()].filter(v=>v.area>=minArea).map(v=>({z:v.z/v.triangles,area:v.area,triangles:v.triangles})).sort((a,b)=>b.z-a.z).slice(0,64);
}function findTopLoops(triangles,size,planeZ=size[2]){const epsilon=Math.max(0.00002,size[2]*0.000005);const edges=new Map(),coord=new Map();function edge(a,b){const ka=key(a),kb=key(b);if(ka===kb)return;coord.set(ka,[a[0],a[1]]);coord.set(kb,[b[0],b[1]]);const id=ka<kb?ka+'|'+kb:kb+'|'+ka;const entry=edges.get(id);if(entry){entry.count++;}else edges.set(id,{a:ka,b:kb,count:1});}for(const t of triangles){if(!t.every(p=>Math.abs(p[2]-planeZ)<=epsilon))continue;const a=t[0],b=t[1],c=t[2];const cross=(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);if(Math.abs(cross)<1e-9)continue;edge(a,b);edge(b,c);edge(c,a);}const adj=new Map(),remaining=new Set();for(const [id,e] of edges){if(e.count!==1)continue;remaining.add(id);if(!adj.has(e.a))adj.set(e.a,[]);if(!adj.has(e.b))adj.set(e.b,[]);adj.get(e.a).push({other:e.b,id});adj.get(e.b).push({other:e.a,id});}const validLoops=[];for(const id of [...remaining]){if(!remaining.has(id))continue;const e=edges.get(id),start=e.a,vertices=[],visited=new Set();let cur=start,prev=null,closed=false;while(vertices.length<=LIMIT_RAW_VERTICES){if(visited.has(cur)){closed=cur===start;break}visited.add(cur);const neighbors=adj.get(cur)||[];if(neighbors.length!==2)break;vertices.push(coord.get(cur));const next=neighbors.find(n=>n.other!==prev);if(!next)break;remaining.delete(next.id);prev=cur;cur=next.other;if(cur===start){closed=true;break}}if(closed&&vertices.length>=3){const simplified=simplifyCollinear(vertices);if(simplified.length>=3&&simplified.length<=LIMIT_VERTICES
&&Math.abs(area(simplified))>1e-7)validLoops.push(simplified);}}const loops=validLoops.map((points,i)=>{const depth=validLoops.filter((other,j)=>j!==i&&contains(other,points[0])).length;const side=depth%2?'inside':'outside';return {id:(Math.abs(planeZ-size[2])<=epsilon?'stl-loop-':'stl-level-'+Math.round(planeZ*1000)+'-')+i,points,side,area:area(points),z:planeZ};});loops.sort((a,b)=>Math.abs(b.area)-Math.abs(a.area));return loops;}function fitStock(mesh){const [x,y,z]=mesh.size;if(![x,y,z].every(v=>Number.isFinite(v)&&v>=0&&v<=100000)||x<=0||y<=0)
throw Error('STL-Abmessungen außerhalb des Rohteilbereichs (maximal 100.000 mm).');const height=Math.max(1,z);return {stock:{x,y,z:height},position:{x:0,y:0,z:height-z}};}function validatePlacement(size,stock,position){const dims=[Number(stock.x),Number(stock.y),Number(stock.z)];if(dims.some(v=>!Number.isFinite(v)||v<=0||v>100000))
throw Error('Rohteilabmessungen müssen positiv und höchstens 100.000 mm sein.');const shifts=position?['x','y','z'].map(key=>Number(position[key])):
[(dims[0]-size[0])/2,(dims[1]-size[1])/2,dims[2]-size[2]];if(shifts.some((v,i)=>!Number.isFinite(v)||v<0||v+size[i]>dims[i]+1e-6))
throw Error('STL-Bauteil liegt außerhalb des Rohteils. Rohteil vergrößern oder Bauteillage ändern.');return {dims,shifts};}function locate(mesh,stock,position){const {dims,shifts}=validatePlacement(mesh.size,stock,position);const translated=p=>p.map((v,i)=>v+shifts[i]);// Common case: auto-fitted stock has no offset. Reuse validated triangle arrays,
// do not clone hundreds of thousands of triangles just for displaying them.
const zero=shifts.every(v=>v===0);
return {triangles:zero?mesh.triangles:mesh.triangles.map(t=>t.map(translated)),loops:zero?mesh.loops:mesh.loops.map(loop=>({...loop,z:loop.z+shifts[2],points:loop.points.map(p=>[p[0]+shifts[0],p[1]+shifts[1]])})),
 levelLoops:zero?(mesh.levelLoops||mesh.loops):(mesh.levelLoops||mesh.loops).map(loop=>({...loop,z:loop.z+shifts[2],points:loop.points.map(p=>[p[0]+shifts[0],p[1]+shifts[1]])})),size:mesh.size,stock:dims,position:shifts,partTopZ:shifts[2]+mesh.size[2]
};}const api={parse,fitStock,locate,validatePlacement,findTopLoops,detectHorizontalLevels,area,contains,MAX_STL_BYTES,LIMIT_TRIANGLES};root.FertigungsstudioMeshGeometry=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;})(globalThis);