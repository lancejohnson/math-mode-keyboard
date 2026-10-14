import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {homedir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {parseTranscription,validateImage} from './recognizer.mjs';

// One warm native model, bounded by the existing API's two-request limit.
// Images and results travel only through private process pipes, never disk/logs.
export async function createLocalRecognizer({directory=`${homedir()}/.local/share/math-mode/ocr`,python=process.env.MATH_MODE_OCR_PYTHON}={}){
  const child=spawn(python||`${directory}/venv/bin/python`,[fileURLToPath(new URL('./local-ocr.py',import.meta.url))],{
    env:{...process.env,MATH_MODE_OCR_LIBRARY:`${directory}/libcrispembed.so`,MATH_MODE_OCR_MODEL:`${directory}/bttr.gguf`},stdio:['pipe','pipe','ignore'],detached:true
  });
  const stop=()=>{try{process.kill(-child.pid,'SIGTERM');}catch{child.kill();}};
  let next=0,closed=false;const pending=new Map();
  let readyResolve,readyReject;
  const ready=new Promise((resolve,reject)=>{readyResolve=resolve;readyReject=reject;});
  const fail=()=>{closed=true;readyReject(new Error('Local math recognizer unavailable.'));for(const task of pending.values())task.reject(new Error('Recognition unavailable. Original ink saved.'));pending.clear();};
  process.once('exit',stop);
  child.on('error',fail);child.on('exit',()=>{process.removeListener('exit',stop);fail();});
  child.stdin.on('error',fail);
  const reader=createInterface({input:child.stdout});
  reader.on('line',line=>{
    if(line.length>20000){stop();return;}
    let result;try{result=JSON.parse(line);}catch{stop();return;}
    if(result.ready){readyResolve();return;}
    const task=pending.get(result.id);if(!task)return;pending.delete(result.id);
    if(result.error)task.reject(new Error('Couldn’t read this expression. Original ink saved.'));else task.resolve(result);
  });
  const startup=setTimeout(()=>{stop();readyReject(new Error('Local math recognizer startup timed out.'));},15000);
  try{await ready;}finally{clearTimeout(startup);}
  const recognize=async(image,signal)=>{
    const data=validateImage(image);if(closed)throw new Error('Local math recognizer unavailable.');
    if(signal?.aborted)throw new Error('Recognition cancelled.');
    if(pending.size>=2)throw new Error('Recognition busy. Original ink saved.');
    const id=++next;let abort,timer,cancelled=false;
    try{
      const result=await new Promise((resolve,reject)=>{
        const cleanup=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);};
        pending.set(id,{resolve:r=>{cleanup();resolve(r);},reject:e=>{cleanup();reject(e);}});
        // Cancel publication, not another user's active native inference.
        abort=()=>{cancelled=true;signal.removeEventListener('abort',abort);reject(new Error('Recognition cancelled.'));};
        signal?.addEventListener('abort',abort,{once:true});
        timer=setTimeout(()=>{stop();},8000);
        child.stdin.write(JSON.stringify({id,image:data})+'\n');
      });
      const uncertain=!Number.isFinite(result.confidence)||result.confidence<.9;
      if(!result.text?.trim()||result.confidence<.45)throw new Error('Couldn’t read this expression. Original ink saved.');
      const parsed=parseTranscription(JSON.stringify({lines:[{latex:result.text.trim(),uncertain}],warnings:uncertain?['The fast reader is uncertain. Check the equation or use the slower AI read.']:[]}));
      return {...parsed,model:'bttr-local'};
    }finally{if(!cancelled)pending.delete(id);}
  };
  recognize.isClosed=()=>closed;
  recognize.provider='this Math Mode server (fast math reader)';
  recognize.close=()=>{reader.close();stop();};
  return recognize;
}
