/* Fertigungsstudio CAM – Konturvereinfachung für die 2,5D-Vorschau.
 * Das ausgewählte Originalpolygon bleibt unverändert. Die geometrische
 * Toleranz beschränkt die Abweichung der Polygonsegmente von den Originalpunkten.
 * Keine Maschine- oder Kollisionsprüfung.
 */
(function(root){
'use strict';
function simplify(points, tolerance){
  if(!Array.isArray(points)||points.length<3||points.length>2048)throw Error('Ungültige Kontur.');
  if(typeof tolerance!=='number'||!Number.isFinite(tolerance)||tolerance<0||tolerance>5)throw Error('Konturtoleranz muss zwischen 0 und 5 mm liegen.');
  const clean=points.map(p=>{
    if(!Array.isArray(p)||p.length!==2||p.some(x=>!Number.isFinite(x)))throw Error('Ungültige Konturkoordinate.');
    return [p[0],p[1]];
  });
  if(clean.length>=4&&Math.hypot(clean[0][0]-clean.at(-1)[0],clean[0][1]-clean.at(-1)[1])<1e-10)clean.pop();
  if(clean.length<3)throw Error('Kontur hat zu wenige unterschiedliche Punkte.');
  if(tolerance===0)return {points:clean,originalCount:clean.length,resultCount:clean.length,tolerance:0};
  const N=clean.length;
  let first=0;
  for(let i=1;i<N;i++)if(clean[i][0]<clean[first][0]||(clean[i][0]===clean[first][0]&&clean[i][1]<clean[first][1]))first=i;
  let opposite=-1,dist2=-1;
  for(let i=0;i<N;i++){
    const dx=clean[i][0]-clean[first][0],dy=clean[i][1]-clean[first][1],d=dx*dx+dy*dy;
    if(d>dist2){dist2=d;opposite=i;}
  }
  if(opposite===first||dist2<1e-20)throw Error('Kontur ohne Ausdehnung.');
  const chain=(start,end)=>{
    const out=[];let idx=start;
    for(let n=0;n<=N;n++){
      out.push(idx);if(idx===end)return out;idx=(idx+1)%N;
    }
    throw Error('Kontur ist nicht geschlossen.');
  };
  const segmentDistance=(p,a,b)=>{
    const vx=b[0]-a[0],vy=b[1]-a[1],ls=vx*vx+vy*vy;
    const u=ls>1e-20?Math.max(0,Math.min(1,((p[0]-a[0])*vx+(p[1]-a[1])*vy)/ls)):0;
    return Math.hypot(p[0]-a[0]-u*vx,p[1]-a[1]-u*vy);
  };
  function rdp(indices){
    const keep=new Uint8Array(indices.length);keep[0]=1;keep[keep.length-1]=1;
    const stack=[[0,indices.length-1]];
    while(stack.length){
      const [s,e]=stack.pop();let longest=-1,pick=-1;
      for(let i=s+1;i<e;i++){
        const d=segmentDistance(clean[indices[i]],clean[indices[s]],clean[indices[e]]);
        if(d>longest){longest=d;pick=i;}
      }
      if(longest>tolerance+1e-10){keep[pick]=1;stack.push([s,pick],[pick,e]);}
    }
    return indices.filter((_,i)=>keep[i]);
  }
  const a=rdp(chain(first,opposite)),b=rdp(chain(opposite,first));
  const reduced=[...a.slice(0,-1),...b.slice(0,-1)].map(i=>clean[i]);
  if(reduced.length<3)throw Error('Konturtoleranz ist zu groß: zu wenige verbleibende Punkte.');
  const area=arr=>arr.reduce((s,p,i)=>{const q=arr[(i+1)%arr.length];return s+p[0]*q[1]-q[0]*p[1];},0);
  if(area(clean)*area(reduced)<=0||Math.abs(area(reduced))<1e-8)throw Error('Konturtoleranz verändert die Konturorientierung.');
  // Reject any newly introduced self-intersection rather than sending corrupt geometry.
  const cross=(a,b)=>a[0]*b[1]-a[1]*b[0];
  const sub=(a,b)=>[a[0]-b[0],a[1]-b[1]];
  for(let i=0;i<reduced.length;i++){
    const p=reduced[i],q=reduced[(i+1)%reduced.length],u=sub(q,p);
    if(Math.hypot(...u)<1e-6)throw Error('Kontur enthält nach Vereinfachung eine zu kurze Kante.');
    for(let j=i+2;j<reduced.length;j++){
      if(i===0&&j===reduced.length-1)continue;
      const a=reduced[j],b=reduced[(j+1)%reduced.length],v=sub(b,a),den=cross(u,v);
      if(Math.abs(den)<1e-10)continue;
      const w=sub(a,p),t=cross(w,v)/den,h=cross(w,u)/den;
      if(t>1e-9&&t<1-1e-9&&h>1e-9&&h<1-1e-9)throw Error('Vereinfachte Kontur überschneidet sich. Bitte Toleranz verkleinern.');
    }
  }
  return {points:reduced,originalCount:clean.length,resultCount:reduced.length,tolerance};
}
const api={simplify};root.FertigungsstudioContourSimplify=api;
if(typeof module==='object'&&module.exports)module.exports=api;
})(globalThis);
