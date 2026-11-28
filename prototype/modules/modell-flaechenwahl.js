/*
 * Fertigungsstudio CAM – Bildschirm-Flächenauswahl für triangulierte STL-Modelle.
 * Eigene Berechnung ohne externe Bibliothek. Geometrie in Modell-/Rohteil-mm.
 * Es wird ausschließlich die im 2D-Canvas visuell vorderste Dreiecksfläche
 * innerhalb der angeklickten Position ausgewählt, so wie das Canvas zeichnet.
 * Keine verlässliche Sichtbarkeits-/Kollisionszertifizierung für Werkzeugbahnen.
 */
(function(root){'use strict';
function barycentric(p,a,b,c){
 const den=(b.y-c.y)*(a.x-c.x)+(c.x-b.x)*(a.y-c.y);
 if(!Number.isFinite(den)||Math.abs(den)<1e-6)return null;
 const u=((b.y-c.y)*(p.x-c.x)+(c.x-b.x)*(p.y-c.y))/den;
 const v=((c.y-a.y)*(p.x-c.x)+(a.x-c.x)*(p.y-c.y))/den;
 const w=1-u-v;
 if(Math.min(u,v,w)<-1e-5||Math.max(u,v,w)>1.00001)return null;
 return [u,v,w];
}
function pickVisible(triangles,projectTri,screen,heightScale=100){
 if(!Array.isArray(triangles)||typeof projectTri!=='function'||!screen)return null;
 let hit=null;
 for(let i=0;i<triangles.length;i++){
  const tri=triangles[i];
  if(!Array.isArray(tri)||tri.length!==3||!tri.every(p=>Array.isArray(p)&&p.length===3&&p.every(Number.isFinite)))continue;
  const rendered=projectTri(tri);
  if(!Array.isArray(rendered)||rendered.length!==3)continue;
  const a=rendered[0],b=rendered[1],c=rendered[2];
  if(screen.x<Math.min(a.x,b.x,c.x)-.001||screen.x>Math.max(a.x,b.x,c.x)+.001||
     screen.y<Math.min(a.y,b.y,c.y)-.001||screen.y>Math.max(a.y,b.y,c.y)+.001)continue;
  const weights=barycentric(screen,a,b,c);
  if(!weights)continue;
  const depth=rendered.reduce((s,p)=>s+p.depth,0)/3;
  if(!Number.isFinite(depth)||hit&&depth<=hit.screenDepth)continue;
  const xyz=[0,1,2].map(j=>tri.reduce((sum,p,k)=>sum+p[j]*weights[k],0));
  const eps=Math.max(0.00002,Math.abs(heightScale)*0.000005);
  const horizontal=tri.every(p=>Math.abs(p[2]-tri[0][2])<=eps);
  hit={index:i,xyz,z:xyz[2],horizontal,screenDepth:depth};
 }
 return hit;
}
function faceDepth(face,stockTop,partTop,belowTop=true){
 if(!face||!face.horizontal||!Number.isFinite(face.z))throw Error('Bitte eine waagerechte Modellfläche anklicken.');
 if(!Number.isFinite(stockTop)||!Number.isFinite(partTop)||stockTop<=0)throw Error('Rohteilhöhe ist ungültig.');
 const eps=Math.max(0.00002,stockTop*0.000005);
 if(belowTop&&face.z>=partTop-eps)throw Error('Bitte einen tieferliegenden Taschenboden anklicken, nicht die Oberseite.');
 const depth=stockTop-face.z;
 if(depth<=eps||depth>stockTop+eps)throw Error('Die gewählte Modellfläche liegt außerhalb der zulässigen Frästiefe.');
 return depth;
}
root.FertigungsstudioSurfaceGeometry={pickVisible,faceDepth,barycentric};
if(typeof module==='object'&&module.exports)module.exports=root.FertigungsstudioSurfaceGeometry;
})(typeof globalThis==='object'?globalThis:this);
