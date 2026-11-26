// Verify the always-visible operation launcher in both offline and Rust modes.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

class Element{
  constructor(value=''){this.dataset={};this.textContent='';this.attributes={};this.listeners={};this.classes=new Set();this.classList={
    toggle:(name,enabled)=>enabled?this.classes.add(name):this.classes.delete(name),
  };if(value)this.dataset.camOperation=value;}
  addEventListener(name,handler){this.listeners[name]=handler;}
  click(){this.listeners.click?.();}
  setAttribute(key,value){this.attributes[key]=value;}
}
const kinds=['facing','contour','pocket','drilling'];
const cards=kinds.map(k=>new Element(k));
const status=new Element();
const ribbons=Array.from({length:4},(_,i)=>{const e=new Element();e.dataset.operation=String(i);return e;});
const tree=Array.from({length:4},()=>new Element());
const messages=[];
let lastRibbon=null;
ribbons.forEach((r,i)=>r.listeners.click=()=>{lastRibbon=i;});
const document={
  querySelectorAll(selector){
    if(selector==='[data-cam-operation]')return cards;
    if(selector==='[data-operation]')return ribbons;
    if(selector==='.op')return tree;
    return [];
  },
  querySelector(selector){
    const index=Number(selector.match(/data-operation="(\d)"/)?.[1]);
    return Number.isInteger(index)?ribbons[index]:null;
  },
  getElementById(id){return id==='camRuntimeStatus'?status:null;},
};
const context={document,toast:message=>messages.push(message)};
context.globalThis=context;
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'workbench.js'),'utf8'),context);
assert.equal(cards.length,4);
assert.equal(cards[0].attributes['aria-pressed'],'true');
cards[1].click();
assert.equal(lastRibbon,2);
assert.match(messages.at(-1),/Rust-Berechnung/);
assert.equal(cards[1].attributes['aria-pressed'],'true');
const calls=[];
context.FertigungsstudioCamWorkbench.connect(k=>calls.push(k));
assert.match(status.textContent,/Rust-Livebetrieb/);
assert.equal(status.dataset.live,'true');
cards[2].click();
assert.deepEqual(calls,['pocket']);
assert.equal(cards[2].attributes['aria-pressed'],'true');
assert.equal(cards[0].attributes['aria-pressed'],'false');
context.FertigungsstudioCamWorkbench.highlight('drilling');
assert.equal(cards[3].attributes['aria-pressed'],'true');
console.log('CAM workbench launcher: offline indication, live routing and selection passed.');
