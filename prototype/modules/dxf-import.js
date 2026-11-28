/* Fertigungsstudio CAM – begrenzter, unabhängiger 2D-ASCII-DXF-Import.
 * Kein Fremdcode. Maschinenneutral; nur geschlossene ebene Konturen.
 * Kreise, Bögen und Bulges werden mit max. nominell 0,03 mm
 * Sehnenabweichung für die vorhandene polygonale Bahn-Vorschau diskretisiert.
 * Original-DXF bleibt in der .fscam Projektdatei erhalten.
 * Apache-2.0, keine NC-Ausgabe.
 */
(function(root){
'use strict';
const MAX_BYTES=8_000_000, MAX_POINTS=2048, MAX_ENTITIES=20_000, MAX_LOOPS=256, MAX_TOTAL_POINTS=16000;
const POS_TOL=0.0001, CHORD=0.03;
const finite=n=>Number.isFinite(n)&&Math.abs(n)<1_000_000;
const problem=m=>{throw Error('DXF: '+m);};
function pairsFromBytes(data){
 const bytes=data instanceof Uint8Array?data:new Uint8Array(data);
 if(!bytes.length||bytes.length>MAX_BYTES)problem('Datei leer oder größer als 8 MB.');
 if(bytes[0]===65&&new TextDecoder('latin1').decode(bytes.slice(0,22)).includes('AutoCAD Binary DXF'))problem('Binär-DXF ist nicht unterstützt. Bitte ASCII-DXF exportieren.');
 const content=new TextDecoder('utf-8',{fatal:false}).decode(bytes);
 if(content.includes('\u0000'))problem('Binärdaten im DXF. Bitte ASCII-DXF verwenden.');
 const lines=content.replace(/^\ufeff/,'').split(/\r\n|\n|\r/);
 if(lines.length%2&&lines.at(-1)==='')lines.pop();
 if(lines.length%2)problem('Unvollständige Gruppencodes.');
 if(lines.length>300000)problem('Zu viele Gruppencodes.');
 const pairs=[];
 for(let i=0;i<lines.length;i+=2){const code=Number(lines[i].trim());if(!Number.isInteger(code)||code<0||code>1071)problem('Ungültiger Gruppencode in Zeile '+(i+1)+'.');pairs.push([code,lines[i+1].trim()]);}
 return pairs;
}
const value=(items,code,def=undefined)=>items.find(x=>x[0]===code)?.[1]??def;
function scalar(items,code,def=undefined){const raw=value(items,code,def);if(raw===undefined)problem('Geometriekoordinate '+code+' fehlt.');const n=Number(raw);if(!finite(n))problem('Ungültiger Zahlenwert in Gruppe '+code+'.');return n;}
function guardXY(x,y){if(!finite(x)||!finite(y))problem('Koordinate außerhalb des zulässigen Bereichs.');return [x,y];}
function same(a,b){return Math.hypot(a[0]-b[0],a[1]-b[1])<=POS_TOL;}
function angleSegmentCount(radius,sweep){if(!(radius>0&&finite(radius)))problem('Ungültiger Bogenradius.');const acos=Math.acos(Math.max(-1,1-CHORD/radius));const step=Math.max(Math.PI/360,Math.min(Math.PI/8,2*acos||Math.PI/180));const n=Math.max(2,Math.ceil(Math.abs(sweep)/step));if(n>MAX_POINTS)problem('Bogen benötigt mehr als '+MAX_POINTS+' Stützpunkte.');return n;}
function arc(center,radius,start,sweep){const n=angleSegmentCount(radius,sweep),result=[];for(let i=0;i<=n;i++){const a=start+sweep*i/n;result.push(guardXY(center[0]+Math.cos(a)*radius,center[1]+Math.sin(a)*radius));}return result;}
function bulgeArc(start,end,bulge){if(Math.abs(bulge)<1e-12)return [start,end];const sweep=4*Math.atan(bulge),len=Math.hypot(end[0]-start[0],end[1]-start[1]);if(len<POS_TOL)problem('Degenerierter Polylinienbogen.');const mid=[(start[0]+end[0])/2,(start[1]+end[1])/2],ux=(end[0]-start[0])/len,uy=(end[1]-start[1])/len;
 const off=len/(2*Math.tan(sweep/2)),center=[mid[0]-uy*off,mid[1]+ux*off],radius=Math.hypot(start[0]-center[0],start[1]-center[1]);const a=Math.atan2(start[1]-center[1],start[0]-center[0]);return arc(center,radius,a,sweep);}
function polygonArea(points){let result=0;for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length];result+=a[0]*b[1]-a[1]*b[0];}return result/2;}
function pointInPoly(points,p){let inside=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const a=points[i],b=points[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;}return inside;}
function intersect(a,b,c,d){
 const orient=(p,q,r)=>(q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0]);
 const near=n=>Math.abs(n)<1e-8;
 const on=(p,q,r)=>r[0]>=Math.min(p[0],q[0])-POS_TOL&&r[0]<=Math.max(p[0],q[0])+POS_TOL&&
   r[1]>=Math.min(p[1],q[1])-POS_TOL&&r[1]<=Math.max(p[1],q[1])+POS_TOL;
 if(Math.max(a[0],b[0])+POS_TOL<Math.min(c[0],d[0])||Math.max(c[0],d[0])+POS_TOL<Math.min(a[0],b[0])||
    Math.max(a[1],b[1])+POS_TOL<Math.min(c[1],d[1])||Math.max(c[1],d[1])+POS_TOL<Math.min(a[1],b[1]))return false;
 const t=orient(a,b,c),u=orient(a,b,d),v=orient(c,d,a),w=orient(c,d,b);
 return (t*u<0&&v*w<0)||(near(t)&&on(a,b,c))||(near(u)&&on(a,b,d))||
   (near(v)&&on(c,d,a))||(near(w)&&on(c,d,b));
}
function validLoop(points){
 if(points.length>1&&same(points.at(-1),points[0]))points=points.slice(0,-1);
 const out=[];for(const p of points)if(!out.length||!same(out.at(-1),p))out.push(p);
 if(out.length<3||out.length>MAX_POINTS||Math.abs(polygonArea(out))<1e-8)problem('Kontur zu klein, degeneriert oder mit zu vielen Punkten.');
 for(let i=0;i<out.length;i++)for(let j=i+2;j<out.length;j++){
  if(i===0&&j===out.length-1)continue;
  if(intersect(out[i],out[(i+1)%out.length],out[j],out[(j+1)%out.length]))problem('Selbstüberschneidende Kontur erkannt.');
 }
 return out;
}
function joinSegments(segments){
 // Chaining is deliberately strict: open or branched outlines are not silently discarded.
 const remaining=new Set(segments.map((_,i)=>i)),loops=[];
 while(remaining.size){const first=remaining.values().next().value;remaining.delete(first);const chain=segments[first].slice();
  while(!same(chain[0],chain.at(-1))){
   const tail=chain.at(-1);let matches=[];
   for(const id of remaining){const p=segments[id];if(same(p[0],tail))matches.push([id,false]);else if(same(p.at(-1),tail))matches.push([id,true]);}
   if(matches.length!==1)problem(matches.length?'Verzweigte Linienkontur.':'Offene Linienkontur.');
   const [id,reverse]=matches[0];const p=reverse?segments[id].slice().reverse():segments[id];
   remaining.delete(id);chain.push(...p.slice(1));if(chain.length>MAX_POINTS+3)problem('Zu viele Punkte in einer Kontur.');
  }
  loops.push(validLoop(chain));
 }
 return loops;
}
function parse(data){
 const pairs=pairsFromBytes(data);
 let unit=0,withinEntities=false,section='',block=[],type='',entities=[],counter=0,sawEOF=false,closedEntities=false;
 for(let i=0;i<pairs.length;i++){
  const [code,v]=pairs[i];
  if(code===0&&v==='EOF')sawEOF=true;
  if(code===9&&v==='$INSUNITS'){const next=pairs.slice(i+1,i+7).find(p=>p[0]===70);if(next)unit=Number(next[1]);}
  if(code===0&&v==='SECTION'){section=pairs[i+1]?.[0]===2?pairs[i+1][1]:'';withinEntities=section==='ENTITIES';continue;}
  if(code===0&&v==='ENDSEC'){if(withinEntities){closedEntities=true;if(type)entities.push({type,data:block});}withinEntities=false;type='';block=[];continue;}
  if(!withinEntities)continue;
  if(code===0){if(type)entities.push({type,data:block});type=v;block=[];if(++counter>MAX_ENTITIES)problem('Zu viele Elemente.');}
  else block.push([code,v]);
 }
 if(!sawEOF||!closedEntities)problem('DXF-Dateiende oder ENTITIES-Abschnitt nicht vollständig.');
 if(!entities.length)problem('Keine Elemente im ENTITIES-Abschnitt.');
 const unitScale={0:1,1:25.4,2:304.8,4:1,5:10,6:1000,10:914.4}[unit];
 if(!unitScale)problem('Nicht unterstützte Zeichnungseinheit $INSUNITS='+unit+'. Bitte DXF in mm exportieren.');
 const mm=n=>n*unitScale, rings=[],segments=[],warnings=[];let currentPoly=null,ignored=0,analyticCurves=0;
 function pointAt(p,x=10,y=20){return guardXY(mm(scalar(p,x)),mm(scalar(p,y)));}
 function check2D(p){if(Math.abs(mm(scalar(p,30,0)))>POS_TOL||Math.abs(mm(scalar(p,38,0)))>POS_TOL)problem('Nur XY-Ebenen ohne Z-Versatz unterstützt.');if(Math.abs(scalar(p,210,0))>1e-8||Math.abs(scalar(p,220,0))>1e-8)problem('Geneigte Extrusionsrichtung wird nicht unterstützt.');const norm=scalar(p,230,1);if(Math.abs(norm-1)>1e-8)problem('Geneigte Extrusionsrichtung wird nicht unterstützt.');}
 function segmentsFromPoints(points){for(let i=1;i<points.length;i++)segments.push([points[i-1],points[i]]);}
 function addLW(p){check2D(p);const vertices=[];let at=null;
  for(const [code,raw] of p){
   if(code===10){if(at){if(at.y===undefined)problem('LWPOLYLINE ohne Y-Koordinate.');vertices.push(at);}at={x:mm(Number(raw)),y:undefined,bulge:0};}
   else if(code===20&&at)at.y=mm(Number(raw));
   else if(code===42&&at)at.bulge=Number(raw);
  }
  if(at){if(at.y===undefined)problem('LWPOLYLINE ohne Y-Koordinate.');vertices.push(at);}
  if(vertices.length<2||vertices.length>MAX_POINTS)problem('Polylinie ungültig.');
  const n=scalar(p,90,vertices.length);if(n!==vertices.length)problem('Polylinien-Punktzahl stimmt nicht.');
  if(!vertices.every(v=>[v.x,v.y,v.bulge].every(finite)))problem('Ungültige Polylinienkoordinaten.');
  const closed=!!(scalar(p,70,0)&1),data=[];
  for(let i=0;i<vertices.length-(closed?0:1);i++){
   const a=vertices[i],b=vertices[(i+1)%vertices.length];const piece=bulgeArc([a.x,a.y],[b.x,b.y],a.bulge);if(i===0)data.push(...piece);else data.push(...piece.slice(1));
  }
  if(closed)rings.push(validLoop(data));else segmentsFromPoints(data);
 }
 function addArc(p){check2D(p);const c=pointAt(p);const r=mm(scalar(p,40));let a=scalar(p,50)*Math.PI/180,b=scalar(p,51)*Math.PI/180;while(b<=a)b+=Math.PI*2;analyticCurves++;segmentsFromPoints(arc(c,r,a,b-a));}
 function addCircle(p){check2D(p);const c=pointAt(p),r=mm(scalar(p,40));analyticCurves++;rings.push(validLoop(arc(c,r,0,Math.PI*2)));}
 for(let i=0;i<entities.length;i++){
  const entity=entities[i],p=entity.data;
  if(scalar(p,67,0)===1||value(p,410,'Model')!=='Model')continue;
  if(currentPoly&&entity.type!=='VERTEX'&&entity.type!=='SEQEND')problem('POLYLINE ohne SEQEND.');
  switch(entity.type){
   case 'LINE':check2D(p);segments.push([pointAt(p),pointAt(p,11,21)]);break;
   case 'CIRCLE':addCircle(p);break;
   case 'ARC':addArc(p);break;
   case 'LWPOLYLINE':addLW(p);break;
   case 'POLYLINE':check2D(p);if(scalar(p,70,0)&(8|16|64))problem('3D-Polylinien und Netzgeometrie werden nicht unterstützt.');currentPoly={points:[],closed:!!(scalar(p,70,0)&1)};break;
   case 'VERTEX':if(!currentPoly)problem('VERTEX ohne POLYLINE.');check2D(p);currentPoly.points.push({x:mm(scalar(p,10)),y:mm(scalar(p,20)),bulge:scalar(p,42,0)});break;
   case 'SEQEND':if(!currentPoly)problem('SEQEND ohne POLYLINE.');{
    const v=currentPoly.points,n=v.length;if(n<2)problem('Leere POLYLINE.');const points=[];
    for(let j=0;j<n-(currentPoly.closed?0:1);j++){
     const a=v[j],b=v[(j+1)%n],piece=bulgeArc([a.x,a.y],[b.x,b.y],a.bulge);if(j===0)points.push(...piece);else points.push(...piece.slice(1));
    }
    if(currentPoly.closed)rings.push(validLoop(points));else segmentsFromPoints(points);currentPoly=null;break;
   }
   case 'TEXT':case 'MTEXT':case 'POINT':case 'DIMENSION':case 'HATCH':case 'LEADER':case 'XLINE':case 'RAY':case 'SOLID':case 'TRACE':ignored++;break;
   default: problem('Elementtyp '+entity.type+' nicht unterstützt. Für vollständigen Import in 2D-Linien/Bögen umwandeln.');
  }
 }
 if(currentPoly)problem('POLYLINE ohne SEQEND.');
 if(segments.length)rings.push(...joinSegments(segments));
 if(!rings.length)problem('Keine geschlossene Kontur im DXF.');
 if(rings.length>MAX_LOOPS)problem('Mehr als 256 Konturen.');
 if(rings.reduce((sum,r)=>sum+r.length,0)>MAX_TOTAL_POINTS)problem('Zu viele Konturpunkte insgesamt.');
 // Reject crossing contours that cannot represent unambiguous nested machining regions.
 for(let i=0;i<rings.length;i++)for(let j=i+1;j<rings.length;j++){
  const a=rings[i],b=rings[j];
  for(let k=0;k<a.length;k++)for(let q=0;q<b.length;q++){
   if(intersect(a[k],a[(k+1)%a.length],b[q],b[(q+1)%b.length]))problem('Überlappende Konturen '+(i+1)+' / '+(j+1)+'.');
  }
 }
 const lo=[Infinity,Infinity],hi=[-Infinity,-Infinity];for(const r of rings)for(const p of r)for(let i=0;i<2;i++){lo[i]=Math.min(lo[i],p[i]);hi[i]=Math.max(hi[i],p[i]);}
 const size=[hi[0]-lo[0],hi[1]-lo[1],0];if(size[0]<0.0001||size[1]<0.0001||size[0]>100000||size[1]>100000)problem('Ungültige DXF-Ausdehnung.');
 const normalized=rings.map(r=>r.map(p=>[p[0]-lo[0],p[1]-lo[1]]));
 const loops=normalized.map((points,i)=>({id:'dxf-loop-'+i,points,side:normalized.filter((other,j)=>i!==j&&pointInPoly(other,points[0])).length%2?'inside':'outside',area:polygonArea(points),z:0}));
 loops.sort((a,b)=>Math.abs(b.area)-Math.abs(a.area));
 if(!unit)warnings.push('DXF ohne Zeichnungseinheit: Werte wurden als Millimeter behandelt.');
 if(ignored)warnings.push(ignored+' nicht bearbeitbare Annotations-/Flächenelemente ignoriert.');
 if(analyticCurves||entities.some(x=>x.data.some(p=>p[0]===42&&Number(p[1]))))warnings.push('Kreisbögen sind für die Vorschau polygonal angenähert; das Original-DXF bleibt erhalten.');
 return {format:'dxf',triangles:[],loops,size,sourceBounds:{min:[...lo,0],max:[...hi,0]},stats:{entities:entities.length,contours:loops.length,curves:analyticCurves},warnings};
}
root.FertigungsstudioDxfImport={parse,version:'1.0'};
if(typeof module!=='undefined'&&module.exports)module.exports={parse};
})(globalThis);
