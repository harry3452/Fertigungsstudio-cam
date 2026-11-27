// Pure 2D inspection model for validated neutral Rust toolpaths.
// This module never generates toolpaths, NC instructions or machine commands.
(function(root){
'use strict';
function finite(n){return typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=1e6}
function point(p){return Array.isArray(p)&&p.length===3&&p.every(finite)}
function check(d){
 if(!d||!d.stock||!point(d.stock.min)||!point(d.stock.max)||!point(d.start)
  ||!Array.isArray(d.moves)||!d.moves.length||d.moves.length>100000)throw Error('Keine gültige berechnete Werkzeugbahn.');
 if(!d.stock.min.every((v,i)=>v<d.stock.max[i]))throw Error('Ungültiger Rohblock.');
}
function category(from,m){
 if(m.motion==='rapid')return 'rapid';
 return Math.abs(m.to[2]-from[2])>1e-9?'lead':'cut';
}
function depths(data){
 check(data);
 const found=new Set();let from=data.start;
 for(const move of data.moves){
  if(!move||!point(move.to)||!['rapid','feed'].includes(move.motion))throw Error('Ungültige Bahnbewegung.');
  if(category(from,move)==='cut')found.add(move.to[2]);
  from=move.to;
 }
 return [...found].sort((a,b)=>b-a);
}
function plot(data,depth=null){
 check(data);
 if(depth!==null&&!finite(depth))throw Error('Ungültige Tiefenlage.');
 let minX=data.stock.min[0],maxX=data.stock.max[0],minY=data.stock.min[1],maxY=data.stock.max[1];
 for(const p of [data.start,...data.moves.map(m=>m.to)]){
  if(!point(p))throw Error('Ungültiger Bahnpunkt.');
  minX=Math.min(minX,p[0]);maxX=Math.max(maxX,p[0]);
  minY=Math.min(minY,p[1]);maxY=Math.max(maxY,p[1]);
 }
 const segments=[],counts={rapid:0,lead:0,cut:0},zTol=1e-7;
 let from=data.start;
 for(let i=0;i<data.moves.length;i++){
  const move=data.moves[i],kind=category(from,move),isDepth=depth===null||
    (kind==='cut'&&Math.abs(move.to[2]-depth)<zTol)||
    (kind==='lead'&&Math.abs(move.to[2]-depth)<zTol);
  if(isDepth&&(depth===null||kind!=='rapid')){
   segments.push({from,to:move.to,kind,index:i});
   counts[kind]++;
  }
  from=move.to;
 }
 return {stock:{min:data.stock.min,max:data.stock.max},bounds:{minX,maxX,minY,maxY},segments,counts,total:data.moves.length,depth};
}
function fit(bounds,width,height,pad=36){
 if(!finite(width)||!finite(height)||width<80||height<80||!finite(pad)||pad<0)throw Error('Ungültige Anzeigefläche.');
 const spanX=bounds.maxX-bounds.minX,spanY=bounds.maxY-bounds.minY;
 if(!(spanX>0&&spanY>0))throw Error('Keine Ausdehnung der Werkzeugbahn.');
 const scale=Math.min((width-2*pad)/spanX,(height-2*pad)/spanY);
 if(!(scale>0))throw Error('Anzeigefläche zu klein.');
 const x0=(width-spanX*scale)/2,y0=(height-spanY*scale)/2;
 return (p)=>({x:x0+(p[0]-bounds.minX)*scale,y:height-y0-(p[1]-bounds.minY)*scale});
}
const api={category,depths,plot,fit};
root.FertigungsstudioPathOverview=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(globalThis);
