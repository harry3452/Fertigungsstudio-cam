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
 const key=[stock.x,stock.y,stock.z].join('/');
 if(key!==stockKey){
  located=geo.locate(mesh,stock);
  stockKey=key;
 }
 return located;
}
function mapPoint(p,stock){
 const scale=100/Math.max(stock[0],stock[1],stock[2],1);
 return point((p[0]-stock[0]/2)*scale,(p[1]-stock[1]/2)*scale,(p[2]-stock[2]/2)*scale);
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
  const ps=loop.points.map(p=>map([p[0],p[1],loc.stock[2]]));
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
 const title=document.getElementById('opTitle');
 if(title)title.textContent='STL-Modell · '+loc.loops.length+' wählbare Top-Konturen';
 document.getElementById('progressText').textContent='Importiertes STL · tatsächliche Dreiecksgeometrie';
};
function projectLoop(loop,loc){
 const map=p=>mapPoint(p,loc.stock);
 return loop.points.map(v=>project(map([v[0],v[1],loc.stock[2]])));
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
 // A real part may be smaller than stock; no automatic stock modification.
 geo.locate(parsed,studio.project().stock);
 end();mesh=parsed;selected=null;stockKey='';located=null;meshVersion++;
 globalThis.FertigungsstudioToolpath?.clear();
 if(typeof resize==='function')resize();
 return {triangles:mesh.triangles.length,loops:mesh.loops.length,size:mesh.size};
}
function clear(){end();mesh=null;selected=null;stockKey='';located=null;meshVersion++;if(typeof resize==='function')resize();}
globalThis.FertigungsstudioSTLPicker={load,begin,end,clear,hasModel:()=>!!mesh,modelVersion:()=>meshVersion,
 drawMesh,selected:()=>selected,loops:()=>mesh?.loops||[]};
})();
