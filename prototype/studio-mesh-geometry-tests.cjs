const assert=require('node:assert/strict');
const geo=require('./studio-mesh-geometry.cjs');
function binary(triangles){
 const ab=new ArrayBuffer(84+triangles.length*50),d=new DataView(ab);
 d.setUint32(80,triangles.length,true);
 triangles.forEach((t,i)=>t.forEach((p,j)=>p.forEach((x,k)=>d.setFloat32(84+i*50+12+j*12+k*4,x,true))));
 return ab;
}
const outer=[[0,0,2],[20,0,2],[20,20,2],[0,20,2]];
const inner=[[5,5,2],[15,5,2],[15,15,2],[5,15,2]];
const triangles=[];
for(let i=0;i<4;i++){
 const n=(i+1)%4;
 triangles.push([outer[i],outer[n],inner[n]],[outer[i],inner[n],inner[i]]);
}
const mesh=geo.parse(binary(triangles));
assert.equal(mesh.triangles.length,8);
assert.deepEqual(mesh.size,[20,20,0]);
assert.equal(mesh.loops.length,2);
assert.equal(mesh.loops[0].side,'outside');
assert.equal(mesh.loops[1].side,'inside');
assert.equal(mesh.loops[0].points.length,4);
assert.equal(mesh.loops[1].points.length,4);
const moved=geo.locate(mesh,{x:40,y:40,z:10});
assert.equal(moved.loops.length,2);
assert.ok(moved.loops[0].points.every(v=>v[0]>=10&&v[0]<=30));
assert.throws(()=>geo.locate(mesh,{x:12,y:40,z:10}),/passt nicht/);
const ascii='solid part\n'+triangles.map(t=>'facet normal 0 0 1\n outer loop\n'+t.map(p=>'vertex '+p.join(' ')).join('\n')+'\n endloop\nendfacet').join('\n')+'\nendsolid part';
const asciiBuffer=new TextEncoder().encode(ascii).buffer;
const asciiMesh=geo.parse(asciiBuffer);
assert.equal(asciiMesh.loops.length,2);
assert.throws(()=>geo.parse(new ArrayBuffer(12)),/keine|Keine/);
const fitted=geo.fitStock(mesh);
assert.deepEqual(fitted.stock,{x:20,y:20,z:1});
assert.deepEqual(fitted.position,{x:0,y:0,z:1});
const fittedGeo=geo.locate(mesh,fitted.stock,fitted.position);
assert.equal(fittedGeo.partTopZ,1);
const placed=geo.locate(mesh,{x:35,y:40,z:12},{x:2,y:9,z:5});
assert.deepEqual(placed.loops[0].points[0].map(v=>Math.round(v)),[2,9]);
assert.equal(placed.partTopZ,5);
assert.throws(()=>geo.locate(mesh,{x:25,y:20,z:12},{x:6,y:0,z:1}),/außerhalb/);
assert.throws(()=>geo.locate(mesh,{x:35,y:40,z:12},{x:-1,y:0,z:1}),/außerhalb/);
assert.throws(()=>geo.locate(mesh,{x:35,y:40,z:12},{x:0,y:0,z:NaN}),/außerhalb/);
console.log('Mesh import: ASCII/binary STL, real horizontal top-face loops, holes and stock placement verified.');
