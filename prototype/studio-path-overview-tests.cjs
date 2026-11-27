const assert=require('node:assert/strict');
const {category,depths,plot,fit}=require('./studio-path-overview.cjs');
const data={
 stock:{min:[0,0,0],max:[20,10,5]},
 start:[-5,0,10],
 moves:[
 {to:[-5,0,10],motion:'rapid'},
 {to:[-5,0,4],motion:'feed'},
 {to:[25,0,4],motion:'feed'},
 {to:[25,0,10],motion:'rapid'},
 {to:[-5,5,10],motion:'rapid'},
 {to:[-5,5,3],motion:'feed'},
 {to:[25,5,3],motion:'feed'},
 {to:[25,5,10],motion:'rapid'},
 ]
};
assert.equal(category([-5,0,10],data.moves[0]),'rapid');
assert.equal(category([-5,0,10],data.moves[1]),'lead');
assert.equal(category([-5,0,4],data.moves[2]),'cut');
assert.deepEqual(depths(data),[4,3]);
const all=plot(data);
assert.equal(all.segments.length,8);
assert.deepEqual(all.counts,{rapid:4,lead:2,cut:2});
assert.deepEqual(all.bounds,{minX:-5,maxX:25,minY:0,maxY:10});
const only4=plot(data,4);
assert.equal(only4.segments.length,2);
assert.deepEqual(only4.counts,{rapid:0,lead:1,cut:1});
assert.equal(only4.segments[1].index,2);
const p=fit(all.bounds,600,400,40);
assert.ok(p([-5,0,10]).x>=40);
assert.ok(p([25,10,0]).x<=560);
assert.ok(p([0,0,0]).y>p([0,10,0]).y);
assert.throws(()=>plot({...data,moves:[]}),/Keine gültige/);
assert.throws(()=>depths({...data,moves:[{to:[2,3,NaN],motion:'feed'}]}),/Ungültige/);
assert.throws(()=>plot(data,Infinity),/Tiefenlage/);
assert.throws(()=>fit(all.bounds,0,100),/Anzeigefläche/);
const real=require('./rust-facing-demo.json');
const preview=plot(real);
assert.equal(preview.total,168);
assert.equal(preview.counts.cut,42);
assert.equal(preview.counts.lead,42);
assert.equal(preview.counts.rapid,84);
assert.deepEqual(depths(real),[11,10]);
assert.equal(plot(real,10).counts.cut,21);
console.log('Real path 2D view: complete Rust segments, depth filtering, auto-fit and move colors verified.');
