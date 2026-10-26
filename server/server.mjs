import http from 'node:http';
import {createReadStream} from 'node:fs';
import {readFile,writeFile,appendFile,mkdir,stat,realpath} from 'node:fs/promises';
import {homedir} from 'node:os';
import {resolve,extname,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {randomBytes,createHmac,timingSafeEqual} from 'node:crypto';
import {createRecognizer,validateImage} from './recognizer.mjs';
import {createLocalRecognizer} from './local-recognizer.mjs';
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../app');
const MAX_BODY=2900000;
// Bug reports go to the Relay daemon on this machine, which keeps the rolling recording (~/.relay/recordings)
// and starts the agent session; the desktop token is the owner's own device token there.
const MATH_MODE_REPO='/Users/work/Projects/math-mode-keyboard',RELAY_REPO='/Users/work/Projects/Personal/relay';
export function relayLink(base=process.env.RELAY_URL||'http://127.0.0.1:7373',tokenFile=resolve(homedir(),'.relay/desktop-token')){let token;return {base,token:async()=>token??=(await readFile(tokenFile,'utf8')).trim()};}
export function bugPrompt({text,client,at,page,viewport,app}){
  const lines=['Math Mode bug, reported from '+(app?'the iPhone app':'the web')+(page?' on '+page:'')+(viewport?' ('+viewport+')':'')+':','',text.trim(),''];
  if(client&&at)lines.push('Start with the recording, before reading code:','','```bash','node '+RELAY_REPO+'/daemon/src/cli/recording.ts latest --client '+client+' --at '+at+' --out .artifacts/bug-recording/'+at,'```','','- Read `timeline.md`: the numbered steps in the 3 minutes before the bug (T0).','- Open `frames/NN_T0_BUG.png`: the screen when the bug button was tapped.','- Reproduce it with Playwright at the recording\'s viewport, then fix it in a worktree with a test and land it.','');
  else lines.push('No recording came with this report (the recorder was not running on that page).','');
  return lines.join('\n').trimEnd();
}
const bugTitle=text=>{const line=text.trim().split('\n')[0].replace(/\s+/g,' ');return 'Math Mode bug: '+(line.length>48?line.slice(0,47)+'…':line);};
const equal=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json','.woff2':'font/woff2','.txt':'text/plain; charset=utf-8'};
export function createServer({token,recognize,careful,root=ROOT,secureCookies=true,perHour=600,relay=relayLink(),traceDir=process.env.MATH_MODE_TRACE_DIR||resolve(homedir(),'.local/share/math-mode/traces')}={}){
  if(!token||!recognize)throw new Error('Recognition server needs private configuration');
  let active=0,budget=[],traces=[],bugs=[];const attempts=new Map();
  const sign=s=>createHmac('sha256',token).update(s).digest('hex');
  function authorized(req){const raw=req.headers.cookie?.split(';').map(s=>s.trim()).find(s=>s.startsWith('mathModeAccess='))?.slice(15);if(!raw)return false;const parts=raw.split('.');return parts.length===3&&Number(parts[0])>Date.now()&&Number(parts[0])<Date.now()+31*86400000&&equal(parts[2],sign(parts.slice(0,2).join('.')));}
  function json(res,status,data,headers={}){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers});res.end(JSON.stringify(data));}
  async function body(req){if(!req.headers['content-type']?.startsWith('application/json'))throw new Error('JSON required');if(Number(req.headers['content-length'])>MAX_BODY)throw new Error('Request too large');let size=0,chunks=[];for await(const chunk of req){size+=chunk.length;if(size>MAX_BODY)throw new Error('Request too large');chunks.push(chunk);}return JSON.parse(Buffer.concat(chunks).toString());}
  const server=http.createServer(async(req,res)=>{
    res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Content-Type-Options','nosniff');
    try{
      const url=new URL(req.url,'http://localhost');
      if(url.pathname.startsWith('/api/')){
        if(req.headers.origin){let origin;try{origin=new URL(req.headers.origin).host;}catch{}if(origin!==req.headers.host)return json(res,403,{error:'Origin not allowed'});}
        if(req.method==='GET'&&url.pathname==='/api/status')return json(res,200,{recognition:true,authorized:authorized(req),provider:recognize.provider||'Anthropic',careful:!!careful,carefulProvider:careful?.provider||null});
        // Trig wheel drag traces (finger positions only), sent after a drag answer reads wrong, to debug turning on real phones.
        if(req.method==='POST'&&url.pathname==='/api/trace'){
          const now=Date.now();traces=traces.filter(t=>now-t<3600000);if(traces.length>=120)return json(res,429,{error:'Too many traces'});
          if(Number(req.headers['content-length'])>65536)return json(res,413,{error:'Trace too large'});
          const data=await body(req);if(!Array.isArray(data.trace)||data.trace.length>2000)return json(res,400,{error:'Bad trace'});traces.push(now);
          await mkdir(traceDir,{recursive:true});await appendFile(resolve(traceDir,'wheel.jsonl'),JSON.stringify({at:new Date(now).toISOString(),ua:String(req.headers['user-agent']||'').slice(0,200),...data})+'\n');
          return json(res,200,{ok:true});
        }
        // The rolling bug recording: rrweb chunks from the owner's own browser, passed to Relay unchanged.
        if(req.method==='POST'&&url.pathname==='/api/recording'){
          if(!authorized(req))return json(res,403,{error:'Recording is for the owner only'});
          if(Number(req.headers['content-length'])>16<<20)return json(res,413,{error:'Chunk too large'});
          let size=0,chunks=[];for await(const chunk of req){size+=chunk.length;if(size>16<<20)return json(res,413,{error:'Chunk too large'});chunks.push(chunk);}
          try{const r=await fetch(relay.base+'/api/recording'+url.search,{method:'POST',headers:{authorization:'Bearer '+await relay.token(),'content-type':req.headers['content-type']||'application/json'},body:Buffer.concat(chunks),signal:AbortSignal.timeout(20000)});return json(res,r.ok?200:502,{ok:r.ok});}
          catch{return json(res,502,{error:'Relay unavailable'});}
        }
        // The bug button: starts a Relay session in this repo with the report and where the recording is.
        if(req.method==='POST'&&url.pathname==='/api/bug'){
          if(!authorized(req))return json(res,403,{error:'Bug reports are for the owner only'});
          const now=Date.now();bugs=bugs.filter(t=>now-t<3600000);if(bugs.length>=20)return json(res,429,{error:'Too many reports this hour'});
          const data=await body(req),text=typeof data.text==='string'?data.text.slice(0,4000):'';if(!text.trim())return json(res,400,{error:'Say what went wrong'});
          const id=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{4,64}$/.test(v)?v:null,at=Number.isSafeInteger(data.at)?data.at:null;
          const str=(v,n)=>typeof v==='string'?v.replace(/[^\w ./×x:#?=&%-]/g,'').slice(0,n):'';
          const prompt=bugPrompt({text,client:id(data.client),at,page:str(data.page,200),viewport:str(data.viewport,20),app:!!data.app});bugs.push(now);
          try{const r=await fetch(relay.base+'/api/sessions',{method:'POST',headers:{authorization:'Bearer '+await relay.token(),'content-type':'application/json'},body:JSON.stringify({harness:'pi',cwd:MATH_MODE_REPO,title:bugTitle(text),project:'Bugs',prompt}),signal:AbortSignal.timeout(20000)});
            if(!r.ok)return json(res,502,{error:'Relay did not start the session'});const out=await r.json();return json(res,200,{ok:true,session:out.session?.sessionId??null});}
          catch{return json(res,502,{error:'Relay unavailable'});}
        }
        if(req.method==='POST'&&url.pathname==='/api/session'){
          const ip=req.socket.remoteAddress;const now=Date.now();const count=attempts.get(ip)||{count:0,time:now};if(now-count.time>60000){count.count=0;count.time=now;}if(++count.count>30)return json(res,429,{error:'Too many attempts'});attempts.set(ip,count);
          const data=await body(req);if(!equal(data.invite,token))return json(res,401,{error:'Private recognition link required'});
          const base=(Date.now()+30*86400000)+'.'+randomBytes(16).toString('hex');
          return json(res,200,{authorized:true},{'Set-Cookie':`mathModeAccess=${base}.${sign(base)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000${secureCookies?'; Secure':''}`});
        }
        if(req.method==='POST'&&(url.pathname==='/api/recognize'||url.pathname==='/api/recognize-careful')){
          if(!authorized(req))return json(res,401,{error:'Open your private recognition link to enable handwriting conversion.'});
          if(req.headers['x-math-mode']!=='1')return json(res,403,{error:'App request required'});
          const data=await body(req);try{validateImage(data.image);}catch{return json(res,400,{error:'Invalid or oversized handwriting image'});}
          const now=Date.now();budget=budget.filter(t=>now-t<3600000);
          if(active>=2)return json(res,429,{error:'Recognition is busy. Your ink is safe; try again shortly.'});
          if(budget.length>=perHour)return json(res,429,{error:'Recognition limit reached. Your ink is safe; try again later.'});
          if(budget.filter(t=>now-t<60000).length>=30)return json(res,429,{error:'Please pause between conversions.'});
          budget.push(now);active++;
          const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),30000);res.on('close',()=>{if(!res.writableEnded)controller.abort();});
          try{const reader=url.pathname==='/api/recognize-careful'?careful:recognize;if(!reader)throw new Error('Reader unavailable');const result=await reader(data.image,controller.signal);return json(res,200,result);}catch{return json(res,503,{error:'Recognition could not finish. Your original ink is saved; please try again.'});}finally{clearTimeout(timeout);active--;}
        }
        return json(res,404,{error:'Not found'});
      }
      if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);return res.end();}
      let pathname;try{pathname=decodeURIComponent(url.pathname);}catch{res.writeHead(400);return res.end();}
      let file=resolve(root,'.'+pathname);if(!file.startsWith(root+'/')&&file!==root){res.writeHead(404);return res.end();}
      let info=await stat(file);if(info.isDirectory()){file=resolve(file,'index.html');info=await stat(file);}
      const actual=await realpath(file);if(!actual.startsWith(root+'/')||!info.isFile()){res.writeHead(404);return res.end();}
      res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream','Content-Length':info.size,'Cache-Control':file.endsWith('index.html')?'no-store':'no-cache'});
      if(req.method==='HEAD')return res.end();const stream=createReadStream(file);stream.on('error',()=>res.destroy());stream.pipe(res);
    }catch(err){if(!res.headersSent){if(err.code==='ENOENT'||err.code==='ENOTDIR'){res.writeHead(404);res.end('Not found');}else json(res,400,{error:'Invalid request'});}else res.destroy();}
  });
  server.requestTimeout=15000;server.headersTimeout=10000;
  return server;
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
  const tokenFile=process.env.MATH_MODE_TOKEN_FILE||resolve(process.env.HOME,'.local/state/math-mode/recognition-invite');
  await mkdir(dirname(tokenFile),{recursive:true,mode:0o700});let token;try{token=(await readFile(tokenFile,'utf8')).trim();}catch(err){if(err.code!=='ENOENT')throw err;token=randomBytes(24).toString('hex');await writeFile(tokenFile,token,{mode:0o600});}
  const local=process.env.MATH_MODE_ENGINE==='local';
  let native=local?await createLocalRecognizer({directory:process.env.MATH_MODE_OCR_DIRECTORY}):null,restarting;
  const recognize=local?async(image,signal)=>{
    if(native.isClosed()){try{restarting??=createLocalRecognizer({directory:process.env.MATH_MODE_OCR_DIRECTORY});native=await restarting;}finally{restarting=null;}}
    return native(image,signal);
  }:await createRecognizer();
  if(local){recognize.provider=native.provider;recognize.close=()=>{native.close();restarting?.then(r=>r.close(),()=>{});};}
  let cloud;const careful=local?async(image,signal)=>{cloud??=createRecognizer();return (await cloud)(image,signal);}:undefined;
  if(careful){const provider=(process.env.MATH_MODE_MODEL||'anthropic/claude-sonnet-5-5').split('/')[0];careful.provider=provider==='anthropic'?'Anthropic':provider.startsWith('openai')?'OpenAI':provider;}
  const server=createServer({token,recognize,careful});
  server.listen(Number(process.env.PORT||8732),'127.0.0.1',()=>console.log('Math Mode static host + private handwriting recognition ready.'));
  for(const sig of ['SIGINT','SIGTERM'])process.on(sig,()=>{recognize.close?.();server.close(()=>process.exit(0));setTimeout(()=>process.exit(0),5000).unref();});
}
