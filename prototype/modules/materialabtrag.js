/* Fertigungsstudio CAM: eigenständige 2,5D-Restmaterialsimulation.
 * Berechnet eine gerasterte Höhenkarte aus linearen Schnittbewegungen und
 * einem idealisierten flachen zylindrischen Fräser. Keine Kollisionsprüfung,
 * keine NC-Freigabe, keine echte 3D-Volumensimulation. Apache-2.0.
 */
(function(root){
'use strict';
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const point=p=>Array.isArray(p)&&p.length===3&&p.every(finite);
const fail=m=>{throw Error(m)};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function create(path,options={}){
 if(!path||!path.stock||!point(path.stock.min)||!point(path.stock.max)||!point(path.start)||!Array.isArray(path.moves))fail('Ungültige Werkzeugbahndaten.');
 if(!['facing','contour','pocket'].includes(path.operation||'facing'))fail('Materialdarstellung nur für Fräsbahnen mit flachem Fräser verfügbar.');
 if(!finite(path.tool_diameter)||path.tool_diameter<=0)fail('Werkzeugdurchmesser fehlt.');
 const min=path.stock.min,max=path.stock.max;
 const wx=max[0]-min[0],wy=max[1]-min[1],height=max[2]-min[2];
 if(wx<=0||wy<=0||height<=0||[wx,wy,height].some(x=>x>1e6))fail('Ungültige Rohteilmaße.');
 if(path.moves.length>100000)fail('Zu viele Werkzeugbewegungen für die Vorschau.');
 const resolution=Number(options.resolution??110);
 if(!Number.isInteger(resolution)||resolution<30||resolution>180)fail('Ungültige Rasterauflösung.');
 const pitch=Math.max(wx,wy)/resolution;
 const nx=Math.max(1,Math.ceil(wx/pitch)),ny=Math.max(1,Math.ceil(wy/pitch));
 const dx=wx/nx,dy=wy/ny;
 const levels=new Float32Array(nx*ny);
 const top=max[2],bottom=min[2],radius=path.tool_diameter/2;
 const cellArea=dx*dy;
 let cursor=0;
 let sampleCount=0;
 const maximumSamples=3000000;
 levels.fill(top);
 for(const m of path.moves){if(!m||!point(m.to)||!['rapid','feed'].includes(m.motion))fail('Ungültige Werkzeugbewegung.');}
 function dab(x,y,z){
  if(z>=top||x+radius<min[0]||x-radius>max[0]||y+radius<min[1]||y-radius>max[1])return;
  const value=clamp(z,bottom,top),r2=radius*radius;
  const ix0=clamp(Math.ceil((x-radius-min[0])/dx-.5),0,nx-1),ix1=clamp(Math.floor((x+radius-min[0])/dx-.5),0,nx-1);
  const iy0=clamp(Math.ceil((y-radius-min[1])/dy-.5),0,ny-1),iy1=clamp(Math.floor((y+radius-min[1])/dy-.5),0,ny-1);
  for(let j=iy0;j<=iy1;j++){
   const yy=min[1]+(j+.5)*dy,dy2=(yy-y)*(yy-y);
   for(let i=ix0;i<=ix1;i++){
    const xx=min[0]+(i+.5)*dx;
    if((xx-x)*(xx-x)+dy2<=r2+1e-9){const k=j*nx+i;if(value<levels[k])levels[k]=value;}
   }
  }
 }
 function cutSegment(a,b){
  if(Math.min(a[2],b[2])>=top)return;
  const length=Math.hypot(b[0]-a[0],b[1]-a[1]);
  const n=Math.max(1,Math.ceil(length/(Math.min(dx,dy)*.45)));
  // Extremely large imported moves are rejected instead of freezing the browser.
  if(sampleCount+n+1>maximumSamples)fail('Zu viele Rasterberechnungen. Auflösung reduzieren oder Bahn vereinfachen.');
  sampleCount+=n+1;
  for(let i=0;i<=n;i++){
   const t=i/n;
   dab(a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1]),a[2]+t*(b[2]-a[2]));
  }
 }
 function interpolate(a,b,t){return a.map((v,i)=>v+(b[i]-v)*t)}
 function restart(){levels.fill(top);cursor=0;sampleCount=0;}
 function seek(position){
  if(!finite(position)||position<0||position>path.moves.length)fail('Ungültige Simulationsposition.');
  if(position+1e-9<cursor)restart();
  // Cursor may be fractional, so subsequent updates process only the unfinished
  // part of the same cutting motion, not the whole segment again.
  while(cursor+1e-9<position){
   const i=Math.floor(cursor+1e-9);
   if(i>=path.moves.length)break;
   const end=Math.min(i+1,position);
   const start=i?path.moves[i-1].to:path.start;
   const stop=path.moves[i].to;
   if(path.moves[i].motion==='feed'){
    cutSegment(interpolate(start,stop,clamp(cursor-i,0,1)),interpolate(start,stop,end-i));
   }
   cursor=end;
  }
  cursor=position;
  let removed=0,minHeight=top,modified=0;
  for(const z of levels){const depth=top-z;if(depth>1e-6){modified++;removed+=depth*cellArea;minHeight=Math.min(z,minHeight);}}
  const stockVolume=wx*wy*height;
  return {
   position:cursor,progress:cursor/path.moves.length,
   removedMm3:removed,remainingMm3:stockVolume-removed,
   removedPercent:100*removed/stockVolume,modifiedCells:modified,
   minimumZ:minHeight,cellSizeX:dx,cellSizeY:dy,nx,ny,
  };
 }
 const api={path,levels,nx,ny,dx,dy,top,bottom,min,max,radius,seek,restart,position:()=>cursor,metrics:()=>seek(cursor)};
 return api;
}
const api={create};
root.FertigungsstudioMaterialModel=api;
if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof globalThis==='object'?globalThis:this);

// The browser view is deliberately separate from the controller-neutral model.
(function(root){
'use strict';
if(typeof document==='undefined')return;
const model=root.FertigungsstudioMaterialModel;
const $=id=>document.getElementById(id);
const bar=$('studioViewSwitch'),scene=$('studioScene'),oldView=document.querySelector('#studioScene>.view');
const oldPanel=$('studioPathPanel'),pathView=root.FertigungsstudioPathView;
if(!bar||!scene||!oldView||!oldPanel||!pathView)return;
const css=document.createElement('style');css.textContent=`
#studioMaterialPanel[hidden]{display:none!important}
#studioMaterialPanel{flex:1;min-height:290px;display:flex;flex-direction:column;background:#0f1e29;color:#d8e9f1;overflow:hidden}
.studio-material-options{padding:9px 13px;display:flex;gap:12px;align-items:center;flex-wrap:wrap;border-bottom:1px solid #47606b;font:12px Segoe UI,sans-serif}
.studio-material-options select{background:#1a3444;color:#edf5fa;padding:5px 8px;border:1px solid #65808b;border-radius:5px}
.studio-material-stage{position:relative;flex:1;min-height:220px;overflow:hidden;background:radial-gradient(ellipse at center,#253c4a,#0a1923)}
#studioMaterialCanvas{display:block;width:100%;height:100%}
.studio-material-caption{position:absolute;left:15px;top:13px;background:#0b1c27d9;border-radius:5px;padding:7px 10px;font:12px Segoe UI,sans-serif;pointer-events:none}
#studioMaterialStats{padding:9px 13px;font:12px Segoe UI,sans-serif;border-top:1px solid #47606b;min-height:34px}
#studioMaterialError{color:#ffb5ad}
.studio-material-legend{display:flex;gap:10px;align-items:center;font-size:11px;color:#bcd2dc}
.studio-material-swatches{display:inline-block;width:78px;height:9px;background:linear-gradient(90deg,#43b0c5,#d9b56b)}
`;document.head.appendChild(css);
const btn=document.createElement('button');btn.id='studioViewMaterial';btn.type='button';btn.textContent='Materialabtrag';bar.insertBefore(btn,$('studioDepthFilter')?.closest('label')||$('studioPathSummary'));
const panel=document.createElement('section');panel.id='studioMaterialPanel';panel.hidden=true;panel.setAttribute('aria-label','Simulierter Materialabtrag mit Restmaterialkarte');
panel.innerHTML=`<div class="studio-material-options">
<label>Ansicht <select id="studioMaterialCamera"><option value="iso">Isometrisch</option><option value="top">Draufsicht</option></select></label>
<label>Raster <select id="studioMaterialResolution"><option value="60">Schnell</option><option value="110" selected>Normal</option><option value="160">Fein</option></select></label>
<span class="studio-material-legend"><span class="studio-material-swatches"></span> Tief = bläulich · Rohhöhe = goldfarben</span>
</div><div class="studio-material-stage"><canvas id="studioMaterialCanvas" aria-label="Berechnetes verbleibendes Material"></canvas><div class="studio-material-caption">2,5D · gerasterter Flachfräser · keine Kollisionsprüfung</div></div><div id="studioMaterialStats" role="status">Materialabtrag noch nicht berechnet.</div>`;
scene.insertBefore(panel,$('studioSim'));
const canvas=$('studioMaterialCanvas'),ctx=canvas.getContext('2d');
let path=null,sim=null,mode='3d',camera='iso',lastProgress=-1,lastTick=0,stats=null;
const round=n=>Number(n).toLocaleString('de-DE',{maximumFractionDigits:2});
function setMode(next){
 if(!path&&next==='material')return;
 mode=next;
 panel.hidden=next!=='material';
 if(next==='material'){
  // Leave the existing path view in normal 3D state, then hide its canvas.
  pathView.view3D();oldView.hidden=true;oldPanel.hidden=true;
  $('studioView2D').setAttribute('aria-pressed','false');$('studioView3D').setAttribute('aria-pressed','false');
  render();
 }
 btn.setAttribute('aria-pressed',String(next==='material'));
}
function clear(){path=null;sim=null;stats=null;lastProgress=-1;setMode('3d');panel.hidden=true;btn.hidden=true;}
function setPath(d){
 path=d;btn.hidden=false;lastProgress=-1;sim=null;stats=null;setMode('3d');
 try{resetModel();$('studioMaterialStats').textContent='Materialdarstellung bereit. Auf „Materialabtrag“ klicken.';}
 catch(e){$('studioMaterialStats').textContent=e.message;btn.disabled=true;return;}
 btn.disabled=false;
}
function resetModel(){
 if(!path)return;
 sim=model.create(path,{resolution:Number($('studioMaterialResolution').value)});
 lastProgress=-1;
}
const color=(z,sim)=>{
 const f=Math.max(0,Math.min(1,(sim.top-z)/Math.max(1e-9,sim.top-sim.bottom)));
 return [Math.round(217-144*f),Math.round(181-36*f),Math.round(105+85*f)];
};
function paintPoly(points,fill,stroke){ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));ctx.closePath();ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=.5;ctx.stroke();}}
function showTop(w,h){
 const pad=45,scale=Math.min((w-2*pad)/(sim.max[0]-sim.min[0]),(h-2*pad)/(sim.max[1]-sim.min[1]));
 const ww=(sim.max[0]-sim.min[0])*scale,hh=(sim.max[1]-sim.min[1])*scale;
 const xx=(w-ww)/2,yy=(h-hh)/2;
 const temp=document.createElement('canvas');temp.width=sim.nx;temp.height=sim.ny;
 const tc=temp.getContext('2d'),img=tc.createImageData(sim.nx,sim.ny);
 for(let j=0;j<sim.ny;j++)for(let i=0;i<sim.nx;i++){
  const z=sim.levels[j*sim.nx+i],c=color(z,sim),k=((sim.ny-1-j)*sim.nx+i)*4;
  img.data[k]=c[0];img.data[k+1]=c[1];img.data[k+2]=c[2];img.data[k+3]=255;
 }
 tc.putImageData(img,0,0);ctx.imageSmoothingEnabled=false;ctx.drawImage(temp,xx,yy,ww,hh);
 ctx.strokeStyle='#d6e7ee';ctx.lineWidth=1.4;ctx.strokeRect(xx,yy,ww,hh);
 ctx.fillStyle='#d8e9f1';ctx.font='12px Segoe UI';ctx.fillText('X '+round(sim.max[0]-sim.min[0])+' mm',xx,Math.min(h-10,yy+hh+22));ctx.save();ctx.translate(Math.max(18,xx-15),yy+hh/2);ctx.rotate(-Math.PI/2);ctx.fillText('Y '+round(sim.max[1]-sim.min[1])+' mm',-hh/2+10,0);ctx.restore();
}
function showIso(w,h){
 const sx=Math.SQRT1_2,sy=.408248,sz=.85;
 const raw=(x,y,z)=>[(x-y)*sx,(x+y)*sy-(z-sim.bottom)*sz];
 const corners=[];
 for(const x of [sim.min[0],sim.max[0]])for(const y of [sim.min[1],sim.max[1]])for(const z of [sim.bottom,sim.top])corners.push(raw(x,y,z));
 const left=Math.min(...corners.map(p=>p[0])),right=Math.max(...corners.map(p=>p[0]));
 const up=Math.min(...corners.map(p=>p[1])),down=Math.max(...corners.map(p=>p[1]));
 const scale=Math.min((w-65)/Math.max(1e-6,right-left),(h-75)/Math.max(1e-6,down-up));
 const ox=(w-(right-left)*scale)/2-left*scale,oy=(h-(down-up)*scale)/2-up*scale;
 const p=(x,y,z)=>{const r=raw(x,y,z);return [ox+r[0]*scale,oy+r[1]*scale]};
 // Painter's order: distant grid columns first, near columns last.
 const step=Math.max(1,Math.ceil(Math.max(sim.nx,sim.ny)/105));
 for(let sum=0;sum<sim.nx+sim.ny-1;sum++){
  for(let i=0;i<sim.nx;i++){
   const j=sum-i;if(j<0||j>=sim.ny||i%step||j%step)continue;
   const i2=Math.min(sim.nx,i+step),j2=Math.min(sim.ny,j+step);
   const z=sim.levels[j*sim.nx+i];
   const x0=sim.min[0]+i*sim.dx,x1=sim.min[0]+i2*sim.dx;
   const y0=sim.min[1]+j*sim.dy,y1=sim.min[1]+j2*sim.dy;
   const c=color(z,sim);
   const shade=`rgb(${c.join(',')})`;
   // Show exposed vertical sides of an adjacent higher cell as a step wall.
   const neighX=i2<sim.nx?sim.levels[j*sim.nx+i2]:sim.bottom;
   const neighY=j2<sim.ny?sim.levels[j2*sim.nx+i]:sim.bottom;
   if(z>neighX+1e-6)paintPoly([p(x1,y0,z),p(x1,y1,z),p(x1,y1,neighX),p(x1,y0,neighX)],'#577c85');
   if(z>neighY+1e-6)paintPoly([p(x0,y1,z),p(x1,y1,z),p(x1,y1,neighY),p(x0,y1,neighY)],'#365d6c');
   paintPoly([p(x0,y0,z),p(x1,y0,z),p(x1,y1,z),p(x0,y1,z)],shade);
  }
 }
}
function progressPosition(){return path?Math.max(0,Math.min(path.moves.length,Number($('progress').value)/1000*path.moves.length)):0;}
function render(){
 if(panel.hidden||!path||!sim)return;
 const stage=canvas.parentElement,w=stage.clientWidth,h=stage.clientHeight;
 if(w<75||h<75)return;
 const position=progressPosition();
 try{
  stats=sim.seek(position);lastProgress=position;
  const ratio=Math.min(2,Math.max(1,root.devicePixelRatio||1));
  canvas.width=Math.round(w*ratio);canvas.height=Math.round(h*ratio);ctx.setTransform(ratio,0,0,ratio,0,0);ctx.clearRect(0,0,w,h);
  camera==='top'?showTop(w,h):showIso(w,h);
  $('studioMaterialStats').textContent=`Bearbeitung ${round(stats.progress*100)} % · Abtrag ca. ${round(stats.removedMm3)} mm³ (${round(stats.removedPercent)} %) · Restmaterial ca. ${round(stats.remainingMm3)} mm³ · Raster ${round(stats.cellSizeX)} × ${round(stats.cellSizeY)} mm`;
 }catch(e){$('studioMaterialStats').textContent='Simulation angehalten: '+e.message;btn.disabled=true;}
}
const load=pathView.onPathLoaded,unload=pathView.onPathCleared;
pathView.onPathLoaded=function(d){load(d);setPath(d);};
pathView.onPathCleared=function(){clear();unload();};
btn.hidden=true;btn.onclick=()=>setMode('material');
for(const id of ['studioView2D','studioView3D'])$(id)?.addEventListener('click',()=>{mode='other';panel.hidden=true;btn.setAttribute('aria-pressed','false');});
$('studioMaterialCamera').addEventListener('change',e=>{camera=e.target.value;render();});
$('studioMaterialResolution').addEventListener('change',()=>{try{resetModel();btn.disabled=false;render();}catch(e){$('studioMaterialStats').textContent=e.message;}});
$('studioProgress')?.addEventListener('input',()=>{if(mode==='material')render();});
$('progress')?.addEventListener('input',()=>{if(mode==='material')render();});
new ResizeObserver(()=>{if(mode==='material')render();}).observe(panel);
function frame(time){if(mode==='material'&&!panel.hidden&&time-lastTick>80){lastTick=time;const position=progressPosition();if(Math.abs(position-lastProgress)>1e-5)render();}root.requestAnimationFrame(frame);}
root.requestAnimationFrame(frame);
root.FertigungsstudioMaterialView={open:()=>setMode('material'),get:()=>sim,stats:()=>stats};
})(typeof globalThis==='object'?globalThis:this);
