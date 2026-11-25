// Run against the printed preview_server URL; leaves no persistent data.
const assert=require('node:assert/strict');
const http=require('node:http');
const {validate}=require('./core-path-data.cjs');
async function run(address=process.argv[2]){
const base=new URL(address);
if(base.hostname!=='127.0.0.1')throw Error('Local preview URL required');
function request(path,method='GET',body='',headers={}){return new Promise((resolve,reject)=>{
const req=http.request(new URL(path,base),{method,headers:{'Content-Length':Buffer.byteLength(body),...headers}},res=>{let text='';res.setEncoding('utf8');res.on('data',s=>text+=s);res.on('end',()=>resolve({status:res.statusCode,text}));});req.setTimeout(5000,()=>req.destroy(Error('timeout')));req.on('error',reject);req.end(body);
});}
const page=await request('/');assert.equal(page.status,200);assert.ok(page.text.includes('Live-Planfräsen'));
assert.ok(page.text.includes('Eigene Werkzeugbibliothek'));
for(const match of page.text.matchAll(/<script>([\s\S]*?)<\/script>/g))new(require('node:vm').Script)(match[1]);
const headers={Origin:base.origin,'Content-Type':'application/x-fertigungsstudio'};
const good=await request('/api/facing','POST','20 10 5 2.5 6 1 3',headers);assert.equal(good.status,200);assert.equal(validate(JSON.parse(good.text)).moves.length,60);
const configured=await request('/api/facing','POST','20 10 5 2.5 6 1 3 7 10 650 90',headers);assert.equal(configured.status,200);const toolData=validate(JSON.parse(configured.text));assert.equal(toolData.tool_number,7);assert.equal(toolData.cutting_feed,650);assert.equal(toolData.plunge_feed,90);
assert.equal((await request('/api/facing','POST','20 10 5 2.5 6 1 3 7 1 650 90',headers)).status,422);
assert.equal((await request('/api/facing','POST','20 10 5 2.5 6 1 3 7.5 10 650 90',headers)).status,422);
assert.equal((await request('/api/facing','POST','20 10 5 -1 6 1 3',headers)).status,422);
assert.equal((await request('/api/facing','POST','20 10 5 2.5 6 1 3')).status,403);
assert.equal((await request('/api/facing','POST','20 10 5 2.5 6 1 3',{...headers,Origin:'https://example.invalid'})).status,403);
assert.equal((await request('/api/facing','POST','20 10 5 2.5 6 1 3',{...headers,Host:'evil.invalid'})).status,403);
assert.equal((await request('/api/cancel','POST','',headers)).status,200);
assert.equal((await request('/api/facing','POST','20 10 5 2.5 6 1 1e-300',headers)).status,422);
assert.equal((await request('/api/unknown','POST','',headers)).status,404);
// A bounded parser can close with unread oversized input: Windows may report
// a reset instead of delivering the 400 response. Either must reject the input.
try { assert.equal((await request('/api/facing','POST','1'.repeat(1025),headers)).status,400); }
catch(e) { if(e.code!=='ECONNRESET')throw e; }
console.log('Live HTTP checks passed: page, valid path, invalid depth, missing/foreign origin, wrong host, cancellation endpoint.');
}
module.exports={run};
if(require.main===module)run().catch(e=>{console.error(e);process.exitCode=1;});
