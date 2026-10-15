import {spawn} from 'node:child_process';
import {spawnSync} from 'node:child_process';

// Apply pending Railway SQL migrations before serving traffic (idempotent).
const migrate = spawnSync(process.execPath, ['scripts/migrate.mjs'], {
  stdio: 'inherit',
  windowsHide: true,
  env: process.env,
});
if (migrate.status) {
  console.error('Database migration failed; refusing to start.');
  process.exit(migrate.status);
}

const app=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','0.0.0.0'],{stdio:'inherit',windowsHide:true});
let running=false;
const timer=setInterval(async()=>{
  if(running||!process.env.WORKSPACE_SIGNING_KEY)return;
  running=true;
  try{const response=await fetch(`http://127.0.0.1:${process.env.PORT||3000}/api/internal/maintenance`,{method:'POST',headers:{Authorization:`Bearer ${process.env.WORKSPACE_SIGNING_KEY}`},signal:AbortSignal.timeout(180000)});if(!response.ok)console.error('Maintenance will retry:',response.status);}catch{console.error('Maintenance temporarily unavailable; will retry.');}finally{running=false;}
},60000);
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{clearInterval(timer);app.kill(signal);});
app.on('exit',code=>{clearInterval(timer);process.exitCode=code||0;});
