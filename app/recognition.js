// Only a tightly cropped, high-contrast ink image leaves the browser.
export function inkImage(strokes){
  const ink=strokes.filter(s=>s.color!=='erase');if(!ink.length)throw new Error('Write some math first.');
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  for(const s of ink)for(const [x,y] of s.pts){minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}
  const pad=16,w=maxX-minX+pad*2,h=maxY-minY+pad*2,scale=Math.min(2,1200/w,1200/h);
  const layer=document.createElement('canvas');layer.width=Math.ceil(w*scale);layer.height=Math.ceil(h*scale);const ctx=layer.getContext('2d');ctx.scale(scale,scale);ctx.lineCap='round';ctx.lineJoin='round';
  for(const s of strokes){ctx.globalCompositeOperation=s.color==='erase'?'destination-out':'source-over';ctx.strokeStyle='#000';ctx.fillStyle='#000';ctx.lineWidth=s.width??(s.color==='erase'?22:2.6);ctx.beginPath();s.pts.forEach(([x,y],i)=>i?ctx.lineTo(x-minX+pad,y-minY+pad):ctx.moveTo(x-minX+pad,y-minY+pad));if(s.pts.length===1){ctx.arc(s.pts[0][0]-minX+pad,s.pts[0][1]-minY+pad,ctx.lineWidth/2,0,Math.PI*2);ctx.fill();}else ctx.stroke();}
  const output=document.createElement('canvas');output.width=layer.width;output.height=layer.height;const out=output.getContext('2d');out.fillStyle='#fff';out.fillRect(0,0,output.width,output.height);out.drawImage(layer,0,0);return output.toDataURL('image/png');
}
export async function unlockRecognition(){
  const match=location.hash.match(/^#recognition=([a-f0-9]{48})$/),note=document.querySelector('#inkPrivacy');
  try{
    if(match){history.replaceState(null,'',location.pathname+location.search);const r=await fetch('/api/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({invite:match[1]}),signal:AbortSignal.timeout(8000)});if(!r.ok)throw new Error();}
    const r=await fetch('/api/status',{signal:AbortSignal.timeout(8000)}),status=await r.json();
    note.textContent=status.authorized?'Convert sends only your ink to '+(status.provider||'the recognition provider')+'. No confirmation needed.':'Conversion needs your private recognition link. Drawing stays local.';
  }catch{note.textContent='Recognition unavailable here. Your ink is safe on this device.';}
}
// Small editable expressions share the ink grid; original vectors stay saved.
// Responses can only update their own still-present group: never the next handwriting.
export function createInkRecognition({getProblem,makeField,remember,save,redraw,hideKeyboard,toast,toSteps,setPan,getPan=()=>0,isDrawing=()=>false,sessionReady=Promise.resolve()}){
  const typed=document.querySelector('#inkTyped'),button=document.querySelector('#inkConvert');
  const surface=document.querySelector('#inkScroll');
  const jobs=new Map(),results=new Map();let running=0;
  const signature=g=>JSON.stringify([g.status,g.lines,g.error,g.warnings]);
  const find=(p,id)=>p.inkConversions?.find(g=>g.id===id);
  function reconcile(){
    for(const [id,job] of jobs)if(!find(job.problem,id)||find(job.problem,id).status!=='pending'){job.controller.abort();jobs.delete(id);}
    for(const group of getProblem().inkConversions||[])if(group.status==='pending'&&results.has(group.id))Object.assign(group,structuredClone(results.get(group.id)));
  }
  function cancel(){hideKeyboard();reconcile();}
  function restore(id){
    const p=getProblem(),group=find(p,id);if(!group)return;hideKeyboard();remember();let source=structuredClone(group.strokes);
    if(p.strokes.length){let end=-Infinity,start=Infinity;for(const s of p.strokes)for(const pt of s.pts)end=Math.max(end,pt[1]);for(const s of source)for(const pt of s.pts)start=Math.min(start,pt[1]);source=source.map(s=>({...s,pts:s.pts.map(([x,y])=>[x,y+end-start+24])}));}
    p.strokes.push(...source);p.inkConversions=p.inkConversions.filter(g=>g.id!==id);setPan(0);reconcile();renderTyped();redraw();save();
  }
  function pan(){for(const node of typed.children)node.style.transform=`translateY(${-getPan()}px)`;}
  function beginWriting(){hideKeyboard();if(typed.contains(document.activeElement))document.activeElement.blur();for(const menu of typed.querySelectorAll('.inkGroupActions'))menu.hidden=true;renderTyped();}
  function resolveJoins(groups){
    // Keep a focused parent stable; join after editing/drawing ends, against its latest value.
    for(const g of groups){
      if(g.status!=='ready'||!g.appendTo||g.joined)continue;
      const parent=groups.find(p=>p.id===g.appendTo.groupId);
      if(parent?.status==='pending')continue;
      if(parent?.status==='ready'&&parent.lines.length===1&&g.lines.length===1){
        const node=[...typed.children].find(n=>n.dataset.groupId===parent.id);
        if(node?.contains(document.activeElement)||[...typed.children].find(n=>n.dataset.groupId===g.id)?.contains(document.activeElement))continue;
        // The newest batch owns the combined field; the prior expression and
        // each batch's vectors stay intact for Undo/Restore ink. No model sees the parent.
        g.lines[0].latex=parent.lines[0].latex+' '+g.lines[0].latex;
        g.position={...parent.position};g.joined=true;
      }else{delete g.appendTo;g.position.x=12;g.position.y=Math.max(g.position.y,(parent?.position?.y||0)+72);}
    }
  }
  function renderTyped(){
    reconcile();const p=getProblem(),groups=p.inkConversions||[];
    for(const g of groups)if(g.status==='pending'&&!jobs.has(g.id))enqueue(p,g);
    if(isDrawing())return;
    let legacyY=12;for(const g of groups){g.position??={x:12,y:legacyY};g.status??='ready';legacyY=g.position.y+Math.max(56,(g.lines?.length||1)*56);}
    resolveJoins(groups);
    const hidden=new Set(groups.filter(g=>g.joined).map(g=>g.appendTo.groupId));
    const nodes=new Map([...typed.children].map(node=>[node.dataset.groupId,node]));
    for(const node of [...typed.children])if(!groups.some(g=>g.id===node.dataset.groupId))node.remove();
    for(const group of groups){
      let wrap=nodes.get(group.id);if(!wrap){wrap=document.createElement('div');wrap.className='inkGroup';wrap.dataset.groupId=group.id;typed.append(wrap);}
      wrap.hidden=hidden.has(group.id);wrap.style.left=group.position.x+'px';wrap.style.top=group.position.y+'px';
      if(wrap.hidden){wrap.replaceChildren();delete wrap.dataset.signature;continue;}
      if(wrap.dataset.signature===signature(group))continue;
      wrap.classList.toggle('uncertain',!!group.warnings?.length);wrap.classList.toggle('failed',group.status==='failed');wrap.classList.toggle('pending',group.status==='pending');
      wrap.replaceChildren();const math=document.createElement('div');math.className='inkGroupMath';
      if(group.status==='pending'||group.status==='failed'){
        const status=document.createElement('span');status.className='inkStatus';status.textContent=group.status==='pending'?'Reading…':'Couldn’t read — ink saved';math.append(status);
      }else for(const line of group.lines){
        const f=makeField(line.latex,v=>{const current=find(getProblem(),group.id);const row=current?.lines.find(l=>l.id===line.id);if(row){row.latex=v;wrap.dataset.signature=signature(current);}});f.setAttribute('aria-label','Recognized math');
        f.addEventListener('focus',()=>requestAnimationFrame(()=>{
          if(!f.isConnected)return;const r=f.getBoundingClientRect(),view=surface.getBoundingClientRect();
          if(r.bottom>view.bottom-12)setPan(Math.max(0,getPan()+r.bottom-view.bottom+12));
          else if(r.top<view.top+8)setPan(Math.max(0,getPan()+r.top-view.top-8));pan();redraw();
        }));math.append(f);
      }
      const more=document.createElement('button');more.className='inkMore';more.textContent='⋯';more.setAttribute('aria-label','Recognized math actions');more.setAttribute('aria-expanded','false');
      const actions=document.createElement('div');actions.className='inkGroupActions';actions.hidden=true;
      more.onclick=()=>{actions.hidden=!actions.hidden;more.setAttribute('aria-expanded',String(!actions.hidden));};
      const recover=document.createElement('button');recover.textContent='↶ Restore ink';recover.onclick=()=>restore(group.id);actions.append(recover);
      if(group.status==='failed'){
        const retry=document.createElement('button');retry.textContent='Retry';retry.onclick=()=>{const g=find(getProblem(),group.id);if(!g)return;g.status='pending';delete g.error;results.delete(g.id);renderTyped();save();};actions.append(retry);
        const error=document.createElement('p');error.className='inkWarning';error.textContent=group.error||'Tap Restore ink or Retry.';actions.append(error);
      }else if(group.status!=='pending'){
        const steps=document.createElement('button');steps.textContent='→ Steps';steps.onclick=()=>{const g=find(getProblem(),group.id);if(g)toSteps(g.lines);};actions.append(steps);
        for(const warning of group.warnings||[]){const note=document.createElement('p');note.className='inkWarning';note.textContent=warning;actions.append(note);}
      }
      wrap.append(math,more,actions);wrap.dataset.signature=signature(group);
    }
    typed.hidden=!groups.length;pan();
  }
  function placement(strokes){
    let left=Infinity,top=Infinity,bottom=-Infinity;for(const s of strokes)if(s.color!=='erase')for(const [x,y] of s.pts){left=Math.min(left,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
    const view=surface.getBoundingClientRect();let target=null,closest=Infinity;
    for(const node of typed.children){
      if(node.hidden)continue;const g=find(getProblem(),node.dataset.groupId);if(!g||g.status==='failed'||g.lines.length>1)continue;
      const r=(node.querySelector('math-field')||node).getBoundingClientRect(),y=r.top-view.top+getPan(),height=r.height||36,right=r.right-view.left;
      const distance=Math.abs((top+bottom)/2-(y+height/2));
      if(left>=right-8&&top<=y+height+48&&bottom>=y-24&&distance<80&&distance<closest){target={groupId:g.id};closest=distance;}
    }
    if(target){const parent=find(getProblem(),target.groupId),node=[...typed.children].find(n=>n.dataset.groupId===parent.id);return {position:{x:Math.min(surface.clientWidth-80,node.getBoundingClientRect().right-view.left+8),y:parent.position.y},appendTo:target};}
    let y=Math.max(12,top);
    // Moving to the left must not land on a different existing expression.
    for(const node of [...typed.children].filter(n=>!n.hidden).sort((a,b)=>parseFloat(a.style.top)-parseFloat(b.style.top))){const g=find(getProblem(),node.dataset.groupId),h=node.getBoundingClientRect().height||48;if(y<g.position.y+h+8&&y+48>g.position.y)y=g.position.y+h+12;}
    return {position:{x:12,y}};
  }
  function enqueue(problem,group){
    const job={problem,id:group.id,controller:new AbortController(),started:false};jobs.set(group.id,job);pump();
  }
  function pump(){
    for(const job of jobs.values()){if(running>=2)break;if(job.started)continue;job.started=true;running++;run(job);}
  }
  async function run(job){
    let timeout;
    try{
      timeout=setTimeout(()=>job.controller.abort(),32000);
      await sessionReady;if(job.controller.signal.aborted)throw new DOMException('Canceled','AbortError');
      const group=find(job.problem,job.id);if(!group||group.status!=='pending')return;
      const response=await fetch('/api/recognize',{method:'POST',headers:{'Content-Type':'application/json','X-Math-Mode':'1'},body:JSON.stringify({image:inkImage(group.strokes)}),signal:job.controller.signal});
      const result=await response.json();if(job.controller.signal.aborted||jobs.get(job.id)!==job||!find(job.problem,job.id))return;
      if(!response.ok)throw new Error(result.error||'Recognition unavailable. Your original ink is saved.');
      if(!Array.isArray(result.lines)||!result.lines.length)throw new Error('No readable math found. Original ink saved; restore it or try again.');
      const update={status:'ready',lines:result.lines.map(l=>({id:crypto.randomUUID(),latex:l.latex})),warnings:[...(result.warnings||[])]};
      if(result.lines.some(l=>l.uncertain))update.warnings.push('An uncertain symbol was recognized. Tap the math to correct it, or restore your ink.');
      results.set(job.id,update);Object.assign(find(job.problem,job.id),structuredClone(update));
    }catch(err){
      const group=find(job.problem,job.id);
      if(jobs.get(job.id)===job&&group?.status==='pending'){
        const update={status:'failed',lines:[],error:err.name==='AbortError'?'Recognition timed out. Original ink saved.':err.message};if(group.appendTo)update.position={x:12,y:(find(job.problem,group.appendTo.groupId)?.position?.y||group.position.y)+72};
        results.set(job.id,update);Object.assign(group,update);
        if(getProblem().id===job.problem.id)toast('Couldn’t convert — original ink is saved. Undo or ⋯ restores it.');
      }
    }finally{
      clearTimeout(timeout);if(jobs.get(job.id)===job)jobs.delete(job.id);running--;while(results.size>100)results.delete(results.keys().next().value);
      if(getProblem().id===job.problem.id){renderTyped();redraw();}save();pump();
    }
  }
  function recognize(){
    if(isDrawing())return;const problem=getProblem();try{inkImage(problem.strokes);}catch(err){toast(err.message);return;}
    remember();const group={id:crypto.randomUUID(),status:'pending',lines:[],strokes:structuredClone(problem.strokes),...placement(problem.strokes)};
    problem.inkConversions??=[];problem.inkConversions.push(group);problem.strokes=[];hideKeyboard();renderTyped();redraw();save();
  }
  button.onclick=recognize;
  return {recognize,cancel,renderTyped,pan,beginWriting};
}
