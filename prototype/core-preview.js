// Original bridge: imported Rust data, no browser-side CAM calculation.
let coreData=null;
const originalDraw=draw;
const coreBadge=document.createElement('span');
coreBadge.style.cssText='margin-left:12px;color:var(--accent)';
document.querySelector('.workspace-tabs').appendChild(coreBadge);
const sidebar=document.querySelector('.panel');
const originalStockText=sidebar.querySelector('p').textContent;
const summary=document.createElement('p');summary.hidden=true;sidebar.appendChild(summary);
const importButton=document.createElement('button');importButton.textContent='Rust-Bahn laden';
const demoButton=document.createElement('button');demoButton.textContent='Rust-Demo';
const returnButton=document.createElement('button');returnButton.textContent='Zurück zum Bedienentwurf';returnButton.hidden=true;
document.querySelector('.viewbuttons').prepend(importButton,demoButton,returnButton);
const picker=document.createElement('input');picker.type='file';picker.accept='.json';picker.hidden=true;document.body.appendChild(picker);
importButton.onclick=()=>picker.click();
function loadCore(d){
  coreData=CamPathData.validate(d);playing=false;progress=0;$('play').textContent='▶ Abspielen';
  document.querySelector('.layout').classList.add('inspector-hidden');
  const operationNames={facing:'Planfräsen',contour:'Außenkontur',pocket:'Rechtecktasche',drilling:'Bohren'};
  const operationName=coreData.operation==='contour'&&coreData.contour_side==='inside'?'Innenkontur':operationNames[coreData.operation||'facing'];
  $('opTitle').textContent=operationName+' · Rust-Kern';
  $('connectionLabel').textContent='Berechnete Bahn · rechteckiger Rohblock';
  coreBadge.textContent=coreData.moves.length+' Bewegungen';
  document.querySelector('.legend').firstElementChild.lastChild.textContent='Berechnete Bahn';
  document.querySelector('.panel h2').textContent='Rust-Rohblock';
  sidebar.querySelector('p').textContent=dims(coreData)+' mm · Rechteckrohteil';
  sidebar.querySelectorAll('.tree,.tools,.setup').forEach(e=>e.hidden=true);
  summary.hidden=false;summary.textContent=operationName+' · '+(coreData.tool_number?'T'+coreData.tool_number+' · ':'')+'Werkzeug Ø '+coreData.tool_diameter+' mm · Endhöhe '+coreData.bottom_z+' mm'+(coreData.cutting_feed?' · Vorschub '+coreData.cutting_feed+' mm/min':'')+' · Nur numerisch berechnete Bahnen; keine Spannmittel- oder Kollisionsprüfung.';
  $('status').textContent='Rust-Bahndaten · keine Kollisions- oder Maschinenprüfung';
  globalThis.FertigungsstudioPathView?.onPathLoaded(coreData);
  $('editOperation').disabled=true;returnButton.hidden=false;resize();
}
demoButton.onclick=()=>{try{loadCore(JSON.parse(document.getElementById('rust-demo-data').textContent));}catch(e){toast(e.message);}};
picker.onchange=async()=>{const file=picker.files[0];if(!file)return;try{if(file.size>12000000)throw Error('Datei zu groß (maximal 12 MB).');const d=JSON.parse(await file.text());loadCore(d);}catch(e){toast('Bahn nicht geladen: '+e.message);}picker.value='';};
function dims(d){return d.stock.max.map((v,i)=>v-d.stock.min[i]).join(' × ');}
globalThis.FertigungsstudioToolpath={get:()=>coreData,clear:()=>{if(coreData)returnButton.click();}};
returnButton.onclick=()=>{coreData=null;globalThis.FertigungsstudioPathView?.onPathCleared();coreBadge.textContent='';returnButton.hidden=true;$('editOperation').disabled=false;selectOperation(selected);document.querySelector('.panel h2').textContent='Demoteil · Trägerplatte';sidebar.querySelector('p').textContent=originalStockText;sidebar.querySelectorAll('.tree,.tools,.setup').forEach(e=>e.hidden=false);summary.hidden=true;document.querySelector('.legend').firstElementChild.lastChild.textContent='Beispielbahn';$('connectionLabel').textContent='Bedienentwurf · illustrative Bahnen';resize();};
// Operation selection returns explicitly to the old illustrative part.
document.querySelectorAll('[data-operation],.op').forEach(b=>b.addEventListener('click',()=>{if(coreData)returnButton.click();}));
const originalMakePath=makePath;makePath=function(){if(!coreData)originalMakePath();};
draw=function(){
  if(!coreData){const wcsReadout=document.getElementById('studioWcsReadout');if(wcsReadout)wcsReadout.textContent='WCS: Noch keine berechnete Bahn';originalDraw();const studioProgress=document.getElementById('studioProgress');if(studioProgress)studioProgress.value=Math.round(progress*1000);return;}
  const d=coreData,w=canvas.clientWidth,h=canvas.clientHeight;ctx.clearRect(0,0,w,h);
  const center=d.stock.min.map((v,i)=>(v+d.stock.max[i])/2);
  const scale=100/Math.max(...d.stock.max.map((v,i)=>v-d.stock.min[i]),d.clearance_z-d.stock.min[2],1);
  const map=p=>point((p[0]-center[0])*scale,(p[1]-center[1])*scale,(p[2]-center[2])*scale);
  const lo=map(d.stock.min),hi=map(d.stock.max);
  if(!globalThis.FertigungsstudioSTLPicker?.hasModel()||
     !globalThis.FertigungsstudioSTLPicker.drawMesh(map))
    box(lo.x,lo.y,lo.z,hi.x,hi.y,hi.z,['#b2c5cf','#6d8797','#839eae']);
  const moves=d.moves,shown=Math.min(moves.length,5000),end=progress*moves.length;
  const studio=globalThis.FertigungsstudioStudio;if($('paths').checked&&(!studio||studio.activeVisible())){for(let i=0;i<shown;i++){const m=moves[i],previous=i?moves[i-1].to:d.start,category=m.motion==='rapid'?'rapid':m.to[2]!==previous[2]?'lead':'cut';if(studio&&!studio.allowMove(category))continue;const color=category==='rapid'?'#ff8383':category==='lead'?'#ffd374':i<end?'#a6ffe0':'#40ffc0';line(map(previous),map(m.to),color,category==='cut'?3.2:2.3,category==='rapid'?[6,6]:[]);}}
  const i=Math.min(moves.length-1,Math.floor(end));const a=i?moves[i-1].to:d.start,b=moves[i].to,t=Math.min(1,end-i);const tip=map(a.map((v,j)=>v+(b[j]-v)*t));

  const wcsReadout=document.getElementById('studioWcsReadout');
  if(wcsReadout){
   const w=d.work_coordinates;
   if(w&&Array.isArray(w.moves)&&w.moves.length===moves.length){
    const v0=i?w.moves[i-1].to:w.start,v1=w.moves[i].to;
    const xyz=v0.map((v,j)=>v+(v1[j]-v)*t);
    wcsReadout.textContent=w.system+' · X '+xyz[0].toFixed(3)+'  Y '+xyz[1].toFixed(3)+'  Z '+xyz[2].toFixed(3)+' mm';
   }else wcsReadout.textContent='WCS: Nur rohe Bahnkoordinaten';
  }

  const toolMode=studio?.toolVisibility()||'full';if(toolMode!=='off'){const tool=studio?.selectedTool()||null;const total=Math.min(140,Math.max(d.tool_diameter,Number(tool?.totalLength)||35)*scale),cut=Math.min(total,Math.max(d.tool_diameter,Number(tool?.cutLength)||d.tool_diameter)*scale);const diameter=Math.max(2,d.tool_diameter*scale);line(tip,point(tip.x,tip.y,tip.z+cut),'#68dcb6',diameter);if(toolMode==='full'){line(point(tip.x,tip.y,tip.z+cut),point(tip.x,tip.y,tip.z+total),'#c4d5e1',diameter);if(!studio||studio.showHolder()){const holderWidth=diameter*1.7;line(point(tip.x,tip.y,tip.z+total),point(tip.x,tip.y,tip.z+total+Math.max(10,12*scale)),'#6f8b9a',holderWidth);}}}
  $('progressText').textContent=Math.round(progress*100)+' % · Rust-Bahn';
  const studioProgress=document.getElementById('studioProgress');if(studioProgress)studioProgress.value=Math.round(progress*1000);
  coreBadge.textContent=moves.length>5000?moves.length+' Bewegungen · Anzeige: erste 5000':moves.length+' Bewegungen';
};
