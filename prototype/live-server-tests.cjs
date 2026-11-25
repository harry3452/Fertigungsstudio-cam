// Run against the printed preview_server URL; leaves no persistent data.
const assert=require('node:assert/strict');
const http=require('node:http');
const {validate}=require('./core-path-data.cjs');
async function run(){
const base=new URL(process.argv[2]);
if(base.hostname!=='127.0.0.1')throw Error('Local preview URL required');
function request(path,method='GET',body='',headers={}){return new Promise((resolve,reject)=>{
const req=http.request(new URL(path,base),{method,headers:{'Content-Length':Buffer.byteLength(body),...headers}},res=>{let text='';res.setEncoding('utf8');res.on('data',s=>text+=s);res.on('end',()=>resolve({status:res.statusCode,text}));});req.setTimeout(5000,()=>req.destroy(Error('timeout')));req.on('error',reject);req.end(body);
});}
const page=await request('/');assert.equal(page.status,200);assert.ok(page.text.includes('Live-Planfräsen'));
const headers={Origin:base.origin,'Content-Type':'application/x-fertigungsstudio'};
const good=await request('/api/facing','POST','20 10 5 2.5 6 1 3',headers);assert.equal(good.status,200);assert.equal(validate(JSON.parse(good.text)).moves.length,60);
assert.equal((await request('/api/facing','POST','20 10 5 -1 6 1 3',headers)).status,422);
assert.equal((await request('/api/facing','POST','20 10 5 2.5 6 1 3')).status,403);
assert.equal((await request('/api/facing','POST','20 10 5 2.5 6 1 3',{...headers,Origin:'https://example.invalid'})).status,403);
assert.equal((await request('/api/facing','POST','20 10 5 2.5 6 1 3',{...headers,Host:'evil.invalid'})).status,403);
assert.equal((await request('/api/cancel','POST','',headers)).status,200);
console.log('Live HTTP checks passed: page, valid path, invalid depth, missing/foreign origin, wrong host, cancellation endpoint.');
}
run().catch(e=>{console.error(e);process.exitCode=1;});
