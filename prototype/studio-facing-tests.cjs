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
console.log('Facing model checks: geometry, setup/tool mapping, feed formula, limits and invalid inputs passed.');
