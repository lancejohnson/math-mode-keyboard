import http from 'node:http';
import {createReadStream} from 'node:fs';
import {readFile,writeFile,mkdir,stat,realpath} from 'node:fs/promises';
import {resolve,extname,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {randomBytes,createHmac,timingSafeEqual} from 'node:crypto';
import {createRecognizer,validateImage} from './recognizer.mjs';
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../app');
const MAX_BODY=2900000;
const equal=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.png':'image/png','.woff2':'font/woff2','.txt':'text/plain; charset=utf-8'};
export function createServer({token,recognize,root=ROOT,secureCookies=true,perHour=120}={}){
  if(!token||!recognize)throw new Error('Recognition server needs private configuration');
  let active=0,budget=[];const attempts=new Map();
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
        if(req.method==='GET'&&url.pathname==='/api/status')return json(res,200,{recognition:true,authorized:authorized(req)});
        if(req.method==='POST'&&url.pathname==='/api/session'){
          const ip=req.socket.remoteAddress;const now=Date.now();const count=attempts.get(ip)||{count:0,time:now};if(now-count.time>60000){count.count=0;count.time=now;}if(++count.count>30)return json(res,429,{error:'Too many attempts'});attempts.set(ip,count);
          const data=await body(req);if(!equal(data.invite,token))return json(res,401,{error:'Private recognition link required'});
          const base=(Date.now()+30*86400000)+'.'+randomBytes(16).toString('hex');
          return json(res,200,{authorized:true},{'Set-Cookie':`mathModeAccess=${base}.${sign(base)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000${secureCookies?'; Secure':''}`});
        }
        if(req.method==='POST'&&url.pathname==='/api/recognize'){
          if(!authorized(req))return json(res,401,{error:'Open your private recognition link to enable handwriting conversion.'});
          if(req.headers['x-math-mode']!=='1')return json(res,403,{error:'App request required'});
          const data=await body(req);try{validateImage(data.image);}catch{return json(res,400,{error:'Invalid or oversized handwriting image'});}
          const now=Date.now();budget=budget.filter(t=>now-t<3600000);
          if(active>=2)return json(res,429,{error:'Recognition is busy. Your ink is safe; try again shortly.'});
          if(budget.length>=perHour)return json(res,429,{error:'Recognition limit reached. Your ink is safe; try again later.'});
          if(budget.filter(t=>now-t<60000).length>=10)return json(res,429,{error:'Please pause between conversions.'});
          budget.push(now);active++;
          const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),60000);res.on('close',()=>{if(!res.writableEnded)controller.abort();});
          try{const result=await recognize(data.image,controller.signal);return json(res,200,result);}catch{return json(res,503,{error:'Recognition could not finish. Your ink is untouched; please try again.'});}finally{clearTimeout(timeout);active--;}
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
  const recognize=await createRecognizer();const server=createServer({token,recognize});
  server.listen(Number(process.env.PORT||8732),'127.0.0.1',()=>console.log('Math Mode static host + private handwriting recognition ready.'));
  for(const sig of ['SIGINT','SIGTERM'])process.on(sig,()=>{server.close(()=>process.exit(0));setTimeout(()=>process.exit(0),5000).unref();});
}
