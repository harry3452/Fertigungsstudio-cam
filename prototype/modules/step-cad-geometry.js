/* Exact STEP B-Rep face and wire identifiers from Open CASCADE; sampled screen
 * polylines are approximations for the current 2.5D path preview. Apache-2.0. */
(function(root){'use strict';
const geo=root.FertigungsstudioMeshGeometry;
if(!geo)return;
const area=pts=>geo.area(pts);
const contains=(pts,p)=>geo.contains(pts,p);
function locate(topology,modelSize,stock,placement){
 const {dims,shifts}=geo.validatePlacement(modelSize,stock,placement);
 const translate=p=>p.map((v,i)=>v+shifts[i]);
 const faces=topology.faces.map(f=>({...f,z:f.z==null?null:f.z+shifts[2],
   triangles:f.triangles.map(t=>t.map(translate))}));
 // Keep every B-Rep wire for visual display, including vertical and curved edges.
 // A separate subset is used for safe horizontal 2.5D machining selection.
 const displayWires=topology.wires.filter(w=>w.points.length>=2).map(w=>({
  id:w.id,faceId:w.faceId,points:w.points.map(translate),
  horizontal:w.horizontal,edgeIds:w.edgeIds.slice()
 }));
 const wires=[];
 for(const w of topology.wires){
  if(!w.horizontal||w.points.length<3||w.points.length>2048)continue;
  const verts=w.points.map(translate),pts=verts.map(v=>v.slice(0,2));
  if(Math.abs(area(pts))<=1e-8)continue;
  const parent=topology.faces.find(f=>f.id===w.faceId);
  if(!parent)continue; // Horizontal ring may bound an adjacent curved/vertical CAD face.
  const sibling=topology.wires.filter(other=>other.faceId===w.faceId&&other.id!==w.id&&other.horizontal&&other.points.length>=3);
  let depth=0;
  for(const other of sibling){
   if(contains(other.points.map(v=>v.slice(0,2)),w.points[0].slice(0,2)))depth++;
  }
  // Preserve exact analytical circle values for direct bore selection.
  const circular=w.segments.length>0&&w.segments.every(s=>s.kind==='circle'&&s.center&&Number.isFinite(s.radius)&&s.radius>0);
  const first=w.segments[0];
  const same=circular&&w.segments.every(s=>Math.abs(s.radius-first.radius)<1e-5&&
    Math.hypot(...s.center.map((n,i)=>n-first.center[i]))<1e-5);
  const analyticCircle=same?{center:translate(first.center),radius:first.radius}:null;
  wires.push({id:'step-'+w.id,cadWireId:w.id,cadFaceId:w.faceId,analyticCircle,
   side:depth%2?'inside':'outside',points:pts,z:w.z+shifts[2],
   curveTypes:w.segments.map(s=>s.kind),edgeIds:w.edgeIds.slice()});
 }
 const triangles=[],owners=[];
 for(const f of faces)for(const tri of f.triangles){triangles.push(tri);owners.push(f);}
 return {faces,wires,displayWires,triangles,owners,dims,shifts};
}
function faceContainsPoint(face,p){
 if(face.z==null||Math.abs(face.z-p[2])>0.0001)return false;
 for(const t of face.triangles){
  const [a,b,c]=t,den=(b[0]-a[0])*(c[1]-a[1])-(c[0]-a[0])*(b[1]-a[1]);
  if(Math.abs(den)<1e-12)continue;
  const u=((p[0]-a[0])*(c[1]-a[1])-(p[1]-a[1])*(c[0]-a[0]))/den;
  const v=((b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]))/den;
  if(u>=-0.00001&&v>=-0.00001&&u+v<=1.00001)return true;
 }
 return false;
}
root.FertigungsstudioCADGeometry={locate,faceContainsPoint};
if(typeof module==='object'&&module.exports)module.exports=root.FertigungsstudioCADGeometry;
})(globalThis);
