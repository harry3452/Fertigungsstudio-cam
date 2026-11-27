// Testable, browser/Node-shared numerical contract for experimental 3-axis facing.
// Stock-local coordinates (+Z up), NOT a machine or fixture clearance check.
(function(root){
'use strict';
const TYPES=new Set(['Schaftfräser','Planfräser']);
function number(value,label){
  if(value===''||value===null||value===undefined)throw Error(label+' fehlt.');
  const n=Number(value);
  if(!Number.isFinite(n))throw Error(label+' ist keine gültige Zahl.');
  return n;
}
function positive(value,label){
  const n=number(value,label);
  if(n<=0||n>1_000_000)throw Error(label+' muss größer als 0 und höchstens 1.000.000 sein.');
  return n;
}
function eligible(tool){
 return !!tool&&tool.category==='mill'&&TYPES.has(tool.type)
  &&Number.isFinite(Number(tool.diameter))&&Number(tool.diameter)>0
  &&Number.isFinite(Number(tool.cutLength))&&Number(tool.cutLength)>0;
}
function recommendedFeed(tool,materialId){
 if(!eligible(tool))return null;
 const p=tool.profiles?.[materialId];
 if(!p)return null;
 const vc=Number(p.vc),fz=Number(p.feed),teeth=Number(tool.teeth),d=Number(tool.diameter);
 if(![vc,fz,teeth,d].every(Number.isFinite)||vc<=0||fz<=0||teeth<=0||d<=0)return null;
 const rpm=1000*vc/(Math.PI*d),feed=rpm*fz*teeth;
 if(!Number.isFinite(feed)||feed<=0||feed>1_000_000)return null;
 return {rpm,feed};
}
function prepare(project,tool,form){
 if(!project||!project.stock)throw Error('Rohteil im Setup fehlt.');
 if(!eligible(tool))throw Error('Nur Schaft- oder Planfräser mit gültiger Geometrie unterstützt.');
 const stock=project.stock;
 const width=positive(stock.x,'Rohteil X');
 const length=positive(stock.y,'Rohteil Y');
 const height=positive(stock.z,'Rohteil Z');
 const diameter=positive(tool.diameter,'Werkzeugdurchmesser');
 const cuttingLength=positive(tool.cutLength,'Schneidenlänge');
 const numberTool=number(tool.id,'Werkzeugnummer');
 if(!Number.isInteger(numberTool)||numberTool<1||numberTool>9999)throw Error('Werkzeugnummer muss ganzzahlig zwischen 1 und 9999 sein.');
 const depth=positive(form.depth,'Abtragstiefe');
 const stepdown=positive(form.stepdown,'Tiefenzustellung');
 const stepover=positive(form.stepover,'Seitliche Zustellung');
 const clearance=positive(form.clearance,'Sicherheitshöhe über Rohteil');
 const cuttingFeed=positive(form.cuttingFeed,'Schnittvorschub');
 const plungeFeed=positive(form.plungeFeed,'Eintauchvorschub');
 if(depth>height)throw Error('Abtragstiefe überschreitet die Rohteilhöhe.');
 if(depth>cuttingLength)throw Error('Abtragstiefe überschreitet die Schneidenlänge.');
 if(stepover>diameter/2)throw Error('Seitliche Zustellung darf höchstens der halbe Werkzeugdurchmesser sein.');
 if(height+clearance>1_000_000)throw Error('Sicherheitshöhe liegt außerhalb des Koordinatenbereichs.');
 if(width+diameter>1_000_000)throw Error('Auslauf außerhalb des Koordinatenbereichs.');
 const depthPasses=Math.ceil(depth/stepdown),rows=Math.ceil(length/stepover)+1;
 if(!Number.isFinite(depthPasses)||!Number.isFinite(rows)||depthPasses*rows*4>100_000)
   throw Error('Zu viele Bahnbewegungen; Zustellung vergrößern.');
 return {
   numbers:[width,length,height,depth,diameter,stepdown,stepover,numberTool,cuttingLength,cuttingFeed,plungeFeed,clearance],
   depthPasses,rows,
   start:{x:-diameter,y:0,z:height+clearance},
   settings:{toolId:numberTool,depth,stepdown,stepover,clearance,cuttingFeed,plungeFeed},
 };
}
const api={eligible,recommendedFeed,prepare};
root.FertigungsstudioFacingModel=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(globalThis);
