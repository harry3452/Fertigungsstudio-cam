/*
 * Fertigungsstudio CAM – geometrische Eintauchbahnen für Taschen (Vorschau).
 * Eigenentwicklung. Kein NC-Postprozessor, keine Maschinen-/Materialprüfung.
 * Die bestehende neutrale Taschenbahn bleibt erhalten; nur erkannte senkrechte
 * Eintrittssegmente werden durch winkelgesteuerte Rampen oder Helices ersetzt.
 * Helix zunächst ausschließlich für rechteckige, vollständig umschlossene Taschen.
 */
(function(root){
'use strict';
const EPS=1e-7, MAX_MOVES=100000;
function valid(n){return typeof n==='number'&&Number.isFinite(n)}
function pointEqual(a,b){return Math.abs(a[0]-b[0])<EPS&&Math.abs(a[1]-b[1])<EPS}
function fail(text){throw Error('Eintauchen: '+text)}
function apply(path,options){
 if(!path||path.operation!=='pocket'||!Array.isArray(path.moves)||!Array.isArray(path.start))fail('Nur berechnete Taschenbahnen werden unterstützt.');
 const {type='plunge',angle=2,radius=2,stockTop,bounds,toolDiameter,stepdown,shape='rectangle'}=options||{};
 if(!['plunge','ramp','helix'].includes(type))fail('Unbekannte Strategie.');
 if(type==='plunge')return {...path,entry_type:'plunge'};
 if(!valid(stockTop)||!valid(toolDiameter)||toolDiameter<=0||!valid(stepdown)||stepdown<=0)fail('Ungültige Werkzeug- oder Tiefenparameter.');
 if(!valid(angle)||angle<0.5||angle>15)fail('Eintauchwinkel muss zwischen 0,5° und 15° liegen.');
 if(type==='helix'&&(shape!=='rectangle'||!bounds||!valid(radius)||radius<=0))fail('Helix nur bei geprüften Rechtecktaschen und mit positivem Bahnradius.');
 const theta=angle*Math.PI/180, tan=Math.tan(theta), zsafe=path.clearance_z;
 const origin=path.start.slice(), result=[], levels=[];
 let prev=origin, count=0;
 const push=(to,motion)=>{
  if(!to.every(valid)||++count>MAX_MOVES)fail('Zu viele oder ungültige Bahnbewegungen.');
  result.push({to,motion});
 };
 const toolR=toolDiameter/2;
 let circle=null;
 if(type==='helix'){
  const [xmin,ymin,xmax,ymax]=bounds;
  if(![xmin,ymin,xmax,ymax].every(valid)||xmax-xmin<=0||ymax-ymin<=0)fail('Ungültige Rechteckgeometrie.');
  const cx=(xmin+xmax)/2,cy=(ymin+ymax)/2;
  const margin=toolR+radius+0.02;
  if(cx-xmin<margin||xmax-cx<margin||cy-ymin<margin||ymax-cy<margin)
   fail('Für den eingestellten Helixradius ist die Tasche zu schmal.');
  circle={cx,cy,px:cx+radius,py:cy};
 }
 const moves=path.moves;
 for(let i=0;i<moves.length;i++){
  const move=moves[i],to=move.to;
  const next=moves[i+1];
  if(!Array.isArray(to)||to.length!==3||!to.every(valid))fail('Ungültiger Eingangsweg.');
  // Entry: vertical feed from the specified clearance height, followed by
  // a horizontal feed at the target layer. Never modify other feed moves.
  const entry=move.motion==='feed'&&pointEqual(prev,to)&&prev[2]>to[2]+EPS&&
   Math.abs(prev[2]-zsafe)<EPS&&next&&next.motion==='feed'&&
   Math.abs(next.to[2]-to[2])<EPS&&!pointEqual(next.to,to);
  if(!entry){push(to.slice(),move.motion);prev=to;continue}
  const z=to[2];
  let top=levels.find(l=>Math.abs(l.z-z)<EPS)?.top;
  if(top===undefined){top=levels.length?levels[levels.length-1].z:stockTop;levels.push({z,top});}
  if(top-z<=EPS||top>stockTop+EPS)fail('Ungültige Tiefenfolge der Tasche.');
  if(type==='ramp'){
   const dx=next.to[0]-to[0],dy=next.to[1]-to[1],distance=Math.hypot(dx,dy);
   const required=(top-z)/tan;
   if(distance+EPS<required)fail('Rampe benötigt '+required.toFixed(2)+' mm, die erste Fräsbahn bietet nur '+distance.toFixed(2)+' mm. Winkel erhöhen, Tiefenzustellung verkleinern oder Eintauchart wechseln.');
   // The first vertical movement stops at the last machined level (or stock
   // surface); the ramp is confined to the originally valid first scanline.
   push([to[0],to[1],top],'feed');
   const ratio=Math.min(1,required/distance);
   push([to[0]+dx*ratio,to[1]+dy*ratio,z],'feed');
  }else{
   // Replace the preceding clearance-height rapid with a rapid to the
   // checked circle start. All helical elements are FEED moves in XYZ.
   const previousMove=result.at(-1);
   if(!previousMove||previousMove.motion!=='rapid'||Math.abs(previousMove.to[2]-zsafe)>EPS)
    fail('Helix konnte keinen sicheren Anfahrpunkt zuordnen.');
   previousMove.to=[circle.px,circle.py,zsafe];
   push([circle.px,circle.py,top],'feed');
   const descent=top-z,turns=descent/(2*Math.PI*radius*tan);
   const segments=Math.ceil(turns*48);
   if(segments<1||segments>9000)fail('Helix erfordert zu viele Umläufe. Winkel, Radius oder Tiefenzustellung anpassen.');
   for(let j=1;j<=segments;j++){
    const t=j/segments,ang=turns*2*Math.PI*t;
    push([circle.cx+radius*Math.cos(ang),circle.cy+radius*Math.sin(ang),top-descent*t],'feed');
   }
   // Straight, feed-rate-only connection inside the convex rectangle.
   push([to[0],to[1],z],'feed');
  }
  prev=to;
 }
 if(!levels.length)fail('Kein geeigneter Eintritt in der Taschenbahn erkannt.');
 const output={...path,moves:result,entry_type:type,entry_angle_deg:angle,
  ...(type==='helix'?{helix_path_radius_mm:radius}:{})};
 if(Math.abs(result.at(-1)?.to[2]-zsafe)>EPS)fail('Rückzug zum Bahnende fehlt.');
 return output;
}
root.CamPocketEntry={apply};
if(typeof module==='object'&&module.exports)module.exports=root.CamPocketEntry;
})(typeof globalThis==='object'?globalThis:this);
