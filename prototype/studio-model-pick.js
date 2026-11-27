// Render an actually imported STL mesh and select its closed horizontal top
// contours by clicking the projected loop on the 3D canvas.
// The old scene is only illustrative when no STL is imported.
(()=>{
'use strict';
const geo=globalThis.FertigungsstudioMeshGeometry;
const studio=globalThis.FertigungsstudioStudio;
const scene=document.getElementById('scene');
const view=scene?.closest('.view');
if(!geo||!studio||!scene||!view)return;
let mesh=null,selected=null,hover=null,onSelect=null,picking=false,located=null,stockKey='',meshVersion=0;
const overlay=document.createElement('div');
overlay.id='studioModelPickHint';
overlay.hidden=true;
overlay.className='studio-model-pick-hint';
overlay.innerHTML='<strong>Kontur auswählen</strong><span>Auf eine hervorgehobene geschlossene Kontur der oberen STL-Planfläche klicken · Ziehen dreht das Modell</span><button type="button" id="studioModelPickCancel">Abbrechen</button>';
view.appendChild(overlay);
const hint=overlay.querySelector('span');
overlay.querySelector('button').onclick=()=>end();
function current(){
 if(!mesh)return null;
 const stock=studio.project().stock;
 const pos=studio.project().partPlacement;
 const key=[stock.x,stock.y,stock.z,pos?.x,pos?.y,pos?.z].join('/');
 if(key!==stockKey){
  located=geo.locate(mesh,stock,pos);
  stockKey=key;
 }
 return located;
}
function mapPoint(p,stock){
 const scale=100/Math.max(stock[0],stock[1],stock[2],1);
 return point((p[0]-stock[0]/2)*scale,(p[1]-stock[1]/2)*scale,(p[2]-stock[2]/2)*scale);
}
function drawStock(map,stock){
 const [x,y,z]=stock;
 const vertices=[
  [0,0,0],[x,0,0],[x,y,0],[0,y,0],
  [0,0,z],[x,0,z],[x,y,z],[0,y,z]
 ];
 for(const [a,b] of [[0,1],[1,2],[2,3],[3,0],
  [4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]])
  line(map(vertices[a]),map(vertices[b]),'#ffd477',1.8,[5,3]);
}
function drawMesh(map){
 const loc=current();if(!loc)return false;
 const sorted=loc.triangles.map(tri=>{
  const vertices=tri.map(map);
  const depth=vertices.reduce((s,v)=>s+project(v).depth,0)/3;
  const a=tri[0],b=tri[1],c=tri[2];
  const nx=(b[1]-a[1])*(c[2]-a[2])-(b[2]-a[2])*(c[1]-a[1]);
  const ny=(b[2]-a[2])*(c[0]-a[0])-(b[0]-a[0])*(c[2]-a[2]);
  const nz=(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
  const length=Math.max(1e-12,Math.hypot(nx,ny,nz));
  const brightness=Math.max(0.12,Math.min(1,0.49+0.32*nz/length+0.13*nx/length-0.09*ny/length));
  return {vertices,depth,brightness};
 });
 sorted.sort((a,b)=>a.depth-b.depth);
 for(const face of sorted){
  const light=Math.round(35+face.brightness*32);
  polygon(face.vertices,'hsl(202 17% '+light+'%)','');
 }
 for(const loop of loc.loops){
  const isSelected=loop.id===selected,active=loop.id===hover;
  const ps=loop.points.map(p=>map([p[0],p[1],loc.partTopZ]));
  for(let i=0;i<ps.length;i++){
   const a=ps[i],b=ps[(i+1)%ps.length];
   if(isSelected||active)line(a,b,'#101921',8);
   line(a,b,active?'#ffd46d':isSelected?'#64ffba':'#a8d6e6',
      active?5:isSelected?4:1.4);
  }
 }
 return true;
}
const oldDraw=draw;
draw=function(){
 if(!mesh){oldDraw();return;}
 let loc;
 try{loc=current()}catch(e){
  oldDraw();return;
 }
 if(coreData){
  // core-preview will draw the STL first, then the real Rust cutter path.
  oldDraw();return;
 }
 const w=scene.clientWidth,h=scene.clientHeight;
 ctx.clearRect(0,0,w,h);
 const map=p=>mapPoint(p,loc.stock);
 drawMesh(map);
 drawStock(p=>mapPoint(p,loc.stock),loc.stock);
 const title=document.getElementById('opTitle');
 if(title)title.textContent='STL-Modell · '+loc.loops.length+' wählbare Top-Konturen';
 document.getElementById('progressText').textContent='Importiertes STL · tatsächliche Dreiecksgeometrie';
};
function projectLoop(loop,loc){
 const map=p=>mapPoint(p,loc.stock);
 return loop.points.map(v=>project(map([v[0],v[1],loc.partTopZ])));
}
function distance(point,from,to){
 const dx=to.x-from.x,dy=to.y-from.y,len2=dx*dx+dy*dy;
 const t=len2?Math.max(0,Math.min(1,((point.x-from.x)*dx+(point.y-from.y)*dy)/len2)):0;
 return Math.hypot(point.x-(from.x+t*dx),point.y-(from.y+t*dy));
}
function candidate(x,y){
 const loc=current();if(!loc)return null;
 let closest=null,best=11;
 for(const loop of loc.loops){
  const ps=projectLoop(loop,loc);
  for(let i=0;i<ps.length;i++){
   const d=distance({x,y},ps[i],ps[(i+1)%ps.length]);
   if(d<best){best=d;closest=loop;}
  }
 }
 return closest;
}
let down=null;
scene.addEventListener('pointerdown',e=>{if(picking&&e.button===0)down={x:e.clientX,y:e.clientY};});
scene.addEventListener('pointermove',e=>{
 if(!picking||down)return;
 const rect=scene.getBoundingClientRect();
 const loop=candidate(e.clientX-rect.left,e.clientY-rect.top);
 const next=loop?.id||null;
 if(next!==hover){hover=next;scene.style.cursor=hover?'crosshair':'default';}
});
scene.addEventListener('pointerup',e=>{
 if(!picking||!down)return;
 const drag=Math.hypot(e.clientX-down.x,e.clientY-down.y);
 down=null;
 if(drag>6)return;
 const rect=scene.getBoundingClientRect();
 const loop=candidate(e.clientX-rect.left,e.clientY-rect.top);
 if(!loop){
  hint.textContent='Keine geschlossene Kontur getroffen. Bitte näher auf eine markierte Modellkante klicken.';
  return;
 }
 selected=loop.id;
 const detail={id:loop.id,side:loop.side,points:loop.points.map(p=>p.slice()),size:current().size,meshVersion};
 const callback=onSelect;
 end();
 if(typeof callback==='function')callback(detail);
});
scene.addEventListener('pointercancel',()=>{down=null});
function end(){
 picking=false;onSelect=null;hover=null;down=null;
 overlay.hidden=true;scene.style.cursor='';
}
function begin(callback){
 if(!mesh)throw Error('Zuerst ein STL-Bauteil über Datei → Bauteil laden importieren.');
 if(!current().loops.length)throw Error('Keine geschlossenen Konturen auf der höchsten waagerechten STL-Planfläche gefunden.');
 if(typeof callback!=='function')throw Error('Konturauswahl benötigt einen Empfänger.');
 globalThis.FertigungsstudioToolpath?.clear();
 onSelect=callback;picking=true;hover=null;overlay.hidden=false;
 hint.textContent='Auf eine hervorgehobene geschlossene Kontur der oberen STL-Planfläche klicken · Ziehen dreht das Modell';
 document.getElementById('iso')?.click();
}
function load(bytes){
 const parsed=geo.parse(bytes);
 // STL is imported independently of any stock size. Stock will be fitted after import.
 end();mesh=parsed;selected=null;stockKey='';located=null;meshVersion++;
 globalThis.FertigungsstudioToolpath?.clear();
 if(typeof resize==='function')resize();
 return {triangles:mesh.triangles.length,loops:mesh.loops.length,size:mesh.size};
}
function invalidatePlacement(){
 end();selected=null;stockKey='';located=null;meshVersion++;
 globalThis.FertigungsstudioToolpath?.clear();
 if(typeof resize==='function')resize();
}
function clear(){end();mesh=null;selected=null;stockKey='';located=null;meshVersion++;if(typeof resize==='function')resize();}
function renderStockPreview(canvas,stock,position){
 const ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height;
 ctx.clearRect(0,0,w,h);ctx.fillStyle='#142330';ctx.fillRect(0,0,w,h);
 if(!mesh)return;
 const loc=geo.locate(mesh,stock,position);
 const dims=loc.stock,scale=Math.min(w/(Math.max(dims[0],dims[1])*1.7+1),
  h/(Math.max(...dims)*1.35+1))*1.1;
 const yaw=-Math.PI/4,pitch=Math.acos(1/Math.sqrt(3));
 const point=p=>{
  const a=p[0]-dims[0]/2,b=p[1]-dims[1]/2,c=p[2]-dims[2]/2;
  const xx=a*Math.cos(yaw)-b*Math.sin(yaw);
  const yy=a*Math.sin(yaw)+b*Math.cos(yaw);
  return {x:w/2+xx*scale,y:h/2+(yy*Math.cos(pitch)-c*Math.sin(pitch))*scale,
   depth:yy*Math.sin(pitch)+c*Math.cos(pitch)};
 };
 const faces=loc.triangles.map(tri=>({
  points:tri.map(point),z:tri.reduce((v,p)=>v+point(p).depth,0)/3
 }));
 faces.sort((a,b)=>a.z-b.z);
 for(const face of faces){
  ctx.beginPath();face.points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));
  ctx.closePath();ctx.fillStyle='#688fa4';ctx.fill();
 }
 const corners=[
  [0,0,0],[dims[0],0,0],[dims[0],dims[1],0],[0,dims[1],0],
  [0,0,dims[2]],[dims[0],0,dims[2]],[dims[0],dims[1],dims[2]],[0,dims[1],dims[2]]
 ].map(point);
 ctx.setLineDash([6,4]);ctx.lineWidth=2;ctx.strokeStyle='#ffd477';
 for(const [a,b] of [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]]){
  ctx.beginPath();ctx.moveTo(corners[a].x,corners[a].y);ctx.lineTo(corners[b].x,corners[b].y);ctx.stroke();
 }
 ctx.setLineDash([]);
}
globalThis.FertigungsstudioSTLPicker={load,begin,end,clear,invalidatePlacement,
 hasModel:()=>!!mesh,modelVersion:()=>meshVersion,
 fitStock:()=>mesh?geo.fitStock(mesh):null,modelSize:()=>mesh?.size.slice()||null,
 drawMesh,drawStock,renderStockPreview,selected:()=>selected,loops:()=>mesh?.loops||[]};
})();
