const assert=require('node:assert/strict');
const {eligible,recommendedFeed,prepare}=require('./studio-facing-model.cjs');
const tool={id:12,name:'Schaftfräser Ø10',category:'mill',type:'Schaftfräser',diameter:10,cutLength:20,teeth:4,profiles:{1:{vc:'100',feed:'0.05'}}};
const project={stock:{x:120,y:80,z:20,materialId:1}};
const form={depth:0.5,stepdown:0.25,stepover:5,clearance:7,cuttingFeed:600,plungeFeed:120};
const result=prepare(project,tool,form);
assert.deepEqual(result.numbers,[120,80,20,0.5,10,0.25,5,12,20,600,120,7]);
assert.deepEqual(result.start,{x:-10,y:0,z:27});
assert.equal(result.depthPasses,2);
assert.equal(result.rows,17);
assert.equal(result.settings.toolId,12);
assert.ok(eligible(tool));
assert.equal(eligible({...tool,type:'Kugelfräser'}),false);
assert.equal(eligible({...tool,category:'turn'}),false);
assert.equal(eligible({...tool,cutLength:0}),false);
const feeds=recommendedFeed(tool,1);
assert.ok(Math.abs(feeds.rpm-10000/Math.PI)<1e-8);
assert.ok(Math.abs(feeds.feed-feeds.rpm*.2)<1e-8);
assert.equal(recommendedFeed({...tool,profiles:{}},1),null);
for(const change of [
 {depth:21},{depth:20.5},{stepdown:0},{stepover:5.1},{clearance:0},
 {cuttingFeed:''},{cuttingFeed:-1},{plungeFeed:0},{depth:'NaN'},{depth:Infinity},
 {stepdown:1e-300},{stepover:1e-300},
]){
 assert.throws(()=>prepare(project,tool,{...form,...change}),Error,JSON.stringify(change));
}
assert.throws(()=>prepare(project,{...tool,id:2.1},form),/Werkzeugnummer/);
assert.throws(()=>prepare(project,{...tool,category:'turn'},form),/Schaft- oder Planfräser/);
assert.throws(()=>prepare({...project,stock:{...project.stock,z:1}},tool,{...form,depth:2}),/Rohteilhöhe/);
assert.throws(()=>prepare(project,{...tool,cutLength:0.1},form),/Schneidenlänge/);
assert.throws(()=>prepare({...project,stock:{...project.stock,x:999995}},tool,form),/Auslauf/);

const m=require('./studio-facing-model.cjs');
const frameProject={stock:{x:120,y:80,z:20},origin:{x:12,y:34,z:20,rotation:0,reverseZ:false},wcs:'G55'};
for(const angle of [0,90,180,270])for(const flipped of [false,true]){
 const f=m.workFrame({...frameProject,origin:{...frameProject.origin,rotation:angle,reverseZ:flipped}});
 const p=[11,44,25],work=m.toWork(p,f);
 assert.deepEqual(m.fromWork(work,f),p);
 const X=[f.c,f.s,0],Y=[-f.s*(flipped?-1:1),f.c*(flipped?-1:1),0],Z=[0,0,flipped?-1:1];
 const cross=[X[1]*Y[2]-X[2]*Y[1],X[2]*Y[0]-X[0]*Y[2],X[0]*Y[1]-X[1]*Y[0]].map(v=>v===0?0:v);
 assert.deepEqual(cross,Z); // right-handed even for reversed Z
}
const frame=m.workFrame(frameProject);
assert.deepEqual(m.toWork([0,0,20],frame),[-12,-34,0]);
assert.deepEqual(m.toWork([0,0,27],frame),[-12,-34,7]);
const rotated=m.workFrame({...frameProject,origin:{x:0,y:0,z:20,rotation:90,reverseZ:false}});
assert.deepEqual(m.toWork([20,10,15],rotated),[10,-20,-5]);
const reversed=m.workFrame({...frameProject,origin:{x:0,y:0,z:20,rotation:0,reverseZ:true}});
assert.deepEqual(m.toWork([20,10,25],reversed),[20,-10,-5]);
assert.throws(()=>m.workFrame({...frameProject,origin:{...frameProject.origin,x:121}}),/außerhalb/);
assert.throws(()=>m.workFrame({...frameProject,origin:{...frameProject.origin,rotation:45}}),/XY-Achsdrehungen/);
assert.throws(()=>m.workFrame({...frameProject,wcs:'G60'}),/Werkstücknullpunktsystem/);
assert.throws(()=>m.workFrame({...frameProject,origin:{...frameProject.origin,reverseZ:'yes'}}),/Z-Richtung/);
const raw={stock:{min:[0,0,0],max:[120,80,20]},start:[-10,0,27],moves:[{to:[-10,0,19],motion:'feed'},{to:[130,0,19],motion:'feed'}]};
const enhanced=m.attachWorkCoordinates(raw,frameProject);
assert.notEqual(enhanced,raw);
assert.deepEqual(enhanced.work_coordinates.start,[-22,-34,7]);
assert.deepEqual(enhanced.work_coordinates.moves[1].to,[118,-34,-1]);
assert.equal(enhanced.work_coordinates.system,'G55');
assert.throws(()=>m.attachWorkCoordinates({...raw,stock:{min:[0,0,0],max:[119,80,20]}},frameProject),/nicht zum eingestellten/);

console.log('Facing model checks: geometry, setup/tool mapping, feed formula, limits and invalid inputs passed.');
