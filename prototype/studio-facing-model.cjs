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
 if(width+diameter+((form.strategy==='zigzag'||(form.strategy===undefined&&form.turnMode==='round'))?length/Math.ceil(length/stepover)/2:0)>1_000_000)throw Error('Auslauf außerhalb des Koordinatenbereichs.');
 const strategy=form.strategy;
 const spindle=form.spindle??'M3';
 if(!['M3','M4'].includes(spindle))throw Error('Ungültige Spindelrichtung.');
 if(strategy!==undefined&&!['climb','conventional','zigzag'].includes(strategy))
   throw Error('Ungültige Fräsrichtung.');
 const legacyTurn=form.turnMode??'lift';
 if(!['lift','round'].includes(legacyTurn))throw Error('Ungültige Bahnwechselstrategie.');
 // +Y raster progression; assumes material engagement on +Y side of tool.
 // M3 seen clockwise from above: +Y tooth tangential motion toward +X.
 const turnMode=strategy===undefined?legacyTurn:strategy==='zigzag'?'round'
   :((strategy==='climb')===(spindle==='M3')?'reverse_lift':'lift');
 const depthPasses=Math.ceil(depth/stepdown),rows=Math.ceil(length/stepover)+1;
 const intervals=rows-1;
 const radius=length/intervals/2;
 const turnSegments=turnMode==='round'
   ?Math.max(16,Math.ceil(Math.PI/(2*Math.acos(1-Math.min(1,0.02/radius))))):0;
 const estimatedMoves=depthPasses*(turnMode==='round'
   ?3+rows+intervals*turnSegments:rows*4);
 if(!Number.isFinite(estimatedMoves)||estimatedMoves>100_000)
   throw Error('Zu viele Bahnbewegungen; Zustellung vergrößern.');
 return {
   numbers:[width,length,height,depth,diameter,stepdown,stepover,numberTool,cuttingLength,cuttingFeed,plungeFeed,clearance,...(turnMode==='round'?[1]:turnMode==='reverse_lift'?[2]:[])],
   depthPasses,rows,turnSegments,estimatedMoves,
   start:{x:turnMode==='reverse_lift'?width+diameter:-diameter,y:0,z:height+clearance},
   settings:{toolId:numberTool,depth,stepdown,stepover,clearance,cuttingFeed,plungeFeed,turnMode,strategy:strategy??(turnMode==='round'?'zigzag':'conventional'),spindle},
 };
}

/** Workpiece coordinates of raw-stock-local points. This is numerical only. */
function workFrame(project){
 if(!project||!project.stock)throw Error('Kein Rohteil für Koordinatentransformation.');
 const stock=project.stock;
 const dimensions=[positive(stock.x,'Rohteil X'),positive(stock.y,'Rohteil Y'),positive(stock.z,'Rohteil Z')];
 const origin=project.origin||{x:0,y:0,z:dimensions[2],rotation:0,reverseZ:false};
 const position=[number(origin.x,'Nullpunkt X'),number(origin.y,'Nullpunkt Y'),number(origin.z,'Nullpunkt Z')];
 if(position.some((v,i)=>v<0||v>dimensions[i]))throw Error('Nullpunkt liegt außerhalb des Rohteils.');
 const rotation=number(origin.rotation??0,'Achsdrehung');
 if(![0,90,180,270].includes(rotation))throw Error('Nur XY-Achsdrehungen 0°, 90°, 180° und 270° sind unterstützt.');
 if(typeof(origin.reverseZ??false)!=='boolean')throw Error('Ungültige Z-Richtung.');
 const system=project.wcs||'G54';
 if(!['G54','G55','G56','G57','G58','G59'].includes(system))throw Error('Ungültiges Werkstücknullpunktsystem.');
 const [c,s]={0:[1,0],90:[0,1],180:[-1,0],270:[0,-1]}[rotation];
 return {system,origin_local:position,rotation_degrees:rotation,reverse_z:!!origin.reverseZ,c,s};
}
function toWork(point,frame){
 if(!Array.isArray(point)||point.length!==3||point.some(v=>typeof v!=='number'||!Number.isFinite(v)))throw Error('Ungültige Rohteilkoordinate.');
 const [ox,oy,oz]=frame.origin_local,dx=point[0]-ox,dy=point[1]-oy,dz=point[2]-oz;
 const sign=frame.reverse_z?-1:1;
 const p=[frame.c*dx+frame.s*dy,sign*(-frame.s*dx+frame.c*dy),sign*dz].map(v=>v===0?0:v);
 if(p.some(v=>!Number.isFinite(v)||Math.abs(v)>1_000_000))throw Error('Transformierte Koordinate außerhalb des zulässigen Bereichs.');
 return p;
}
function fromWork(point,frame){
 if(!Array.isArray(point)||point.length!==3||point.some(v=>typeof v!=='number'||!Number.isFinite(v)))throw Error('Ungültige Werkstückkoordinate.');
 const [ox,oy,oz]=frame.origin_local,sign=frame.reverse_z?-1:1;
 const dx=frame.c*point[0]-frame.s*sign*point[1],dy=frame.s*point[0]+frame.c*sign*point[1];
 return [dx+ox,dy+oy,sign*point[2]+oz].map(v=>v===0?0:v);
}
function attachWorkCoordinates(path,project){
 if(!path||!path.stock||!Array.isArray(path.moves)||!Array.isArray(path.start))throw Error('Keine numerische Werkzeugbahn vorhanden.');
 const d=project.stock,measures=[d.x,d.y,d.z];
 if(path.stock.min.some(v=>v!==0)||path.stock.max.some((v,i)=>Math.abs(v-measures[i])>1e-7))
   throw Error('Werkzeugbahn gehört nicht zum eingestellten Rohteil.');
 const f=workFrame(project);
 return {...path,work_coordinates:{system:f.system,origin_local:f.origin_local,rotation_degrees:f.rotation_degrees,reverse_z:f.reverse_z,
   start:toWork(path.start,f),moves:path.moves.map(m=>({to:toWork(m.to,f),motion:m.motion}))}};
}

const api={eligible,recommendedFeed,prepare,workFrame,toWork,fromWork,attachWorkCoordinates};
root.FertigungsstudioFacingModel=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(globalThis);
