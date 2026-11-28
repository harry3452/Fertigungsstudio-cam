// Render the imported STL mesh and select closed edges on all horizontal planes
(()=>{'use strict';const geo=globalThis.FertigungsstudioMeshGeometry;const faceTools=globalThis.FertigungsstudioSurfaceGeometry;const studio=globalThis.FertigungsstudioStudio;const scene=document.getElementById('scene');const view=scene?.closest('.view');if(!geo||!studio||!scene||!view)return;let mesh=null,meshFileBytes=null,selected=null,hover=null,onSelect=null,picking=false,located=null,stockKey='',meshVersion=0,pickingKind='edge',hoverFace=-1,faceOptions={},cadCache=null;const overlay=document.createElement('div');overlay.id='studioModelPickHint';overlay.hidden=true;overlay.className='studio-model-pick-hint';overlay.innerHTML='<strong>Kontur auswählen</strong><span>Auf eine hervorgehobene geschlossene Kontur der oberen STL-Planfläche klicken · Ziehen dreht das Modell</span><button type="button" id="studioModelPickCancel">Abbrechen</button>';view.appendChild(overlay);const hint=overlay.querySelector('span');overlay.querySelector('button').onclick=()=>end();function current(){if(!mesh)return null;const stock=studio.project().stock;const pos=studio.project().partPlacement;
 const isStep=studio.project().stlInfo?.format==='step';const key=[stock.x,stock.y,stock.z,pos?.x,pos?.y,pos?.z,meshVersion,isStep].join('/');
 if(key!==stockKey){
  located=geo.locate(mesh,stock,pos);located.pickLoops=located.levelLoops||located.loops;located.cad=null;
  if(isStep&&globalThis.FertigungsstudioCADGeometry){
   const topo=globalThis.FertigungsstudioSTEP?.topology();
   if(topo){located.cad=globalThis.FertigungsstudioCADGeometry.locate(topo,mesh.size,stock,pos);located.pickLoops=located.cad.wires;}
  }
  // Two display levels. Model geometry and exact click picking stay untouched.
  // A 2D canvas cannot rasterize 200k triangles interactively at 60 fps.
  const count=located.triangles.length;
  const stride=Math.max(1,Math.ceil(count/6000));
  located.surfaceTriangles=stride===1?located.triangles:located.triangles.filter((_,i)=>i%stride===0);
  const quickStride=Math.max(1,Math.ceil(located.surfaceTriangles.length/850));
  located.fastTriangles=quickStride===1?located.surfaceTriangles:located.surfaceTriangles.filter((_,i)=>i%quickStride===0);
  // Brightness and vertex geometry don't change when the camera rotates.
  function paintInfo(tri){
   const a=tri[0],b=tri[1],c=tri[2];
   const nx=(b[1]-a[1])*(c[2]-a[2])-(b[2]-a[2])*(c[1]-a[1]);
   const ny=(b[2]-a[2])*(c[0]-a[0])-(b[0]-a[0])*(c[2]-a[2]);
   const nz=(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
   const length=Math.max(1e-12,Math.hypot(nx,ny,nz));
   const brightness=Math.max(.12,Math.min(1,.49+.32*nz/length+.13*nx/length-.09*ny/length));
   return {tri,color:'hsl(202 17% '+Math.round(35+brightness*32)+'%)'};
  }
  located.paintFull=located.surfaceTriangles.map(paintInfo);
  located.paintFast=located.fastTriangles.map(paintInfo);
  stockKey=key;
 }
 return located;}
function mapPoint(p,stock){const scale=100/Math.max(stock[0],stock[1],stock[2],1);return point((p[0]-stock[0]/2)*scale,(p[1]-stock[1]/2)*scale,(p[2]-stock[2]/2)*scale);}function drawStock(map,stock){const [x,y,z]=stock;const vertices=[
[0,0,0],[x,0,0],[x,y,0],[0,y,0],[0,0,z],[x,0,z],[x,y,z],[0,y,z]
];for(const [a,b] of [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]])
line(map(vertices[a]),map(vertices[b]),'#ffd477',1.8,[5,3]);}function drawMesh(map){
 const loc=current();if(!loc)return false;
 // While rotating, use a small preview. When movement stops, draw a finer image.
 const quick=drag!==null;
 const paint=quick?loc.paintFast:loc.paintFull;
 const sorted=new Array(paint.length);
 for(let i=0;i<paint.length;i++){
  const item=paint[i];
  const a=project(map(item.tri[0])),b=project(map(item.tri[1])),c=project(map(item.tri[2]));
  sorted[i]={a,b,c,depth:(a.depth+b.depth+c.depth)/3,color:item.color};
 }
 sorted.sort((a,b)=>a.depth-b.depth);
 ctx.lineWidth=0;
 for(const f of sorted){
  ctx.beginPath();ctx.moveTo(f.a.x,f.a.y);ctx.lineTo(f.b.x,f.b.y);ctx.lineTo(f.c.x,f.c.y);ctx.closePath();
  ctx.fillStyle=f.color;ctx.fill();
 }
 // Selection overlay is drawn separately from the reduced preview mesh.
 // For STEP, triangle indices refer to the exact CAD-face ownership table.
 if(picking&&pickingKind==='face'&&hoverFace>=0){
  const pickTriangles=loc.cad?.triangles||loc.fastTriangles;
  const tri=pickTriangles?.[hoverFace];
  if(tri)polygon(tri.map(map),'rgba(84,238,177,.88)','');
 }
 // Preserve the complete contour from the model (never its decimated preview).
 if(pickingKind!=='face'&&(picking||selected))for(const loop of loc.pickLoops){
  const isSelected=loop.id===selected,active=picking&&loop.id===hover;if(!picking&&!isSelected)continue;
  const ps=loop.points.map(p=>map([p[0],p[1],(mesh.format==='dxf'?loc.partTopZ:(loop.z??loc.partTopZ))]));
  for(let i=0;i<ps.length;i++){
   const a=ps[i],b=ps[(i+1)%ps.length];
   if(isSelected||active)line(a,b,'#101921',8);
   line(a,b,active?'#ffd46d':isSelected?'#64ffba':'#a8d6e6',active?5:isSelected?4:1.4);
  }
 }
 return true;
}
const oldDraw=draw;draw=function(){if(!mesh){oldDraw();return;}let loc;try{loc=current()}catch(e){oldDraw();return;}if(coreData){oldDraw();return;}const w=scene.clientWidth,h=scene.clientHeight;ctx.clearRect(0,0,w,h);const map=p=>mapPoint(p,loc.stock);drawMesh(map);drawStock(p=>mapPoint(p,loc.stock),loc.stock);const title=document.getElementById('opTitle');if(title)title.textContent=(loc.cad?'STEP-CAD':mesh.format==='dxf'?'DXF-2D':'STL-Modell')+' · '+loc.pickLoops.length+' wählbare Konturen';document.getElementById('progressText').textContent=loc.cad?'STEP-B-Rep-Flächen und CAD-Kanten · Werkzeugbahnkonturen angenähert':mesh.format==='dxf'?'Importierte DXF-2D-Konturen · keine Z-Höhen':'Importiertes STL · tatsächliche Dreiecksgeometrie';};function projectLoop(loop,loc){const map=p=>mapPoint(p,loc.stock);return loop.points.map(v=>project(map([v[0],v[1],(mesh.format==='dxf'?loc.partTopZ:(loop.z??loc.partTopZ))])));}function distance(point,from,to){const dx=to.x-from.x,dy=to.y-from.y,len2=dx*dx+dy*dy;const t=len2?Math.max(0,Math.min(1,((point.x-from.x)*dx+(point.y-from.y)*dy)/len2)):0;return Math.hypot(point.x-(from.x+t*dx),point.y-(from.y+t*dy));}function candidate(x,y){const loc=current();if(!loc)return null;let closest=null,best=11,bestDepth=-Infinity;
 for(const loop of loc.pickLoops){const ps=projectLoop(loop,loc);
  for(let i=0;i<ps.length;i++){
   const a=ps[i],b=ps[(i+1)%ps.length],d=distance({x,y},a,b);
   const depth=(a.depth+b.depth)/2;
   // At a shared XY boundary, prefer the front edge for the current camera
   // (top from above, floor/underside from below), not the array order.
   if(d<best-.75||(d<11&&Math.abs(d-best)<=.75&&depth>bestDepth)){
    best=d;bestDepth=depth;closest=loop;
   }
  }
 }
 return closest;
}function candidateFace(x,y,precise=false){const loc=current();if(!loc||!faceTools)return null;
 const map=p=>mapPoint(p,loc.stock);
 if(loc.cad){
  const hit=faceTools.pickVisible(loc.cad.triangles,t=>t.map(v=>project(map(v))),{x,y},loc.stock[2]);
  if(!hit)return null;const f=loc.cad.owners[hit.index];
  return {...hit,cadFaceId:f.id,horizontal:f.surface==='plane'&&f.z!==null,
   z:f.z??hit.z,xyz:f.z!==null?[hit.xyz[0],hit.xyz[1],f.z]:hit.xyz};
 }
 return faceTools.pickVisible(precise?loc.triangles:(loc.fastTriangles||loc.surfaceTriangles||loc.triangles),t=>t.map(v=>project(map(v))),{x,y},loc.stock[2]);}
let down=null,faceHoverTimer=null;
scene.addEventListener('pointerdown',e=>{if(picking&&e.button===0){down={x:e.clientX,y:e.clientY};if(faceHoverTimer!==null){clearTimeout(faceHoverTimer);faceHoverTimer=null;}}});
scene.addEventListener('pointermove',e=>{
 if(!picking||down)return;
 const rect=scene.getBoundingClientRect(),x=e.clientX-rect.left,y=e.clientY-rect.top;
 if(pickingKind==='face'){
  if(faceHoverTimer!==null)clearTimeout(faceHoverTimer);
  faceHoverTimer=setTimeout(()=>{
   faceHoverTimer=null;if(!picking||down)return;
   const face=candidateFace(x,y);const next=face?.index??-1;
   if(hoverFace!==next){hoverFace=next;draw();}
   scene.style.cursor=face?.horizontal?'crosshair':'not-allowed';
  },90);
  return;
 }
 const loop=candidate(x,y);const next=loop?.id||null;
 if(next!==hover){hover=next;scene.style.cursor=hover?'crosshair':'default';if(loop)hint.textContent='Kontur auf Z '+Number(loop.z.toFixed(3))+' mm · '+(loop.side==='inside'?'Innenkante':'Außenkante')+' · anklicken';draw();}
});scene.addEventListener('pointerup',e=>{if(!picking||!down)return;const drag=Math.hypot(e.clientX-down.x,e.clientY-down.y);down=null;if(drag>6)return;const rect=scene.getBoundingClientRect();if(pickingKind==='face'){
 const loc=current(),face=candidateFace(e.clientX-rect.left,e.clientY-rect.top,true);
 if(!face){hint.textContent='Keine sichtbare Modellfläche getroffen. Bitte auf die Bodenfläche klicken.';return;}
 try{faceTools.faceDepth(face,loc.stock[2],loc.partTopZ,!!faceOptions.belowTop);}catch(error){hint.textContent=error.message;return;}
 const detail={kind:'plane-xy',z:face.z,point:face.xyz.slice(),triangleIndex:face.index,cadFaceId:face.cadFaceId||null,meshVersion,stockTop:loc.stock[2],modelTop:loc.partTopZ};
 const callback=onSelect;end();if(typeof callback==='function')callback(detail);return;
 }
 const loop=candidate(e.clientX-rect.left,e.clientY-rect.top);if(!loop){hint.textContent='Keine geschlossene Kontur getroffen. Bitte näher auf eine markierte Modellkante klicken.';return;}selected=loop.id;const detail={id:loop.id,side:loop.side,points:loop.points.map(p=>p.slice()),cadWireId:loop.cadWireId||null,cadFaceId:loop.cadFaceId||null,z:loop.z??current().partTopZ,analyticCircle:loop.analyticCircle||null,size:current().size,meshVersion};const callback=onSelect;end();if(typeof callback==='function')callback(detail);});scene.addEventListener('pointercancel',()=>{down=null});function end(){if(faceHoverTimer!==null){clearTimeout(faceHoverTimer);faceHoverTimer=null;}picking=false;onSelect=null;hover=null;hoverFace=-1;down=null;faceOptions={};pickingKind='edge';overlay.hidden=true;scene.style.cursor='';}function begin(callback){if(!mesh)throw Error('Zuerst ein STL- oder DXF-Modell über Datei → Bauteil laden importieren.');if(!current().pickLoops.length)throw Error('Keine geschlossenen wählbaren Konturen im Modell gefunden.');if(typeof callback!=='function')throw Error('Konturauswahl benötigt einen Empfänger.');globalThis.FertigungsstudioToolpath?.clear();onSelect=callback;picking=true;pickingKind='edge';hover=null;overlay.hidden=false;hint.textContent=current().cad?'CAD-Kantenring anklicken · CAD-Kurve für Werkzeugbahn angenähert':mesh.format==='dxf'?'Geschlossene DXF-Kontur anklicken · Ziehen dreht die Ansicht':'STL-Kanten auf allen waagerechten Ebenen anklicken · aktuelle Ansicht bleibt erhalten';}function beginFace(callback,options={}){
 if(mesh?.format==='dxf')throw Error('DXF-2D enthält keine Bodenhöhe: Frästiefe im Reiter einstellen.');
 if(!mesh)throw Error('Zuerst ein STL-Bauteil importieren.');
 if(typeof callback!=='function')throw Error('Flächenauswahl benötigt einen Empfänger.');
 if(!faceTools)throw Error('Modul für Flächenauswahl fehlt.');
 current();globalThis.FertigungsstudioToolpath?.clear();
 onSelect=callback;picking=true;pickingKind='face';faceOptions={belowTop:!!options.belowTop};hoverFace=-1;
 overlay.hidden=false;overlay.querySelector('strong').textContent='Modellfläche wählen';
 hint.textContent='Waagerechte Zielfläche anklicken · Ziehen dreht das Modell · Esc bricht ab';
}
function setMesh(parsed,bytes){const copy=new Uint8Array(bytes instanceof ArrayBuffer?bytes:bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)).slice();if(copy.length>(parsed.format==='stl'?geo.MAX_STL_BYTES:8_000_000))throw Error('Modellgröße überschreitet das Importlimit.');end();meshFileBytes=copy;mesh=parsed;selected=null;stockKey='';located=null;meshVersion++;globalThis.FertigungsstudioToolpath?.clear();if(typeof resize==='function')resize();return {triangles:mesh.triangles.length,loops:mesh.loops.length,size:mesh.size,warnings:mesh.warnings||[]};}
function load(bytes){const parsed=geo.parse(bytes);parsed.format='stl';return setMesh(parsed,bytes);}
function loadDxf(bytes){const parser=globalThis.FertigungsstudioDxfImport;if(!parser)throw Error('DXF-Importmodul fehlt.');const parsed=parser.parse(bytes);return setMesh(parsed,bytes);}function invalidatePlacement(){end();selected=null;stockKey='';located=null;meshVersion++;globalThis.FertigungsstudioToolpath?.clear();if(typeof resize==='function')resize();}function clear(){end();mesh=null;meshFileBytes=null;selected=null;stockKey='';located=null;meshVersion++;if(typeof resize==='function')resize();}function renderStockPreview(canvas,stock,position){const ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height;ctx.clearRect(0,0,w,h);ctx.fillStyle='#142330';ctx.fillRect(0,0,w,h);if(!mesh)return;const placement=geo.validatePlacement(mesh.size,stock,position);
const dims=placement.dims,shifts=placement.shifts;
const loc={stock:dims,partTopZ:shifts[2]+mesh.size[2],loops:mesh.loops.map(loop=>({points:loop.points.map(p=>[p[0]+shifts[0],p[1]+shifts[1]])}))};
const scale=Math.min(w/(Math.max(dims[0],dims[1])*1.7+1),h/(Math.max(...dims)*1.35+1))*1.1;const yaw=-Math.PI/4,pitch=Math.acos(1/Math.sqrt(3));const point=p=>{const a=p[0]-dims[0]/2,b=p[1]-dims[1]/2,c=p[2]-dims[2]/2;const xx=a*Math.cos(yaw)-b*Math.sin(yaw);const yy=a*Math.sin(yaw)+b*Math.cos(yaw);return {x:w/2+xx*scale,y:h/2+(yy*Math.cos(pitch)-c*Math.sin(pitch))*scale,depth:yy*Math.sin(pitch)+c*Math.cos(pitch)};};const faces=[];const step=Math.max(1,Math.ceil(mesh.triangles.length/2000));
for(let i=0;i<mesh.triangles.length;i+=step){
 const tri=mesh.triangles[i];
 const points=tri.map(p=>point([p[0]+shifts[0],p[1]+shifts[1],p[2]+shifts[2]]));
 faces.push({points,z:(points[0].depth+points[1].depth+points[2].depth)/3});
}faces.sort((a,b)=>a.z-b.z);for(const face of faces){ctx.beginPath();face.points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.fillStyle='#688fa4';ctx.fill();}if(mesh.format==='dxf'){ctx.strokeStyle='#82def1';ctx.lineWidth=2;for(const loop of loc.loops){ctx.beginPath();loop.points.map(p=>point([p[0],p[1],loc.partTopZ])).forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.stroke();}}const corners=[
[0,0,0],[dims[0],0,0],[dims[0],dims[1],0],[0,dims[1],0],[0,0,dims[2]],[dims[0],0,dims[2]],[dims[0],dims[1],dims[2]],[0,dims[1],dims[2]]
].map(point);ctx.setLineDash([6,4]);ctx.lineWidth=2;ctx.strokeStyle='#ffd477';for(const [a,b] of [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]]){ctx.beginPath();ctx.moveTo(corners[a].x,corners[a].y);ctx.lineTo(corners[b].x,corners[b].y);ctx.stroke();}ctx.setLineDash([]);}function resolveLoop(reference){
 if(!mesh||!reference||!Array.isArray(reference.points))return null;
 let loc;try{loc=current()}catch{return null;}
 const normalize=globalThis.CamPolygonPocket?.normalize;
 const ring=points=>{try{return normalize?normalize(points).points:points;}catch{return null;}};
 const target=ring(reference.points);if(!target)return null;
 const same=(a,b)=>Math.abs(a[0]-b[0])<0.00002&&Math.abs(a[1]-b[1])<0.00002;
 const loops=loc.pickLoops.filter(l=>l.side===reference.side&&(!reference.cadWireId||l.cadWireId===reference.cadWireId)&&(!Number.isFinite(reference.z)||Math.abs(l.z-reference.z)<0.0001));
 for(const loop of loops){
  const points=ring(loop.points);if(!points||points.length!==target.length)continue;
  // A contour may have a different first point after STL serialization.
  for(let offset=0;offset<points.length;offset++){
   if(target.every((v,i)=>same(v,points[(i+offset)%points.length])))
    return {id:loop.id,cadWireId:loop.cadWireId||null,cadFaceId:loop.cadFaceId||null,side:loop.side,z:loop.z??loc.partTopZ,analyticCircle:loop.analyticCircle||null,points:loop.points.map(v=>v.slice()),meshVersion};
  }
 }
 return null;
}
// Recheck a saved planar point against the actual triangles at current STL placement.
// No blind reuse of stale screen coordinates or arbitrary numeric Z values.
function findBlindFloor(hole){
 const loc=current();if(!loc?.cad||!hole||!Array.isArray(hole.center)||!Number.isFinite(hole.z))return null;
 const [x,y]=hole.center,faceTools=globalThis.FertigungsstudioCADGeometry;
 const faces=loc.cad.faces.filter(f=>f.surface==='plane'&&Number.isFinite(f.z)&&f.z<hole.z-0.0001&&
   faceTools.faceContainsPoint(f,[x,y,f.z])).sort((a,b)=>b.z-a.z);
 const face=faces[0];if(!face)return null;
 return {cadFaceId:face.id,z:face.z,point:[x,y,face.z],meshVersion};
}
function resolveFace(reference){
 if(!mesh||!reference||!Array.isArray(reference.point)||reference.point.length!==3||
    !reference.point.every(Number.isFinite)||!Number.isFinite(reference.z))return null;
 let loc;try{loc=current();}catch{return null;}
 const target=reference.point,eps=Math.max(0.00003,loc.stock[2]*0.000005);
 if(loc.cad&&reference.cadFaceId){
  const f=loc.cad.faces.find(f=>f.id===reference.cadFaceId);
  if(!f||f.z==null||!globalThis.FertigungsstudioCADGeometry.faceContainsPoint(f,target))return null;
  return {kind:'plane-xy',cadFaceId:f.id,z:f.z,point:target.slice(),meshVersion,stockTop:loc.stock[2],modelTop:loc.partTopZ};
 }

 if(Math.abs(target[2]-reference.z)>eps)return null;
 for(let index=0;index<loc.triangles.length;index++){
  const tri=loc.triangles[index];if(tri.some(p=>Math.abs(p[2]-target[2])>eps))continue;
  const [a,b,c]=tri,area=(b[0]-a[0])*(c[1]-a[1])-(c[0]-a[0])*(b[1]-a[1]);
  if(Math.abs(area)<1e-12)continue;
  const px=target[0]-a[0],py=target[1]-a[1];
  const u=(px*(c[1]-a[1])-py*(c[0]-a[0]))/area;
  const w=(py*(b[0]-a[0])-px*(b[1]-a[1]))/area;
  if(u< -1e-5||w< -1e-5||u+w>1.00001)continue;
  return {kind:'plane-xy',z:target[2],point:target.slice(),triangleIndex:index,meshVersion,stockTop:loc.stock[2],modelTop:loc.partTopZ};
 }
 return null;
}
globalThis.FertigungsstudioSTLPicker={load,loadDxf,modelFormat:()=>mesh?.format||null,begin,beginFace,end,clear,invalidatePlacement,hasModel:()=>!!mesh,modelVersion:()=>meshVersion,modelBytes:()=>meshFileBytes?.slice()||null,resolveLoop,resolveFace,findBlindFloor,fitStock:()=>mesh?geo.fitStock(mesh):null,modelSize:()=>mesh?.size.slice()||null,drawMesh,drawStock,renderStockPreview,selected:()=>selected,loops:()=>{try{return current()?.pickLoops||[];}catch{return []}}};})();

