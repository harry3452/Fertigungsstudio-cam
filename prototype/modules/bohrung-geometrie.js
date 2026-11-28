/* Fertigungsstudio CAM – Kreis-/Bohrungsauswahl und neutrale Bohrbahnen.
 * Geometrische Entwicklungsvorschau. Kein NC-Code, keine Kollisionsprüfung.
 * Apache-2.0. */
(function(root){
'use strict';
const EPS=1e-6,MAX_HOLES=200,MAX_MOVES=100000;
const finite=n=>typeof n==='number'&&Number.isFinite(n);
function fail(msg){throw Error('Bohren: '+msg);}
function sampleCircle(points){
 if(!Array.isArray(points)||points.length<8||points.length>2048||points.some(p=>!Array.isArray(p)||p.length!==2||!p.every(finite)))fail('Keine ausreichend genau aufgelöste Kreis-/Bohrkontur.');
 const n=points.length,mx=points.reduce((a,p)=>a+p[0],0)/n,my=points.reduce((a,p)=>a+p[1],0)/n;
 let a=0,b=0,c=0,d=0,e=0;
 for(const p of points){const u=p[0]-mx,v=p[1]-my,q=u*u+v*v;a+=u*u;b+=u*v;c+=v*v;d+=u*q/2;e+=v*q/2;}
 const determinant=a*c-b*b;
 if(determinant<1e-16||!finite(determinant))fail('Kreiskontur geometrisch nicht eindeutig.');
 const cx=mx+(d*c-e*b)/determinant,cy=my+(e*a-d*b)/determinant;
 const rs=points.map(p=>Math.hypot(p[0]-cx,p[1]-cy)),radius=rs.reduce((s,r)=>s+r,0)/n;
 if(!finite(radius)||radius<0.02||radius>50000)fail('Ungültiger Bohrungsradius.');
 const maxError=Math.max(...rs.map(r=>Math.abs(r-radius)));
 // A polygonal square with four corner points must never be inferred as a circle;
 // points need enough angular coverage and meaningful radial consistency.
 const angles=points.map(p=>Math.atan2(p[1]-cy,p[0]-cx)).sort((x,y)=>x-y);
 let maxGap=angles[0]+2*Math.PI-angles.at(-1);
 for(let i=1;i<angles.length;i++)maxGap=Math.max(maxGap,angles[i]-angles[i-1]);
 if(maxGap>0.9||maxError>Math.max(0.035,radius*0.007))fail('Ausgewählte Kontur ist keine ausreichend kreisförmige Bohrung.');
 return {center:[cx,cy],radius,approximate:true,maxDeviation:maxError};
}
function fromLoop(loop,stockTop=null){
 if(!loop||!Array.isArray(loop.points))fail('Geschlossene Kontur fehlt.');
 if(loop.cadWireId&&loop.side!=='inside')fail('Bitte eine innere STEP-Bohrungskante auswählen, keine Außenkante.');
 const fitted=sampleCircle(loop.points);
 const analytic=loop.analyticCircle;
 let geometry=fitted;
 if(analytic){
  const c=analytic.center,r=analytic.radius;
  if(!Array.isArray(c)||c.length!==3||!c.every(finite)||!finite(r)||r<=0)fail('Ungültige STEP-Kreisgeometrie.');
  if(Math.hypot(c[0]-fitted.center[0],c[1]-fitted.center[1])>Math.max(0.1,r*0.01)||Math.abs(r-fitted.radius)>Math.max(0.1,r*0.01))fail('STEP-Kreis und Anzeige stimmen nicht überein.');
  geometry={center:c.slice(0,2),radius:r,approximate:false,maxDeviation:fitted.maxDeviation};
 }
 const z=finite(loop.z)?loop.z:stockTop;
 if(!finite(z))fail('Bohrungs-Eintrittshöhe ist unbekannt.');
 return {...geometry,z,diameter:2*geometry.radius,ref:{id:loop.id,cadWireId:loop.cadWireId||null,cadFaceId:loop.cadFaceId||null,side:loop.side||'inside',points:loop.points.map(p=>p.slice())}};
}
function calculate(options){
 const {holes,stock,tool,depth,step,feed,clearance,mode='simple'}=options||{};
 if(!Array.isArray(holes)||!holes.length||holes.length>MAX_HOLES)fail('1 bis 200 Bohrungen auswählen.');
 if(!Array.isArray(stock)||stock.length!==3||!stock.every(x=>finite(x)&&x>0&&x<=100000))fail('Ungültiges Rohteil.');
 const [sx,sy,sz]=stock;
 if(!tool||!Number.isInteger(tool.id)||tool.id<1||tool.id>9999||!finite(tool.diameter)||tool.diameter<=0||!finite(tool.cutLength)||tool.cutLength<=0)fail('Gültigen Bohrer aus der Werkzeugbibliothek wählen.');
 if(!finite(depth)||depth<=0||depth>sz||depth>tool.cutLength)fail('Bohrtiefe größer als Rohteil oder Schneidenlänge.');
 if(!finite(step)||step<=0||step>100000||!['simple','peck'].includes(mode))fail('Ungültiger Bohrschritt oder Bohrmodus.');
 if(!finite(feed)||feed<=0||!finite(clearance)||clearance<=0||sz+clearance>1000000)fail('Ungültiger Vorschub oder Sicherheitshöhe.');
 const bottom=sz-depth,safe=sz+clearance,rad=tool.diameter/2;
 const moves=[],positions=[];
 function add(to,motion){if(moves.length>=MAX_MOVES)fail('Zu viele Bohrbewegungen.');moves.push({to,motion});}
 for(const h of holes){
  if(!h||!Array.isArray(h.center)||h.center.length!==2||!h.center.every(finite)||!finite(h.diameter)||h.diameter<=0||!finite(h.z))fail('Ungültige Bohrungsdaten.');
  const [x,y]=h.center;
  if(x-rad<0||y-rad<0||x+rad>sx||y+rad>sy)fail('Bohrung liegt zu nah am Rohteilrand.');
  if(Math.abs(h.z-sz)>0.001)fail('Bohrung liegt nicht auf der Rohteiloberseite. Bitte Aufspannung prüfen.');
  if(tool.diameter>h.diameter+0.001)fail('Bohrer ist größer als die gewählte Bohrung (Ø '+h.diameter.toFixed(3)+' mm).');
  if(positions.some(p=>Math.hypot(p[0]-x,p[1]-y)<0.001))fail('Doppelte Bohrungsmitte erkannt.');
  positions.push([x,y]);
  add([x,y,safe],'rapid');
  if(mode==='simple'){
   add([x,y,bottom],'feed');
   add([x,y,safe],'rapid');
  }else{
   const stages=Math.ceil(depth/step);
   if(stages>2000)fail('Bohrschritt erzeugt zu viele Rückzüge.');
   for(let k=1;k<=stages;k++){
    const z=Math.max(bottom,sz-k*step);
    add([x,y,z],'feed');
    add([x,y,safe],'rapid');
   }
  }
 }
 const start=[positions[0][0],positions[0][1],safe];
 return {format:'fertigungsstudio-toolpath-v1',operation:'drilling',units:'mm',stock:{min:[0,0,0],max:stock.slice()},tool_diameter:tool.diameter,bottom_z:bottom,clearance_z:safe,start,moves,tool_number:tool.id,cutting_length:tool.cutLength,cutting_feed:feed,plunge_feed:feed,geometry_source:'selected-model-holes',drill_count:holes.length,drill_mode:mode,drill_step_mm:mode==='peck'?step:null};
}
const api={sampleCircle,fromLoop,calculate};
root.CamDrillingModel=api;
if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof globalThis==='object'?globalThis:this);
