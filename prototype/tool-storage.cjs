// Versioned, bounded browser-local tool storage. Not project data or machine setup.
(function(root){
const KEY='fertigungsstudio.tools.v1';
function validate(tool){
 if(!tool||!Number.isInteger(tool.number)||tool.number<1||tool.number>9999)throw Error('Werkzeugnummer muss zwischen 1 und 9999 liegen.');
 if(typeof tool.name!=='string'||!tool.name.trim()||[...tool.name].length>80||/[\u0000-\u001f\u007f-\u009f]/u.test(tool.name))throw Error('Werkzeugname ungültig (1–80 Zeichen).');
 for(const key of ['diameter','cuttingLength','cuttingFeed','plungeFeed'])if(typeof tool[key]!=='number'||!Number.isFinite(tool[key])||tool[key]<=0||tool[key]>1000000)throw Error('Werkzeugmaße und Vorschübe müssen positiv und endlich sein.');
 return {number:tool.number,name:tool.name.trim(),diameter:tool.diameter,cuttingLength:tool.cuttingLength,cuttingFeed:tool.cuttingFeed,plungeFeed:tool.plungeFeed};
}
function load(storage){
 const raw=storage.getItem(KEY);if(raw===null)return [];
 if(raw.length>100000)throw Error('Gespeicherte Werkzeugliste zu groß.');
 const data=JSON.parse(raw);if(!data||data.version!==1||!Array.isArray(data.tools)||data.tools.length>64)throw Error('Unbekanntes Werkzeugformat.');
 const tools=data.tools.map(validate);if(new Set(tools.map(t=>t.number)).size!==tools.length)throw Error('Doppelte Werkzeugnummer in gespeicherter Liste.');
 return tools.sort((a,b)=>a.number-b.number);
}
function save(storage,tools){
 if(!Array.isArray(tools)||tools.length>64)throw Error('Maximal 64 eigene Werkzeuge.');
 const clean=tools.map(validate).sort((a,b)=>a.number-b.number);
 if(new Set(clean.map(t=>t.number)).size!==clean.length)throw Error('Doppelte Werkzeugnummer.');
 storage.setItem(KEY,JSON.stringify({version:1,tools:clean}));return clean;
}
root.CamToolStorage={validate,load,save};if(typeof module!=='undefined')module.exports=root.CamToolStorage;
})(globalThis);
