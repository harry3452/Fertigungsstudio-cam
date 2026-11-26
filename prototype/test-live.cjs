// Spawn only our built server, run HTTP checks, always stop the owned process.
const {spawn}=require('node:child_process');
const path=require('node:path');
const {run}=require('./live-server-tests.cjs');
async function main(){
  const binary=path.resolve(__dirname,'../target/debug/examples/preview_server'+(process.platform==='win32'?'.exe':''));
  const child=spawn(binary,['--ephemeral'],{stdio:['ignore','pipe','pipe'],windowsHide:true});
  let diagnostic='';child.stderr.setEncoding('utf8');child.stderr.on('data',s=>{diagnostic=(diagnostic+s).slice(-4000);});
  try {
    const address=await new Promise((resolve,reject)=>{
      let output='';
      const timer=setTimeout(()=>reject(Error('Server startup timeout: '+diagnostic)),15000);
      const finish=(err,url)=>{clearTimeout(timer);err?reject(err):resolve(url);};
      child.once('error',e=>finish(e));child.once('exit',code=>finish(Error('Server exited '+code+': '+diagnostic)));
      child.stdout.setEncoding('utf8');child.stdout.on('data',s=>{
        output=(output+s).slice(-4000);
        const match=output.match(/Fertigungsstudio local preview: (http:\/\/127\.0\.0\.1:\d+\/)/);
        if(match)finish(null,match[1]);
      });
    });
    await run(address);
  } finally {
    if(child.pid&&child.exitCode===null&&!child.killed){
      const stopped=new Promise(resolve=>child.once('exit',resolve));
      child.kill();await stopped;
    }
  }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
