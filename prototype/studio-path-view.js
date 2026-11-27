// Visible exact XY inspection of the validated Rust path, without browser-side CAM.
(()=>{
'use strict';
const model=globalThis.FertigungsstudioPathOverview;
const studio=globalThis.FertigungsstudioStudio;
const originalView=document.querySelector('#studioScene>.view');
const target=document.getElementById('studioScene');
if(!model||!studio||!originalView||!target)return;
const $=id=>document.getElementById(id);
const bar=document.createElement('div');
bar.id='studioViewSwitch';
bar.className='studio-view-switch';
bar.hidden=true;
bar.innerHTML='<strong>RUST-WERKZEUGBAHN</strong><button type="button" id="studioView2D">Bahnen · Draufsicht</button><button type="button" id="studioView3D">3D-Werkstück</button><label>Tiefenlage <select id="studioDepthFilter" aria-label="Tiefenlage der Werkzeugbahn"><option value="all">Alle Lagen</option></select></label><span id="studioPathSummary"></span>';
target.insertBefore(bar,originalView);
const panel=document.createElement('section');
panel.id='studioPathPanel';
panel.className='studio-path-panel';
panel.setAttribute('aria-label','Berechneter Werkzeugbahnverlauf in der Rohteil-Draufsicht');
panel.hidden=true;
panel.innerHTML='<canvas id="studioPathCanvas" aria-label="Exakte XY-Bahnen aus dem Rust-Werkzeugweg"></canvas><div class="studio-path-axis-note">Rohteil-Koordinaten XY in mm · kein G-Code</div><div id="studioPathCursor" class="studio-path-cursor">Schnitt: grün · Eilgang: rot gestrichelt · Eintauchen: gelb</div>';
target.insertBefore(panel,$('studioSim'));
const canvas=$('studioPathCanvas'),ctx=canvas.getContext('2d');
let data=null,mode='2d';
function label(value){return Number(value).toLocaleString('de-DE',{maximumFractionDigits:3})}
function redraw(){
 if(panel.hidden||!data)return;
 const w=panel.clientWidth,h=panel.clientHeight;
 if(w<80||h<80)return;
 const ratio=Math.min(2,Math.max(1,window.devicePixelRatio||1));
 canvas.width=Math.round(w*ratio);canvas.height=Math.round(h*ratio);
 ctx.setTransform(ratio,0,0,ratio,0,0);
 ctx.clearRect(0,0,w,h);
 const depth=$('studioDepthFilter').value==='all'?null:Number($('studioDepthFilter').value);
 let chart,project;
 try{chart=model.plot(data,depth);project=model.fit(chart.bounds,w,h,42)}
 catch(e){$('studioPathSummary').textContent=e.message;return;}
 // The shaded rectangle is the actual rectangular stock bounding box.
 const a=project(chart.stock.min),b=project(chart.stock.max);
 const x=Math.min(a.x,b.x),y=Math.min(a.y,b.y),rw=Math.abs(a.x-b.x),rh=Math.abs(a.y-b.y);
 ctx.fillStyle='rgba(104,144,158,.24)';ctx.fillRect(x,y,rw,rh);
 ctx.strokeStyle='#bdd6df';ctx.lineWidth=1.8;ctx.strokeRect(x,y,rw,rh);
 ctx.font='12px Segoe UI,sans-serif';ctx.fillStyle='#c7dde3';
 ctx.textAlign='center';ctx.fillText('X '+label(chart.stock.max[0]-chart.stock.min[0])+' mm',x+rw/2,Math.min(h-12,y+rh+25));
 ctx.save();ctx.translate(Math.max(16,x-24),y+rh/2);ctx.rotate(-Math.PI/2);
 ctx.fillText('Y '+label(chart.stock.max[1]-chart.stock.min[1])+' mm',0,0);ctx.restore();
 // Draw rapid first, then plunges, then the cutting segments on top.
 // These segments are the numeric Rust coordinates, not illustrative artwork.
 const layers=[
  ['rapid','#f59090',2.5,[9,7]],
  ['lead','#ffd476',4.5,[]],
  ['cut','#63ffb6',4.5,[]]
 ];
 for(const [kind,color,width,dash] of layers){
  ctx.beginPath();let count=0;
  for(const segment of chart.segments){
   if(segment.kind!==kind)continue;
   const p=project(segment.from),q=project(segment.to);
   ctx.moveTo(p.x,p.y);ctx.lineTo(q.x,q.y);count++;
  }
  if(count){
   ctx.setLineDash(dash);ctx.lineCap='round';ctx.lineJoin='round';
   ctx.strokeStyle='rgba(3,11,19,.88)';ctx.lineWidth=width+3.5;ctx.stroke();
   ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();ctx.setLineDash([]);
  }
 }
 const start=project(data.start);
 ctx.beginPath();ctx.arc(start.x,start.y,6,0,Math.PI*2);ctx.fillStyle='#f6f8fb';ctx.fill();
 ctx.strokeStyle='#162c35';ctx.lineWidth=2;ctx.stroke();
 ctx.font='bold 12px Segoe UI,sans-serif';ctx.textAlign='left';ctx.fillStyle='#fafcff';
 ctx.fillText('Start',Math.min(w-53,start.x+10),Math.max(12,start.y-10));
 $('studioPathSummary').textContent='Schnitt '+chart.counts.cut+' · Eintauchen '+chart.counts.lead+
  ' · Eilgang '+chart.counts.rapid+' · gesamt '+data.moves.length+' Bewegungen';
}
function switchMode(next){
 if(!data)return;
 mode=next;
 panel.hidden=next!=='2d';
 originalView.hidden=next!=='3d';
 $('studioView2D').setAttribute('aria-pressed',String(next==='2d'));
 $('studioView3D').setAttribute('aria-pressed',String(next==='3d'));
 $('studioDepthFilter').disabled=next!=='2d';
 if(next==='2d')requestAnimationFrame(redraw);
 else requestAnimationFrame(()=>{if(typeof resize==='function')resize();});
}
function onPathLoaded(path){
 data=path;
 $('studioViewSwitch').hidden=false;
 const levels=model.depths(path);
 const options=$('studioDepthFilter');options.replaceChildren(new Option('Alle Lagen','all'));
 levels.forEach((z,i)=>options.add(new Option('Lage '+(i+1)+' · Z '+label(z)+' mm',String(z))));
 options.value='all';
 $('studioPathCursor').textContent='Schnitt: grün · Eilgang: rot gestrichelt · Eintauchen: gelb';
 switchMode('2d'); // Show the real path immediately after a successful calculation.
}
function onPathCleared(){
 data=null;bar.hidden=true;panel.hidden=true;originalView.hidden=false;mode='3d';
 $('studioPathSummary').textContent='';
 if(typeof resize==='function')requestAnimationFrame(resize);
}
$('studioView2D').onclick=()=>switchMode('2d');
$('studioView3D').onclick=()=>switchMode('3d');
$('studioDepthFilter').onchange=redraw;
new ResizeObserver(()=>{if(mode==='2d'&&data)redraw()}).observe(panel);
canvas.addEventListener('pointermove',e=>{
 if(!data||panel.hidden)return;
 const rect=canvas.getBoundingClientRect();
 const w=rect.width,h=rect.height;
 if(w<80||h<80)return;
 try{
  const chart=model.plot(data,null),b=chart.bounds,spanX=b.maxX-b.minX,spanY=b.maxY-b.minY;
  const scale=Math.min((w-84)/spanX,(h-84)/spanY);
  const x0=(w-spanX*scale)/2,y0=(h-spanY*scale)/2;
  const px=e.clientX-rect.left,py=e.clientY-rect.top;
  const x=b.minX+(px-x0)/scale,y=b.minY+(h-y0-py)/scale;
  $('studioPathCursor').textContent='Mausposition Rohteil: X '+label(x)+' mm · Y '+label(y)+' mm';
 }catch{}
});
canvas.addEventListener('pointerleave',()=>{$('studioPathCursor').textContent='Schnitt: grün · Eilgang: rot gestrichelt · Eintauchen: gelb'});
globalThis.FertigungsstudioPathView={onPathLoaded,onPathCleared,open:()=>switchMode('2d'),view3D:()=>switchMode('3d')};
})();
