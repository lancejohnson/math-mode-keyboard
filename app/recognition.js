// Only a tightly cropped, high-contrast ink image leaves the browser.
export function inkImage(strokes){
  const ink=strokes.filter(s=>s.color!=='erase');if(!ink.length)throw new Error('Write some math first.');
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  for(const s of ink)for(const [x,y] of s.pts){minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}
  const pad=20,w=maxX-minX+pad*2,h=maxY-minY+pad*2,scale=Math.min(3,1500/w,1500/h);
  const layer=document.createElement('canvas');layer.width=Math.ceil(w*scale);layer.height=Math.ceil(h*scale);const ctx=layer.getContext('2d');ctx.scale(scale,scale);ctx.lineCap='round';ctx.lineJoin='round';
  for(const s of strokes){ctx.globalCompositeOperation=s.color==='erase'?'destination-out':'source-over';ctx.strokeStyle='#000';ctx.fillStyle='#000';ctx.lineWidth=s.width??(s.color==='erase'?22:2.6);ctx.beginPath();s.pts.forEach(([x,y],i)=>i?ctx.lineTo(x-minX+pad,y-minY+pad):ctx.moveTo(x-minX+pad,y-minY+pad));if(s.pts.length===1){ctx.arc(s.pts[0][0]-minX+pad,s.pts[0][1]-minY+pad,ctx.lineWidth/2,0,Math.PI*2);ctx.fill();}else ctx.stroke();}
  const output=document.createElement('canvas');output.width=layer.width;output.height=layer.height;const out=output.getContext('2d');out.fillStyle='#fff';out.fillRect(0,0,output.width,output.height);out.drawImage(layer,0,0);return output.toDataURL('image/png');
}
export async function unlockRecognition(){
  const match=location.hash.match(/^#recognition=([a-f0-9]{48})$/);
  const note=document.querySelector('#inkPrivacy');
  try{
    if(match){history.replaceState(null,'',location.pathname+location.search);const r=await fetch('/api/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({invite:match[1]})});if(!r.ok)throw new Error();}
    const r=await fetch('/api/status');const status=await r.json();
    note.textContent=status.authorized?'Convert sends only your ink to OpenAI + Anthropic. Review before replacing.':'Conversion needs your private recognition link. Drawing stays local.';
  }catch{note.textContent='Recognition unavailable here. Your ink is safe on this device.';}
}
export function createInkRecognition({getProblem,makeField,remember,save,redraw,hideKeyboard,toast,toSteps,setPan}){
  let sequence=0,controller=null,busy=false,preview=null;
  const review=document.querySelector('#inkReview'),typed=document.querySelector('#inkTyped'),button=document.querySelector('#inkConvert');
  function inkField(latex,onChange,label){const f=makeField(latex,onChange);f.setAttribute('aria-label',label);f.addEventListener('focus',()=>requestAnimationFrame(()=>{if(f.isConnected)f.scrollIntoView({block:'nearest'});}));return f;}
  function cancel(){sequence++;controller?.abort();controller=null;busy=false;preview=null;button.disabled=false;button.textContent='Convert';review.replaceChildren();review.hidden=true;hideKeyboard();}
  function renderTyped(){typed.replaceChildren();for(const group of getProblem().inkConversions||[]){
    const wrap=document.createElement('div');wrap.className='inkGroup';
    for(const line of group.lines){const f=inkField(line.latex,v=>{line.latex=v;},'Recognized math');wrap.append(f);}
    const actions=document.createElement('div');actions.className='inkGroupActions';
    const restore=document.createElement('button');restore.textContent='↶ Restore ink';restore.onclick=()=>{cancel();remember();const p=getProblem();let source=structuredClone(group.strokes);if(p.strokes.length){let end=-Infinity,start=Infinity;for(const s of p.strokes)for(const pt of s.pts)end=Math.max(end,pt[1]);for(const s of source)for(const pt of s.pts)start=Math.min(start,pt[1]);source=source.map(s=>({...s,pts:s.pts.map(([x,y])=>[x,y+end-start+24])}));}p.strokes.push(...source);p.inkConversions=p.inkConversions.filter(g=>g.id!==group.id);setPan(0);renderTyped();redraw();save();};
    const steps=document.createElement('button');steps.textContent='→ Steps';steps.onclick=()=>toSteps(group.lines);actions.append(restore,steps);wrap.append(actions);typed.append(wrap);
  }typed.hidden=!typed.children.length;}
  function renderPreview(){review.replaceChildren();review.hidden=!preview;if(!preview)return;
    const heading=document.createElement('p');heading.className='reviewHeading';heading.textContent='Check the recognition';review.append(heading);
    const note=document.createElement('p');note.className='reviewNote';note.textContent=preview.result.alternatives.length?'Readers disagree. Pick a reading and tap any expression to fix it.':preview.result.checked?'Two readers agree. Please check the symbols; either can still misread.':'One reading available. The independent check failed; please check carefully.';review.append(note);
    const img=document.createElement('img');img.src=preview.image;img.alt='Original handwriting for comparison';img.className='recognitionSource';review.append(img);
    if(preview.candidates.length>1){const choices=document.createElement('div');choices.className='readingChoices';preview.candidates.forEach((c,i)=>{const b=document.createElement('button');b.textContent='Reading '+(i+1);b.classList.toggle('on',preview.choice===i);b.onclick=()=>{hideKeyboard();preview.choice=i;renderPreview();};choices.append(b);});review.append(choices);}
    const chosen=preview.candidates[preview.choice];for(const line of chosen){const f=inkField(line.latex,v=>{line.latex=v;},'Recognition preview');review.append(f);if(line.uncertain){const warn=document.createElement('p');warn.className='reviewWarning';warn.textContent='This expression contains an uncertain symbol. Check it against your ink.';review.append(warn);}}
    for(const warning of preview.result.warnings){const p=document.createElement('p');p.className='reviewWarning';p.textContent=warning;review.append(p);}
    if(!chosen.length){const p=document.createElement('p');p.textContent='No readable math found. Keep your ink and try writing the expression again.';review.append(p);}
    const actions=document.createElement('div');actions.className='reviewActions';const keep=document.createElement('button');keep.textContent='Keep ink';keep.onclick=cancel;const apply=document.createElement('button');apply.textContent='Use this math';apply.disabled=!chosen.length;apply.onclick=()=>{
      const p=getProblem();if(p.id!==preview.problemId||JSON.stringify(p.strokes)!==preview.fingerprint){cancel();toast('Your ink changed. Convert the current writing again.');return;}
      remember();p.inkConversions??=[];p.inkConversions.push({id:crypto.randomUUID(),lines:chosen.map(l=>({id:crypto.randomUUID(),latex:l.latex})),strokes:structuredClone(p.strokes)});p.strokes=[];setPan(0);cancel();renderTyped();redraw();save();toast('Converted to editable math. Keep writing below; Undo restores the ink.');
    };actions.append(keep,apply);review.append(actions);
  }
  async function recognize(){if(busy||preview)return;const problem=getProblem();let image;try{image=inkImage(problem.strokes);}catch(err){toast(err.message);return;}
    const id=++sequence;const fingerprint=JSON.stringify(problem.strokes);controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),65000);busy=true;button.disabled=true;button.textContent='Reading…';hideKeyboard();
    review.hidden=false;review.textContent='Reading your handwriting with two independent models… Your ink is unchanged.';
    try{const response=await fetch('/api/recognize',{method:'POST',headers:{'Content-Type':'application/json','X-Math-Mode':'1'},body:JSON.stringify({image}),signal:controller.signal});const result=await response.json();if(id!==sequence)return;if(!response.ok)throw new Error(result.error||'Recognition failed. Your ink is untouched.');if(getProblem().id!==problem.id||JSON.stringify(problem.strokes)!==fingerprint)throw new Error('Your ink changed. Try converting again.');preview={problemId:problem.id,fingerprint,image,result,candidates:structuredClone([result.lines,...result.alternatives.map(a=>a.lines)]),choice:0};renderPreview();}
    catch(err){if(id===sequence){review.replaceChildren();review.hidden=true;toast(err.name==='AbortError'?'Recognition timed out. Your ink is untouched.':err.message);}}
    finally{clearTimeout(timeout);if(id===sequence){busy=false;button.disabled=false;button.textContent='Convert';}}
  }
  button.onclick=recognize;
  return {recognize,cancel,renderTyped,get locked(){return busy||!!preview;}};
}
