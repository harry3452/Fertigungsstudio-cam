/*
 * Fertigungsstudio CAM – experimenteller 2D-Taschenbahnplaner für STL-Innenkonturen.
 * Eigenentwicklung; keine Drittanbieter-Laufzeitbibliothek.
 * Scanline-Bearbeitung in XY, senkrechte Eintritte und vollständiger Rückzug
 * vor jeder seitlichen Eilgangbewegung. Nur geometrische Vorschau, keine CNC-Freigabe.
 * Inseln als explizit gewählte 2D-Ausschlusskonturen; keine automatische
 * 3D-Inselerkennung oder Höhenprüfung. Nicht unterstützt: gestufte Böden,
 * sichere senkrechte Eintauchstellen, Halter/Spannmittel und Materialabtrag.
 */
(function(root){
'use strict';
const MAX_VERTICES=512, MAX_PATH=90000, MAX_WORK=8000000;
const sq=v=>v*v;
const dist2=(p,a,b)=>{
 const dx=b[0]-a[0],dy=b[1]-a[1],l2=dx*dx+dy*dy;
 const t=l2?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/l2)):0;
 return sq(p[0]-a[0]-t*dx)+sq(p[1]-a[1]-t*dy);
};
const orient=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
function intersect(a,b,c,d){
 const e=1e-9;
 const o1=orient(a,b,c),o2=orient(a,b,d),o3=orient(c,d,a),o4=orient(c,d,b);
 // Inclusive intersection, including self-touch and overlapping polygon edges.
 if(o1*o2<-e&&o3*o4<-e)return true;
 const on=(p,a,b)=>Math.min(a[0],b[0])-e<=p[0]&&p[0]<=Math.max(a[0],b[0])+e&&Math.min(a[1],b[1])-e<=p[1]&&p[1]<=Math.max(a[1],b[1])+e;
 return (Math.abs(o1)<=e&&on(c,a,b))||(Math.abs(o2)<=e&&on(d,a,b))||
        (Math.abs(o3)<=e&&on(a,c,d))||(Math.abs(o4)<=e&&on(b,c,d));
}
function segmentsDistance2(a,b,c,d){
 if(intersect(a,b,c,d))return 0;
 return Math.min(dist2(a,c,d),dist2(b,c,d),dist2(c,a,b),dist2(d,a,b));
}
function normalize(points){
 if(!Array.isArray(points)||points.length<3||points.length>MAX_VERTICES+1)
  throw Error('Kontur benötigt 3 bis 512 Eckpunkte.');
 const pts=points.map(p=>{
  if(!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite))throw Error('Ungültige Konturkoordinaten.');
  if(Math.abs(p[0])>1000000||Math.abs(p[1])>1000000)throw Error('Koordinate außerhalb des erlaubten Bereichs.');
  return p.slice();
 });
 if(pts.length>3&&Math.hypot(pts[0][0]-pts.at(-1)[0],pts[0][1]-pts.at(-1)[1])<1e-8)pts.pop();
 if(pts.length<3||pts.length>MAX_VERTICES)throw Error('Kontur hat zu viele oder zu wenige Eckpunkte.');
 for(let i=0;i<pts.length;i++)if(Math.hypot(pts[i][0]-pts[(i+1)%pts.length][0],pts[i][1]-pts[(i+1)%pts.length][1])<1e-8)
  throw Error('Kontur enthält doppelte Punkte oder Nullkanten.');
 for(let i=0;i<pts.length;i++)for(let j=i+2;j<pts.length;j++){
  if(i===0&&j===pts.length-1)continue;
  if(intersect(pts[i],pts[(i+1)%pts.length],pts[j],pts[(j+1)%pts.length]))
   throw Error('Kontur überschneidet sich oder berührt sich selbst.');
 }
 const area=pts.reduce((s,p,i)=>s+orient([0,0],p,pts[(i+1)%pts.length]),0)/2;
 const xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]);
 const bounds={minX:Math.min(...xs),maxX:Math.max(...xs),minY:Math.min(...ys),maxY:Math.max(...ys)};
 bounds.width=bounds.maxX-bounds.minX;bounds.height=bounds.maxY-bounds.minY;
 if(bounds.width<=0||bounds.height<=0||Math.abs(area)<1e-8)throw Error('Konturfläche ist null.');
 return {points:pts,bounds,area:Math.abs(area)};
}
function inside(p,poly){
 let result=false;
 for(let i=0,j=poly.length-1;i<poly.length;j=i++){
  const a=poly[i],b=poly[j];
  if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])result=!result;
 }
 return result;
}
// A selectable island must be strictly contained by the outer pocket contour.
// Reject crossings, nesting and touching: ambiguous topologies must not be milled.
function validateIslands(poly, rawIslands=[]){
 if(!Array.isArray(rawIslands)||rawIslands.length>12)throw Error('Höchstens 12 Inseln pro Tasche erlaubt.');
 const rings=rawIslands.map(x=>normalize(x).points);
 const total=poly.length+rings.reduce((n,r)=>n+r.length,0);
 if(total>1024)throw Error('Zu viele Gesamtpunkte in Taschen- und Inselkonturen.');
 for(let k=0;k<rings.length;k++){
  const ring=rings[k];
  for(const p of ring){
   if(!inside(p,poly))throw Error('Insel muss vollständig innerhalb der Tasche liegen.');
   for(let j=0;j<poly.length;j++)if(dist2(p,poly[j],poly[(j+1)%poly.length])<1e-10)
    throw Error('Insel berührt die Taschenwand.');
  }
  for(let i=0;i<ring.length;i++)for(let j=0;j<poly.length;j++){
   if(segmentsDistance2(ring[i],ring[(i+1)%ring.length],poly[j],poly[(j+1)%poly.length])<1e-10)
    throw Error('Insel und Taschenwand schneiden oder berühren sich.');
  }
  for(let other=0;other<k;other++){
   const prev=rings[other];
   if(inside(ring[0],prev)||inside(prev[0],ring))throw Error('Inseln dürfen nicht ineinander liegen.');
   for(let i=0;i<ring.length;i++)for(let j=0;j<prev.length;j++){
    if(segmentsDistance2(ring[i],ring[(i+1)%ring.length],prev[j],prev[(j+1)%prev.length])<1e-10)
     throw Error('Inseln überschneiden oder berühren sich.');
   }
  }
 }
 return rings;
}
function clearPoint(p,poly,r2,islands=[]){
 if(!inside(p,poly))return false;
 for(let i=0;i<poly.length;i++)if(dist2(p,poly[i],poly[(i+1)%poly.length])<r2)return false;
 for(const ring of islands){
  if(inside(p,ring))return false;
  for(let j=0;j<ring.length;j++)if(dist2(p,ring[j],ring[(j+1)%ring.length])<r2)return false;
 }
 return true;
}
function clearSegment(a,b,poly,r2,islands=[]){
 if(!clearPoint(a,poly,r2,islands)||!clearPoint(b,poly,r2,islands))return false;
 for(let i=0;i<poly.length;i++)if(segmentsDistance2(a,b,poly[i],poly[(i+1)%poly.length])<r2)return false;
 for(const ring of islands)for(let i=0;i<ring.length;i++)
  if(segmentsDistance2(a,b,ring[i],ring[(i+1)%ring.length])<r2)return false;
 return true;
}
function calculate(opts){
 const {points,stock,diameter,depth,stepdown,stepover,clearance,feed,plunge,toolNumber,cuttingLength,islands=[]}=opts;
 const shape=normalize(points),poly=shape.points,b=shape.bounds;
 const rings=validateIslands(poly,islands);
 if(!Array.isArray(stock)||stock.length!==3||!stock.every(v=>Number.isFinite(v)&&v>0))throw Error('Ungültiges Rohteil.');
 for(const [name,n] of Object.entries({diameter,depth,stepdown,stepover,clearance,feed,plunge,cuttingLength}))
  if(!Number.isFinite(n)||n<=0)throw Error('Ungültige Eingabe: '+name);
 if(!Number.isInteger(toolNumber)||toolNumber<1||toolNumber>9999)throw Error('Werkzeugnummer ungültig.');
 if(b.minX<=0||b.minY<=0||b.maxX>=stock[0]||b.maxY>=stock[1])throw Error('Tasche nicht vollständig innerhalb des Rohteils.');
 if(depth>stock[2]||depth>cuttingLength)throw Error('Tiefe überschreitet Rohteil oder Schneidenlänge.');
 if(stepover>diameter/2)throw Error('Seitliche Zustellung höchstens halber Fräserdurchmesser.');
 if(stock[2]+clearance>1000000)throw Error('Sicherheitshöhe überschreitet den Grenzwert.');
 const r=diameter/2+0.001, r2=r*r;
 if(b.width<=2*r||b.height<=2*r)throw Error('Fräser zu groß für diese Kontur.');
 const passes=Math.ceil(depth/stepdown);
 const y0=b.minY+r,y1=b.maxY-r;
 const rows=Math.max(1,Math.ceil((y1-y0)/stepover));
 const x0=b.minX+r,x1=b.maxX-r;
 const xstep=Math.min(0.25,diameter/20,stepover/4);
 const cols=Math.ceil((x1-x0)/xstep);
 if(cols<1||cols>3000||rows>500||cols*(rows+1)*(poly.length+rings.reduce((n,r)=>n+r.length,0))>MAX_WORK||passes*(rows+1)*20>MAX_PATH)
  throw Error('Kontur zu komplex für die experimentelle Vorschau.');
 const lines=[];
 const safe=(x,y)=>clearPoint([x,y],poly,r2,rings);
 const refine=(a,b,y,findFirst)=>{
  // a is unsafe, b is safe when findFirst is true; reverse otherwise.
  let low=a,high=b;
  for(let k=0;k<22;k++){
   const mid=(low+high)/2;
   if(safe(mid,y)===findFirst)high=mid;else low=mid;
  }
  return findFirst?high:low;
 };
 for(let row=0;row<=rows;row++){
  const y=row===rows?y1:y0+(y1-y0)*row/rows;
  const samples=[];
  for(let col=0;col<=cols;col++){
   const x=col===cols?x1:x0+(x1-x0)*col/cols;
   samples.push({x,valid:safe(x,y)});
  }
  let start=null;
  const add=(a,b)=>{
   if(b-a<Math.max(0.0005,diameter*0.02))return;
   if(!clearSegment([a,y],[b,y],poly,r2,rings))return;
   lines.push({x0:a,x1:b,y});
  };
  for(let j=0;j<samples.length;j++){
   const s=samples[j],before=samples[j-1];
   const begin=s.valid&&(!before||!before.valid||!clearSegment([before.x,y],[s.x,y],poly,r2,rings));
   if(begin){
    start=before&&!before.valid?refine(before.x,s.x,y,true):s.x;
   }
   const finish=s.valid&&(j===samples.length-1||!samples[j+1].valid||!clearSegment([s.x,y],[samples[j+1].x,y],poly,r2,rings));
   if(finish&&start!==null){
    const next=samples[j+1];
    let end=next&&!next.valid?refine(next.x,s.x,y,false):s.x;
    if(end<start){const tmp=start;start=end;end=tmp;}
    add(start,end);start=null;
   }
  }
 }
 if(!lines.length)throw Error('Kein fräsbarer Innenbereich für diesen Fräser gefunden.');
 if(lines.length*passes*4>MAX_PATH)throw Error('Zu viele Werkzeugbewegungen für diese Vorschau.');
 const zsafe=stock[2]+clearance,moves=[];
 let first=null;
 for(let pass=1;pass<=passes;pass++){
  const z=stock[2]-Math.min(depth,stepdown*pass);
  // Serpentine scanning, but every disconnected lane retracts before an XY rapid.
  for(let row=0;row<lines.length;row++){
   const line=lines[row],reverse=(row+pass)%2===0;
   const x=reverse?line.x1:line.x0,end=reverse?line.x0:line.x1;
   if(!first)first=[x,line.y,zsafe];
   moves.push({to:[x,line.y,zsafe],motion:'rapid'});
   moves.push({to:[x,line.y,z],motion:'feed'});
   moves.push({to:[end,line.y,z],motion:'feed'});
   moves.push({to:[end,line.y,zsafe],motion:'rapid'});
  }
 }
 const result={format:'fertigungsstudio-toolpath-v1',operation:'pocket',units:'mm',
  stock:{min:[0,0,0],max:stock.slice()},tool_diameter:diameter,
  bottom_z:stock[2]-depth,clearance_z:zsafe,start:first,moves,
  tool_number:toolNumber,cutting_length:cuttingLength,cutting_feed:feed,plunge_feed:plunge,
  geometry_source:rings.length?'stl-pocket-with-islands':'stl-freeform-outline',preview_only:true,depth_passes:passes,rows_per_pass:lines.length,
  island_count:rings.length,island_vertices:rings.map(r=>r.length),
  pocket_bounds:[b.minX,b.minY,b.maxX,b.maxY],polygon_vertex_count:poly.length};
 verify(result,poly,rings);
 return result;
}
function verify(data,poly,islands=[]){
 const rings=validateIslands(poly,islands);
 const clearance2=sq(data.tool_diameter/2+0.0009);
 let prev=data.start;
 for(const move of data.moves){
  const to=move.to;
  if(!to.every(Number.isFinite))throw Error('Werkzeugbahn hat ungültige Koordinaten.');
  if(move.motion==='feed'){
   const xyA=[prev[0],prev[1]],xyB=[to[0],to[1]];
   if(!clearSegment(xyA,xyB,poly,clearance2,rings))throw Error('Werkzeugbahn unterschreitet Konturabstand.');
  }else if(prev[2]!==data.clearance_z||to[2]!==data.clearance_z){
   // retract at fixed XY is allowed, but a lateral rapid at cutting depth never.
   if(prev[0]!==to[0]||prev[1]!==to[1]||to[2]!==data.clearance_z)throw Error('Unsichere Eilgangbewegung.');
  }
  prev=to;
 }
 if(Math.abs(prev[2]-data.clearance_z)>1e-8)throw Error('Rückzug fehlt.');
 return true;
}
root.CamPolygonPocket={normalize,calculate,verify,clearPoint,clearSegment,validateIslands};
if(typeof module==='object'&&module.exports)module.exports=root.CamPolygonPocket;
})(typeof globalThis==='object'?globalThis:this);
