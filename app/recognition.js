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
    note.dataset.careful=status.careful?(status.carefulProvider||'Anthropic'):'';
    note.textContent=status.authorized?'Cropped ink → '+(status.provider||'the recognition provider')+'. No confirmation.':'Conversion needs your private recognition link. Drawing stays local.';
  }catch{note.textContent='Recognition unavailable here. Your ink is safe on this device.';}
}
// Small editable expressions share the ink grid; original vectors stay saved.
// Responses can only update their own still-present group: never the next handwriting.
export function createInkRecognition({getProblem,makeField,remember,save,redraw,hideKeyboard,toast,toSteps,setPan,getPan=()=>0,getView=()=>({z:1,x:0,y:getPan()}),resetView=()=>setPan(0),isDrawing=()=>false,sessionReady=Promise.resolve()}){
  const typed=document.querySelector('#inkTyped'),button=document.querySelector('#inkConvert');
  const surface=document.querySelector('#inkScroll'),completed=document.querySelector('#inkCompleted');
  const allNodes=()=>[...typed.children,...completed.children];
  const jobs=new Map(),results=new Map();let running=0;
  // Stroke points are stored in world units; the writing line can be zoomed and panned.
  const toClient=(x,y)=>{const r=surface.getBoundingClientRect(),v=getView();return [r.left+(x-v.x)*v.z,r.top+(y-v.y)*v.z];};
  const live=()=>[...typed.children].filter(n=>!n.hidden).map(node=>({node,group:find(getProblem(),node.dataset.groupId),field:node.querySelector('math-field')})).filter(o=>o.group?.status==='ready'&&o.group.lines?.length===1&&o.field);
  const bounds=strokes=>{let left=Infinity,top=Infinity,right=-Infinity,bottom=-Infinity,length=0;for(const s of strokes)if(s.color!=='erase')s.pts.forEach(([x,y],i)=>{left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);if(i)length+=Math.hypot(x-s.pts[i-1][0],y-s.pts[i-1][1]);});return {left,top,right,bottom,length};};
  function splice(base,offset,insert){
    const Field=customElements.get('math-field'),f=new Field();f.style.cssText='position:fixed;left:-9999px;top:0;visibility:hidden';document.body.append(f);
    try{f.value=base;f.position=Math.min(offset,f.lastOffset);f.insert(insert,{format:'latex',selectionMode:'after',focus:false,feedback:false});return f.value;}finally{f.remove();}
  }
  // MathLive's own point lookup misses gaps between glyphs, so use each atom's bounds.
  // getElementInfo(k) describes the atom that ends at caret offset k.
  function atoms(field){const out=[];for(let k=1;k<=field.lastOffset;k++){const i=field.getElementInfo(k);if(i?.bounds?.width>0)out.push({k,b:i.bounds});}return out;}
  function caretAt(field,x,y){
    const list=atoms(field),hit=list.filter(a=>y>=a.b.top&&y<=a.b.bottom);let best=-1,dist=Infinity;
    for(const a of hit.length?hit:list)for(const [px,k] of [[a.b.left,a.k-1],[a.b.right,a.k]])if(Math.abs(px-x)<dist){dist=Math.abs(px-x);best=k;}
    return best;
  }
  function coveredRange(field,l,t,r,b){
    const list=atoms(field),inside=a=>{const x=(a.b.left+a.b.right)/2,y=(a.b.top+a.b.bottom)/2;return x>=l&&x<=r&&y>=t-8&&y<=b+8;};
    let hit=list.filter(inside);
    // A container (fraction, root, power) only goes when the scribble covers most of it.
    hit=hit.filter(a=>!hit.some(o=>o!==a&&o.b.left>=a.b.left-1&&o.b.right<=a.b.right+1&&o.b.width<a.b.width)||(Math.min(r,a.b.right)-Math.max(l,a.b.left))>=.8*a.b.width&&(Math.min(b,a.b.bottom)-Math.max(t,a.b.top))>=.6*a.b.height);
    hit=hit.filter(a=>!hit.some(o=>o!==a&&a.b.left>=o.b.left-1&&a.b.right<=o.b.right+1&&o.b.width>a.b.width));
    return hit.length?[Math.min(...hit.map(a=>a.k))-1,Math.max(...hit.map(a=>a.k))]:null;
  }
  function fieldAt(clientX,clientY){return live().find(({field})=>{const r=field.getBoundingClientRect();return clientX>=r.left-4&&clientX<=r.right+4&&clientY>=r.top-6&&clientY<=r.bottom+6;})?.field||null;}
  function focusAt(field,clientX,clientY){if(!field?.isConnected)return;field.focus();const offset=caretAt(field,clientX,clientY);if(offset>=0)field.position=offset;}
  // A zigzag (three or more left/right reversals) over math deletes what it covers.
  // Over unconverted ink it removes those strokes. Anything else stays as ink.
  function scratch(stroke){
    if(stroke.color==='erase'||stroke.pts.length<8)return false;
    const v=getView(),limit=6/v.z;let dir=0,ext=stroke.pts[0][0],turns=0;
    for(const [x] of stroke.pts){if(!dir){if(Math.abs(x-ext)>=limit){dir=Math.sign(x-ext);ext=x;}}else if((x-ext)*dir>0)ext=x;else if((ext-x)*dir>=limit){turns++;dir=-dir;ext=x;}}
    const b=bounds([stroke]);if(turns<3||b.length<2.5*(b.right-b.left))return false;
    const p=getProblem(),cy=(b.top+b.bottom)/2;
    const covered=p.strokes.filter(s=>{const o=bounds([s]);const x=(o.left+o.right)/2,y=(o.top+o.bottom)/2;return s.color!=='erase'&&x>=b.left-4&&x<=b.right+4&&y>=b.top-12&&y<=b.bottom+12;});
    if(covered.length){remember();p.strokes=p.strokes.filter(s=>!covered.includes(s));redraw();save();return true;}
    const [cl,ct]=toClient(b.left,b.top),[cr,cb]=toClient(b.right,b.bottom),ccy=toClient(0,cy)[1];
    for(const {group,field} of live()){
      const r=field.getBoundingClientRect();if(cr<r.left||cl>r.right||ccy<r.top-12||ccy>r.bottom+12)continue;
      const range=coveredRange(field,cl,ct,cr,cb);
      if(!range){toast('Scribble across the symbols you want to delete.');return true;}const [a,z]=range;
      remember();field.selection={ranges:[[a,z]]};field.executeCommand('deleteBackward');group.lines[0].latex=field.value;
      renderTyped();redraw();save();return true;
    }
    return false;
  }
  function editLine(lineId){
    const p=getProblem();if(lineId===lineState(p))return;hideKeyboard();
    if(p.strokes.length)recognize();
    remember();p.inkLineId=lineId;resetView();renderTyped();redraw();save();
  }
  function lineState(p){
    const groups=p.inkConversions||[];
    // Preserve legacy batches and parent chains; only the latest legacy line is active.
    for(const g of groups)g.lineId??=find(p,g.appendTo?.groupId)?.lineId||g.id;
    p.inkLineId??=groups.at(-1)?.lineId||crypto.randomUUID();
    return p.inkLineId;
  }
  const signature=g=>JSON.stringify([g.status,g.lines,g.error,g.warnings,document.querySelector('#inkPrivacy').dataset.careful]);
  const find=(p,id)=>p.inkConversions?.find(g=>g.id===id);
  function reconcile(){
    for(const [id,job] of jobs)if(!find(job.problem,id)||find(job.problem,id).status!=='pending'){job.controller.abort();jobs.delete(id);}
    for(const group of getProblem().inkConversions||[])if(group.status==='pending'&&results.has(group.id))Object.assign(group,structuredClone(results.get(group.id)));
  }
  function cancel(){hideKeyboard();reconcile();}
  function restore(id){
    const p=getProblem(),group=find(p,id);if(!group)return;hideKeyboard();
    if(group.lineId!==lineState(p)&&p.strokes.length)recognize();
    remember();p.inkLineId=group.lineId;resetView();let source=structuredClone(group.strokes);
    if(p.strokes.length){let end=-Infinity,start=Infinity;for(const s of p.strokes)for(const pt of s.pts)end=Math.max(end,pt[1]);for(const s of source)for(const pt of s.pts)start=Math.min(start,pt[1]);source=source.map(s=>({...s,pts:s.pts.map(([x,y])=>[x,y+end-start+24])}));}
    p.strokes.push(...source);p.inkConversions=p.inkConversions.filter(g=>g.id!==id);reconcile();renderTyped();redraw();save();
  }
  function pan(){const v=getView();typed.style.transformOrigin='0 0';typed.style.transform=`scale(${v.z}) translate(${-v.x}px,${-v.y}px)`;for(const node of allNodes())node.style.transform='';}
  function beginWriting(){hideKeyboard();for(const node of allNodes())for(const menu of node.querySelectorAll('.inkGroupActions'))menu.hidden=true;renderTyped();}
  function resolveJoins(groups){
    // Keep a focused parent stable; join after editing/drawing ends, against its latest value.
    for(const g of groups){
      if(g.status!=='ready'||!g.appendTo||g.joined)continue;
      const parent=groups.find(p=>p.id===g.appendTo.groupId);
      if(parent?.status==='pending')continue;
      if(parent?.status==='ready'&&parent.lines.length===1&&g.lines.length===1){
        const node=allNodes().find(n=>n.dataset.groupId===parent.id);
        if(node?.contains(document.activeElement)||allNodes().find(n=>n.dataset.groupId===g.id)?.contains(document.activeElement))continue;
        // The newest batch owns the combined field; the prior expression and
        // each batch's vectors stay intact for Undo/Restore ink. No model sees the parent.
        const base=parent.lines[0].latex;
        // Ink written over the expression goes where its left edge landed, if the
        // expression has not been edited since; otherwise it is appended.
        g.lines[0].latex=g.appendTo.offset!=null&&g.appendTo.base===base?splice(base,g.appendTo.offset,g.lines[0].latex):base+' '+g.lines[0].latex;
        g.position={...parent.position};g.joined=true;
      }else{delete g.appendTo;g.position.x=12;g.position.y=Math.max(g.position.y,(parent?.position?.y||0)+72);}
    }
  }
  function renderTyped(){
    reconcile();const p=getProblem(),groups=p.inkConversions||[],lineId=lineState(p);
    for(const g of groups)if(g.status==='pending'&&!jobs.has(g.id))enqueue(p,g);
    if(isDrawing())return;
    const follow=completed.scrollHeight-completed.clientHeight-completed.scrollTop<30;
    let legacyY=12;for(const g of groups){g.position??={x:12,y:legacyY};g.status??='ready';legacyY=g.position.y+Math.max(56,(g.lines?.length||1)*56);}
    resolveJoins(groups);
    const hidden=new Set(groups.filter(g=>g.joined).map(g=>g.appendTo.groupId));
    const nodes=new Map(allNodes().map(node=>[node.dataset.groupId,node]));
    for(const node of allNodes())if(!groups.some(g=>g.id===node.dataset.groupId))node.remove();
    const lineIds=[...new Set(groups.map(g=>g.lineId))];
    document.querySelector('#inkLineLabel').textContent='Current line '+(lineIds.indexOf(lineId)>=0?lineIds.indexOf(lineId)+1:lineIds.length+1);
    for(const group of groups){
      let wrap=nodes.get(group.id);if(!wrap){wrap=document.createElement('div');wrap.className='inkGroup';wrap.dataset.groupId=group.id;}
      const host=group.lineId===lineId?typed:completed;if(wrap.parentElement!==host)host.append(wrap);
      wrap.dataset.lineNumber=lineIds.indexOf(group.lineId)+1;
      wrap.hidden=hidden.has(group.id);wrap.style.left=group.position.x+'px';wrap.style.top=group.position.y+'px';
      if(wrap.hidden){wrap.replaceChildren();delete wrap.dataset.signature;continue;}
      if(wrap.dataset.signature===signature(group)+host.id)continue;
      wrap.classList.toggle('uncertain',!!group.warnings?.length);wrap.classList.toggle('failed',group.status==='failed');wrap.classList.toggle('pending',group.status==='pending');
      wrap.replaceChildren();const math=document.createElement('div');math.className='inkGroupMath';
      if(group.status==='pending'||group.status==='failed'){
        const status=document.createElement('span');status.className='inkStatus';status.textContent=group.status==='pending'?'Reading…':'Couldn’t read — ink saved';math.append(status);
      }else for(const line of group.lines){
        const f=makeField(line.latex,v=>{const current=find(getProblem(),group.id);const row=current?.lines.find(l=>l.id===line.id);if(row){row.latex=v;wrap.dataset.signature=signature(current)+(wrap.parentElement?.id||'');}});f.setAttribute('aria-label','Recognized math');
        f.addEventListener('focus',()=>requestAnimationFrame(()=>{
          if(!f.isConnected)return;if(completed.contains(f)){f.scrollIntoView({block:'nearest'});return;}const r=f.getBoundingClientRect(),view=surface.getBoundingClientRect();
          const z=getView().z;if(r.bottom>view.bottom-12)setPan(Math.max(0,getPan()+(r.bottom-view.bottom+12)/z));
          else if(r.top<view.top+8)setPan(Math.max(0,getPan()+(r.top-view.top-8)/z));pan();redraw();
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
        const provider=document.querySelector('#inkPrivacy').dataset.careful;
        if(provider){const careful=document.createElement('button');careful.textContent='Slower AI read ('+provider+')';careful.onclick=()=>{const g=find(getProblem(),group.id);if(!g)return;remember();g.reader='careful';g.status='pending';g.lines=[];delete g.joined;results.delete(g.id);renderTyped();save();};actions.append(careful);}
        const steps=document.createElement('button');steps.textContent='→ Steps';steps.onclick=()=>{const g=find(getProblem(),group.id);if(g)toSteps(g.lines);};actions.append(steps);
        for(const warning of group.warnings||[]){const note=document.createElement('p');note.className='inkWarning';note.textContent=warning;actions.append(note);}
      }
      if(host===completed){const edit=document.createElement('button');edit.className='inkEditLine';edit.textContent='✎';edit.setAttribute('aria-label','Edit line '+wrap.dataset.lineNumber+' by hand');edit.onclick=()=>editLine(group.lineId);wrap.append(math,edit,more,actions);}
      else wrap.append(math,more,actions);wrap.dataset.signature=signature(group)+host.id;
    }
    typed.hidden=!groups.some(g=>g.lineId===lineId);pan();
    document.querySelector('#inkPast').hidden=!groups.some(g=>g.lineId!==lineId);
    if(follow&&!completed.contains(document.activeElement))completed.scrollTop=completed.scrollHeight;
  }
  function placement(strokes){
    const b=bounds(strokes),v=getView(),view=surface.getBoundingClientRect();
    const [cl,ct]=toClient(b.left,b.top),[,cb]=toClient(b.right,b.bottom);
    // Ink that starts inside an expression is inserted there, not appended.
    for(const {group,field} of live()){
      const r=field.getBoundingClientRect();if(cl>=r.right-6||ct>r.bottom+12||cb<r.top-12)continue;
      const offset=caretAt(field,cl,Math.min(r.bottom,Math.max(r.top,(ct+cb)/2)));
      if(offset>=0&&offset<field.lastOffset)return {position:{...group.position},appendTo:{groupId:group.id,offset,base:group.lines[0].latex}};
    }
    // There is only one writing line. New ink continues its equation; New line
    // is the explicit boundary, including while either reading is pending.
    const current=[...(getProblem().inkConversions||[])].reverse().find(g=>g.lineId===lineState(getProblem())&&g.status!=='failed'&&g.lines.length<=1);
    if(current){const node=[...typed.children].find(n=>n.dataset.groupId===current.id),right=node?(node.getBoundingClientRect().right-view.left)/v.z+v.x:80;return {position:{x:Math.min(surface.clientWidth-80,right+8),y:current.position.y},appendTo:{groupId:current.id}};}
    return {position:{x:12,y:Math.min(32,Math.max(12,b.top))}};
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
      const response=await fetch(group.reader==='careful'?'/api/recognize-careful':'/api/recognize',{method:'POST',headers:{'Content-Type':'application/json','X-Math-Mode':'1'},body:JSON.stringify({image:inkImage(group.strokes)}),signal:job.controller.signal});
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
    const lineId=lineState(problem);remember();const group={id:crypto.randomUUID(),lineId,status:'pending',lines:[],strokes:structuredClone(problem.strokes),...placement(problem.strokes)};
    problem.inkConversions??=[];problem.inkConversions.push(group);problem.strokes=[];hideKeyboard();renderTyped();redraw();save();
  }
  function newLine(){
    if(isDrawing())return;const p=getProblem(),lineId=lineState(p);
    if(p.strokes.length)recognize();
    if(!p.inkConversions?.some(g=>g.lineId===lineId))return;
    remember();hideKeyboard();p.inkLineId=crypto.randomUUID();resetView();renderTyped();completed.scrollTop=completed.scrollHeight;redraw();save();
  }
  sessionReady.then(()=>renderTyped());
  button.onclick=recognize;document.querySelector('#inkNewLine').onclick=newLine;
  return {recognize,newLine,cancel,renderTyped,pan,beginWriting,scratch,fieldAt,focusAt,editLine};
}
