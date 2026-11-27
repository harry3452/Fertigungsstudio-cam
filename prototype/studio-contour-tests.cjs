const assert=require('node:assert/strict');
const model=require('./studio-contour-model.cjs');
const project={stock:{x:120,y:80,z:20,materialId:1},origin:{x:0,y:0,z:20,rotation:0,reverseZ:false},wcs:'G54'};
const tool={id:2,name:'Schaftfräser Ø8',category:'mill',type:'Schaftfräser',diameter:8,cutLength:20};
const form={depth:4,stepdown:2,clearance:6,cuttingFeed:500,plungeFeed:100,marginX:0,marginY:0,side:'outside',direction:'climb',spindle:'M3'};
const out=model.prepare(project,tool,form);
assert.deepEqual(out.numbers,[120,80,20,4,8,2,4,2,20,500,100,6,0,0,0,0]);
assert.deepEqual(out.start,{x:-4,y:-4,z:26});
assert.equal(out.depthPasses,2);
assert.equal(out.estimatedMoves,14);
assert.equal(out.settings.clockwise,false);
assert.equal(model.prepare(project,tool,{...form,direction:'conventional'}).settings.clockwise,true);
assert.equal(model.prepare(project,tool,{...form,spindle:'M4'}).settings.clockwise,true);
const input={...form,side:'inside',marginX:15,marginY:12};
const inner=model.prepare(project,tool,input);
assert.deepEqual(inner.start,{x:19,y:16,z:26});
assert.deepEqual(inner.toolBounds,{minX:19,minY:16,maxX:101,maxY:64});
assert.equal(inner.settings.clockwise,true);
assert.equal(model.prepare(project,tool,{...input,direction:'conventional'}).settings.clockwise,false);
assert.equal(model.prepare(project,tool,{...input,spindle:'M4'}).settings.clockwise,false);
assert.ok(model.eligible(tool));
assert.equal(model.eligible({...tool,type:'Planfräser'}),false);
for(const change of [
 {depth:21},{stepdown:0},{clearance:0},{cuttingFeed:0},{plungeFeed:0},
 {direction:'zigzag'},{side:'invalid'},{spindle:'M6'},
 {marginX:1},{marginY:-1},{depth:Infinity},{cuttingFeed:'NaN'}
]) assert.throws(()=>model.prepare(project,tool,{...form,...change}),Error,JSON.stringify(change));
for(const change of [{marginX:0},{marginY:0},{marginX:57},{marginY:37}])
 assert.throws(()=>model.prepare(project,tool,{...input,...change}),Error);
assert.throws(()=>model.prepare(project,{...tool,diameter:121},form),/außerhalb/);
assert.throws(()=>model.prepare({...project,stock:{...project.stock,x:999999}},tool,form),/außerhalb/);
console.log('2D contour model: cutter-radius offset, inner/outside selection, M3/M4 windings and limits checked.');
