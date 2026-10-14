import { MathfieldElement } from './vendor/mathlive.min.mjs';
import { ComputeEngine } from './vendor/compute/compute-engine.js';
import { evaluate, curveExpression, snapStroke } from './core.js?v=6';
import { createInkRecognition, unlockRecognition } from './recognition.js?v=6';
MathfieldElement.fontsDirectory = new URL('./vendor/fonts', import.meta.url).href;
MathfieldElement.soundsDirectory = null;
MathfieldElement.keypressSound = null;
MathfieldElement.plonkSound = null;
const ce = new ComputeEngine();
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const colors = ['#4dabf7','#e599f7','#69db7c','#ffd43b'];
const uid = () => crypto.randomUUID();
let state;
try { state = JSON.parse(localStorage.getItem('mathmode-v1')); } catch {}
const makeProblem = (title, latex='') => ({id:uid(), title, lines:[{id:uid(),latex,why:''}], strokes:[], curves:[{id:uid(),latex:'y=x^2-4',color:colors[0]}],shapes:[], qText:'', qImage:null});
if (!state?.problems?.length) state = {problems:[makeProblem('Algebra warm-up','\\frac{2x+3}{x-1}=5')],current:null,layout:'big',tab:'steps'};
let problem = state.problems.find(p=>p.id===state.current) || state.problems[0];
let mode = state.tab || 'steps', active=null, activeLine=null, saveTimer, toastTimer, pen='#7dd3fc', inkPan=0;
let inkWidth=390,inkHeight=400, inkStroke=null, inkGesture=null;
let graph={scale:32,cx:0,cy:0,axes:true,mode:'move',gesture:null,stroke:null,points:new Map()};
let qOpen=false, pointerMap=new Map(), keysPage='numbers';
function toast(s){$('#toast').textContent=s;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').hidden=true,2400);}
function save(){clearTimeout(saveTimer);saveTimer=setTimeout(()=>{state.current=problem.id;state.tab=mode;try{localStorage.setItem('mathmode-v1',JSON.stringify(state));}catch{toast('Storage full — export your work before closing.');}},150);}
function flush(){clearTimeout(saveTimer);state.current=problem.id;state.tab=mode;try{localStorage.setItem('mathmode-v1',JSON.stringify(state));}catch{}}
window.addEventListener('pagehide',flush);
function updateProblems(){const select=$('#problem');select.replaceChildren();for(const p of state.problems){const o=document.createElement('option');o.value=p.id;o.textContent=p.title;select.append(o);}select.value=problem.id;}
$('#problem').onchange=e=>{flush();problem=state.problems.find(p=>p.id===e.target.value);active=null;activeLine=null;inkPan=0;inkRecognition.cancel();inkRecognition.renderTyped();renderLines();renderCurves();renderQ();resizeCanvases();save();};
$('#newProblem').onclick=()=>{const title=prompt('Name this problem','Problem '+(state.problems.length+1));if(!title?.trim())return;problem=makeProblem(title.trim());state.problems.push(problem);updateProblems();inkRecognition.cancel();inkRecognition.renderTyped();renderLines();renderCurves();renderQ();resizeCanvases();save();if(mode==='steps'||mode==='moves')focusLine(0);};
function field(latex, callback){const f=new MathfieldElement();f.mathVirtualKeyboardPolicy='manual';f.smartFence=true;f.smartMode=false;f.popoverPolicy='off';f.value=latex;f.setAttribute('aria-label','Math expression');f.addEventListener('input',()=>{callback(f.value);save();});f.addEventListener('focus',()=>{active=f;$('#kb').hidden=false;if(!$('#kb .k.down'))renderKB();});return f;}

function renderLines(){const host=$('#lines');host.replaceChildren();for(let i=0;i<problem.lines.length;i++){const l=problem.lines[i],row=document.createElement('div');row.className='line';row.dataset.id=l.id;
const n=document.createElement('span');n.className='n';n.textContent=i+1;
const f=field(l.latex,v=>{l.latex=v;});f.dataset.line=l.id;
f.addEventListener('focus',()=>{activeLine=l;$$('.line').forEach(r=>r.classList.toggle('active',r===row));});
f.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();e.stopPropagation();nextLine();}});
const why=document.createElement('button');why.className='why '+(!l.why?'empty':'');why.textContent=l.why || '+ reason';why.onclick=()=>{const v=prompt('Reason for this step',l.why);if(v!==null){l.why=v;why.textContent=v||'+ reason';why.classList.toggle('empty',!v);save();}};
const more=document.createElement('button');more.className='more';more.textContent='⋯';more.setAttribute('aria-label','Step actions');more.onclick=e=>lineMenu(e,l,f);
row.append(n,f,why,more);host.append(row);}
active=null;activeLine=null;
}
function focusLine(i, select=false){const row=$$('#lines .line')[i];if(!row)return;const f=row.querySelector('math-field');f.focus();if(select)f.executeCommand('selectAll');else f.executeCommand('moveToMathfieldEnd');requestAnimationFrame(()=>row.scrollIntoView({block:'nearest',behavior:'smooth'}));}
function nextLine(blank=true){if(mode==='graph'){addCurve();return;}const i=activeLine?problem.lines.indexOf(activeLine):problem.lines.length-1;const l={id:uid(),latex:blank?'':(activeLine?.latex||''),why:''};problem.lines.splice(i+1,0,l);renderLines();save();focusLine(i+1);}
function lineMenu(e,l,f){closeMenu();const menu=document.createElement('div');menu.className='menu';
const options=[['Duplicate below',()=>{activeLine=l;nextLine(false);}],['New blank line below',()=>{activeLine=l;nextLine(true);}],['Copy as plain math',()=>copy(f.getValue('ascii-math'))],['Copy as LaTeX',()=>copy(l.latex)],['Graph this expression',()=>{problem.curves.push({id:uid(),latex:l.latex,color:colors[problem.curves.length%4]});renderCurves();switchMode('graph');save();}],['Delete line',()=>{if(problem.lines.length===1){l.latex='';l.why='';}else problem.lines.splice(problem.lines.indexOf(l),1);renderLines();save();}]];
for(const [label,run]of options){const b=document.createElement('button');b.textContent=label;b.onclick=()=>{closeMenu();run();};menu.append(b);}document.body.append(menu);const r=e.target.getBoundingClientRect();menu.style.right='8px';menu.style.top=Math.max(8,Math.min(r.bottom,innerHeight-menu.offsetHeight-12))+'px';}
function closeMenu(){document.querySelector('.menu')?.remove();}
document.addEventListener('pointerdown',e=>{if(!e.target.closest('.menu,.more'))closeMenu();});
async function copy(s){try{await navigator.clipboard.writeText(s);toast('Copied. Paste into Math Academy.');}catch{prompt('Copy this expression:',s);}}
$$('.tabs button').forEach(b=>b.onclick=()=>switchMode(b.dataset.mode));
function switchMode(m){if(m!==mode)inkRecognition.cancel();mode=m;active=null;activeLine=null;$$('.tabs button').forEach(b=>b.classList.toggle('on',b.dataset.mode===m));$$('.view').forEach(v=>v.classList.toggle('on',v.id==='view-'+(m==='moves'?'steps':m)));$('#movesPanel').hidden=m!=='moves';$('#kb').hidden=true;save();requestAnimationFrame(()=>{if(mode!==m)return;resizeCanvases();if(m==='steps'||m==='moves')focusLine(problem.lines.length-1);});}
const operand=$('#operand');operand.mathVirtualKeyboardPolicy='manual';operand.popoverPolicy='off';operand.menuItems=[];operand.addEventListener('focus',()=>{active=operand;$('#kb').hidden=false;if(!$('#kb .k.down'))renderKB();});
$$('[data-op]').forEach(b=>b.onclick=()=>{const l=activeLine||problem.lines.at(-1);try{const ex=ce.parse(l.latex),num=ce.parse(operand.value);const n=evaluate(num.json);if(!Number.isFinite(n)||n===0)throw new Error('Use a finite nonzero number.');if(ex.operator!=='Equal')throw new Error('Select an equation with = first.');const op=b.dataset.op;const left=ce.box([op,ex.op1.json,num.json]).simplify(),right=ce.box([op,ex.op2.json,num.json]).simplify();const index=problem.lines.indexOf(l);problem.lines.splice(index+1,0,{id:uid(),latex:left.latex+'='+right.latex,why:({Add:'+',Subtract:'−',Multiply:'×',Divide:'÷'})[op]+' '+operand.getValue('ascii-math')});renderLines();save();focusLine(index+1);}catch(err){toast(err.message||'That operation is not supported yet.');}});

// Custom touch-first keyboard: digits get the space, not a QWERTY alphabet.
const key=(label,value=label,cls='',alt=null)=>({label,value,cls,alt});
const cmd=(label,value,cls='s')=>key(label,'@'+value,cls);
function renderKB(){if(!active)return;const kb=$('#kb');kb.replaceChildren();
const bar=document.createElement('div');bar.className='kbbar';
for(const [id,label]of [['numbers','123'],['functions','ƒ(x)'],['letters','abc']]){const b=document.createElement('button');b.textContent=label;b.classList.toggle('on',keysPage===id);b.onpointerdown=e=>e.preventDefault();b.onclick=()=>{keysPage=id;renderKB();};bar.append(b);}
const sp=document.createElement('span');sp.className='sp';bar.append(sp);
const layout=document.createElement('button');layout.textContent=state.layout==='big'?'4 wide':'5 compact';layout.title='Switch numpad layout';layout.onpointerdown=e=>e.preventDefault();layout.onclick=()=>{state.layout=state.layout==='big'?'compact':'big';renderKB();save();};bar.append(layout);
const hide=document.createElement('button');hide.textContent='⌄';hide.title='Hide keyboard';hide.onpointerdown=e=>e.preventDefault();hide.onclick=()=>{active?.blur();$('#kb').hidden=true;};bar.append(hide);kb.append(bar);
const templates=[key('<span class="tex">▢ / ▢</span>','\\frac{#@}{#?}','s'),key('<span class="tex">x<sup>▢</sup></span>','^{#?}','s'),key('√▢','\\sqrt{#?}','s'),key('( )','\\left(#?\\right)','s'),cmd('↶','undo')];
addKeyRow(templates,5,42);
if(keysPage==='numbers'){
addKeyRow([...(state.layout==='big'?[key('x','x','s','^{2}'),key('y','y','s','^{3}')]:[key('x²','x^{2}','s'),key('y²','y^{2}','s')]),key('π','\\pi','s'),cmd('←','moveToPreviousChar'),cmd('→ / out','moveToNextChar')],5,40);
if(state.layout==='big'){
addKeyRow([key('7'),key('8'),key('9'),key('÷','\\frac{#@}{#?}','op'),key('4'),key('5'),key('6'),key('×','\\cdot','op'),key('1'),key('2'),key('3'),key('−','-','op'),key('0'),key('.'),key('='),key('+','+','op')],4,58);
addKeyRow([cmd('⌫','deleteBackward'),cmd('←','moveToPreviousChar'),cmd('→ / out','moveToNextChar'),key('↵ step','@next','b')],4,46);
}else{
addKeyRow([key('7'),key('8'),key('9'),key('x','x','op','^{2}'),cmd('⌫','deleteBackward'),key('4'),key('5'),key('6'),key('×','\\cdot','op'),key('y','y','s','^{3}'),key('1'),key('2'),key('3'),key('−','-','op'),cmd('←','moveToPreviousChar'),key('0'),key('.'),key('='),key('+','+','op'),key('↵','@next','b')],5,58);
}
}else if(keysPage==='functions'){
addKeyRow([key('sin','\\sin\\left(#?\\right)','s'),key('cos','\\cos\\left(#?\\right)','s'),key('tan','\\tan\\left(#?\\right)','s'),key('ln','\\ln\\left(#?\\right)','s'),key('log','\\log_{#?}\\left(#?\\right)','s'),key('eˣ','e^{#?}','s'),key('∫','\\int_{#?}^{#?} #? \\, dx','s'),key('d/dx','\\frac{d}{dx}','s'),key('∑','\\sum_{n=#?}^{#?} #?','s'),key('lim','\\lim_{x\\to #?} #?','s'),key('|x|','\\left|#?\\right|','s'),key('∞','\\infty','s'),key('θ','\\theta','s'),key('≤','\\le','s'),key('≥','\\ge','s'),key('±','\\pm','s'),key('x₂','_{#?}','s'),key('!','!','s'),cmd('⌫','deleteBackward'),cmd('→ / out','moveToNextChar')],4,48);
addKeyRow([key('123','@numbers','s'),cmd('←','moveToPreviousChar'),key('↵ next step','@next','b')],3,44);
}else{
addKeyRow('abcdefghijklmnopqrstuvwx'.split('').map(v=>key(v,v)),6,46);
addKeyRow([key('y'),key('z'),key('θ','\\theta'),key('α','\\alpha'),key('β','\\beta'),cmd('⌫','deleteBackward')],6,46);
addKeyRow([key('123','@numbers','s'),cmd('←','moveToPreviousChar'),cmd('→','moveToNextChar'),key('↵ step','@next','b')],4,46);
}
function addKeyRow(items,cols,h){const grid=document.createElement('div');grid.className='kgrid';grid.style.setProperty('--cols',cols);grid.style.setProperty('--h',h+'px');for(const k of items){const b=document.createElement('button');b.className='k '+k.cls;b.setAttribute('aria-label',k.label.replace(/<[^>]+>/g,''));const span=document.createElement('span');span.innerHTML=k.label;b.append(span);if(k.alt){const alt=document.createElement('sup');alt.textContent=k.alt==='^{2}'?'²':'³';b.append(alt);}bindKey(b,k);grid.append(b);}kb.append(grid);}
requestAnimationFrame(()=>{if((mode==='steps'||mode==='moves')&&active)active.closest('.line')?.scrollIntoView({block:'nearest'});resizeCanvases();});
}
function bindKey(b,k){let start=null,repeat=null,bubble=null,flick=false;
const isReturn=k.value==='@next';
const showCopy=()=>{if(!start)return;flick=performance.now()-start.time>=350&&start.y-start.lastY>24;b.classList.toggle('flick',flick);if(bubble)bubble.textContent=flick?'Copy line ↓':'Slide ↑ to copy';};
const clean=()=>{clearTimeout(repeat);b.classList.remove('down','flick');bubble?.remove();bubble=null;};
b.addEventListener('pointerdown',e=>{e.preventDefault();start={x:e.clientX,y:e.clientY,lastY:e.clientY,time:performance.now()};flick=false;b.setPointerCapture(e.pointerId);b.classList.add('down');if(k.value==='@deleteBackward'){applyKey(k.value);const again=()=>{applyKey(k.value);repeat=setTimeout(again,85);};repeat=setTimeout(again,420);}else{bubble=document.createElement('div');bubble.className='bubble';bubble.innerHTML=isReturn?'Blank line ↓':k.label;const r=b.getBoundingClientRect();bubble.style.left=r.left+r.width/2+'px';bubble.style.top=r.top+'px';document.body.append(bubble);if(isReturn)repeat=setTimeout(showCopy,350);}});
b.addEventListener('pointermove',e=>{if(!start)return;start.lastY=e.clientY;if(isReturn){showCopy();return;}if(!k.alt)return;flick=start.y-e.clientY>18;b.classList.toggle('flick',flick);if(bubble)bubble.textContent=flick?(k.alt==='^{2}'?'x²':'y³'):k.label;});
b.addEventListener('pointerup',e=>{e.preventDefault();if(!start)return;if(isReturn){start.lastY=e.clientY;showCopy();}if(k.value!=='@deleteBackward')applyKey(isReturn&&flick?'@copyNext':flick?k.value+k.alt:k.value);start=null;clean();});b.addEventListener('pointercancel',()=>{start=null;clean();});
}
function applyKey(v){if(v==='@numbers'){keysPage='numbers';renderKB();return;}if((v==='@next'||v==='@copyNext')&&mode==='ink'){const fields=$$('#view-ink math-field');const next=fields[fields.indexOf(active)+1];if(next)next.focus();else{active?.blur();$('#kb').hidden=true;}return;}if(v==='@next'){nextLine();return;}if(v==='@copyNext'){nextLine(false);return;}if(!active||!active.isConnected)return;const f=active;f.focus();if(v.startsWith('@'))f.executeCommand(v.slice(1));else f.insert(v,{format:'latex',focus:true,selectionMode:v.includes('#?')?'placeholder':'after',feedback:false});f.dispatchEvent(new Event('input',{bubbles:true}));}

// Question capture stays local; only cropped handwriting has a recognition endpoint.
$('#qToggle').onclick=()=>{qOpen=!qOpen;$('#qpane').hidden=!qOpen;$('#qToggle').classList.toggle('on',qOpen);requestAnimationFrame(resizeCanvases);};
function renderQ(){const host=$('#qBody');host.replaceChildren();if(problem.qImage){const img=document.createElement('img');img.src=problem.qImage;img.alt='Pinned question';host.append(img);}else if(problem.qText){const ta=document.createElement('textarea');ta.value=problem.qText;ta.oninput=()=>{problem.qText=ta.value;save();};host.append(ta);}else{const d=document.createElement('div');d.className='qempty';d.textContent='Pin a screenshot of your question or type it. Your work stays on this device.';host.append(d);}}
$('#qText').onclick=()=>{problem.qImage=null;problem.qText=problem.qText||' ';renderQ();$('#qBody textarea').focus();save();};
$('#qFile').onchange=async e=>{const f=e.target.files[0];if(!f)return;try{const bitmap=await createImageBitmap(f);const c=document.createElement('canvas');const s=Math.min(1,1400/bitmap.width);c.width=bitmap.width*s;c.height=bitmap.height*s;c.getContext('2d').drawImage(bitmap,0,0,c.width,c.height);problem.qImage=c.toDataURL('image/jpeg',.82);bitmap.close();renderQ();save();}catch{toast('Could not open that image. Try a screenshot.');}e.target.value='';};
$('#qClear').onclick=()=>{if(confirm('Remove the pinned question?')){problem.qText='';problem.qImage=null;renderQ();save();}};
$('#qWeb').onclick=()=>{window.open('https://www.mathacademy.com','_blank','noopener');toast('Use a screenshot to pin the question here.');};
let divStart=null;$('#qDivider').onpointerdown=e=>{e.preventDefault();$('#qDivider').setPointerCapture(e.pointerId);divStart={y:e.clientY,h:$('#qpane').offsetHeight};};$('#qDivider').onpointermove=e=>{if(!divStart)return;$('#qpane').style.height=Math.max(90,Math.min(innerHeight*.65,divStart.h+e.clientY-divStart.y))+'px';resizeCanvases();};$('#qDivider').onpointerup=()=>divStart=null;$('#qDivider').onpointercancel=()=>divStart=null;

// Ink belongs only to the current line. Earlier work is a separate editable history.
$('#inkPen').onclick=()=>{const palette=$('#inkPalette');palette.hidden=!palette.hidden;$('#inkPen').setAttribute('aria-expanded',String(!palette.hidden));};
$$('#inkTools [data-pen]').forEach(b=>b.onclick=()=>{pen=b.dataset.pen;$$('#inkTools [data-pen]').forEach(x=>x.classList.toggle('on',x===b));$('#inkPalette').hidden=true;$('#inkPen').setAttribute('aria-expanded','false');if(pen!=='erase')$('#inkPen i').style.background=pen;});
const inkHistories=new Map();let lastInkTap=null;
function inkHistory(){if(!inkHistories.has(problem.id))inkHistories.set(problem.id,[]);return inkHistories.get(problem.id);}
function rememberInk(){const h=inkHistory();h.push({strokes:structuredClone(problem.strokes),pan:inkPan,lineId:problem.inkLineId,conversions:structuredClone(problem.inkConversions||[])});if(h.length>30)h.shift();}
function undoInk(){inkRecognition.cancel();const old=inkHistory().pop();if(old){problem.strokes=old.strokes;inkPan=old.pan;problem.inkLineId=old.lineId;problem.inkConversions=old.conversions.map(g=>{const current=problem.inkConversions?.find(c=>c.id===g.id);return current?.lines?.length?{...g,status:current.status,lines:structuredClone(current.lines),joined:current.joined,position:structuredClone(current.position),reader:current.reader,warnings:structuredClone(current.warnings||[])}:g;});}else if(problem.strokes.length)problem.strokes.pop();else if(problem.inkConversions?.length){const group=problem.inkConversions.pop();problem.strokes=group.strokes;problem.inkLineId=group.lineId;}lastInkTap=null;inkRecognition.renderTyped();resizeCanvases();drawInk();save();}
$('#inkUndo').onclick=undoInk;
$('#inkClear').onclick=()=>{if(confirm('Clear the unconverted handwriting? Recognized math is kept.')){inkRecognition.cancel();rememberInk();problem.strokes=[];inkPan=0;lastInkTap=null;drawInk();save();}};
const ic=$('#inkCanvas');
const recognitionSession=unlockRecognition();
const inkRecognition=createInkRecognition({getProblem:()=>problem,isDrawing:()=>!!inkStroke||!!inkGesture,sessionReady:recognitionSession,makeField:field,remember:rememberInk,save,redraw:()=>requestAnimationFrame(resizeCanvases),hideKeyboard:()=>{active?.blur();active=null;$('#kb').hidden=true;},toast,toSteps:lines=>{inkRecognition.cancel();problem.lines.push(...lines.map(l=>({id:uid(),latex:l.latex,why:'From handwriting'})));renderLines();switchMode('steps');save();},setPan:pan=>inkPan=pan,getPan:()=>inkPan});
function releaseInkLayout(){if(pointerMap.size)return;$('#inkPast').style.flex='';$('#inkScroll').style.flex='';}
ic.onpointerdown=e=>{e.preventDefault();if(!pointerMap.size){if(!$('#kb').hidden){$('#inkPast').style.flex='0 0 '+$('#inkPast').getBoundingClientRect().height+'px';$('#inkScroll').style.flex='0 0 '+ic.getBoundingClientRect().height+'px';}inkRecognition.beginWriting();}ic.setPointerCapture(e.pointerId);pointerMap.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pointerMap.size===2){lastInkTap=null;inkStroke=null;inkGesture={start:[...pointerMap.values()].reduce((s,p)=>s+p.y,0)/2,pan:inkPan};drawInk();return;}if(pointerMap.size===1){const r=ic.getBoundingClientRect();lastInkTap=lastInkTap?.problem===problem.id?lastInkTap:null;inkStroke={color:pen,started:performance.now(),pts:[[e.clientX-r.left,e.clientY-r.top+inkPan]]};drawInk();}};
ic.onpointermove=e=>{if(!pointerMap.has(e.pointerId))return;e.preventDefault();pointerMap.set(e.pointerId,{x:e.clientX,y:e.clientY});if(inkGesture&&pointerMap.size>=2){drawInk();}else if(inkStroke&&pointerMap.size===1){const r=ic.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)return;const p=[e.clientX-r.left,e.clientY-r.top+inkPan];if(Math.hypot(p[0]-inkStroke.pts.at(-1)[0],p[1]-inkStroke.pts.at(-1)[1])>1){inkStroke.pts.push(p);drawInk();}}};
function inkEnd(e){pointerMap.delete(e.pointerId);if(inkGesture){if(pointerMap.size===0){inkGesture=null;releaseInkLayout();inkRecognition.renderTyped();}return;}if(inkStroke){const stroke=inkStroke;inkStroke=null;releaseInkLayout();const tap=performance.now()-stroke.started<260&&stroke.pts.every(p=>Math.hypot(p[0]-stroke.pts[0][0],p[1]-stroke.pts[0][1])<10);if(tap&&lastInkTap&&performance.now()-lastInkTap.time<340&&Math.hypot(stroke.pts[0][0]-lastInkTap.x,stroke.pts[0][1]-lastInkTap.y)<28){undoInk();inkRecognition.recognize();return;}rememberInk();problem.strokes.push(stroke);inkRecognition.renderTyped();lastInkTap=tap?{problem:problem.id,time:performance.now(),x:stroke.pts[0][0],y:stroke.pts[0][1]}:null;drawInk();save();}}
ic.onpointerup=inkEnd;ic.onpointercancel=e=>{pointerMap.clear();inkGesture=null;inkStroke=null;releaseInkLayout();inkRecognition.renderTyped();drawInk();};
ic.addEventListener('wheel',e=>e.preventDefault(),{passive:false});
function drawInk(){const ctx=ic.getContext('2d');ctx.clearRect(0,0,inkWidth,inkHeight);ctx.fillStyle='#12151b';ctx.fillRect(0,0,inkWidth,inkHeight);
// Grid lives below a separate stroke layer, so erase does not remove the grid.
ctx.strokeStyle='#1c212b';ctx.lineWidth=1;ctx.beginPath();for(let x=0;x<=inkWidth;x+=26){ctx.moveTo(x,0);ctx.lineTo(x,inkHeight);}for(let y=-(inkPan%26);y<=inkHeight;y+=26){ctx.moveTo(0,y);ctx.lineTo(inkWidth,y);}ctx.stroke();
const layer=document.createElement('canvas');layer.width=ic.width;layer.height=ic.height;const lc=layer.getContext('2d');const dpr=ic.width/inkWidth;lc.scale(dpr,dpr);lc.lineCap='round';lc.lineJoin='round';
for(const s of [...problem.strokes,...(inkStroke?[inkStroke]:[])]){lc.globalCompositeOperation=s.color==='erase'?'destination-out':'source-over';lc.strokeStyle=s.color==='erase'?'#000':s.color;lc.fillStyle=lc.strokeStyle;lc.lineWidth=s.width??(s.color==='erase'?22:2.6);lc.beginPath();s.pts.forEach(([x,y],i)=>i?lc.lineTo(x,y-inkPan):lc.moveTo(x,y-inkPan));if(s.pts.length===1){lc.arc(s.pts[0][0],s.pts[0][1]-inkPan,lc.lineWidth/2,0,Math.PI*2);lc.fill();}else lc.stroke();}ctx.drawImage(layer,0,0,inkWidth,inkHeight);ctx.fillStyle='#566075';ctx.font='12px -apple-system, sans-serif';ctx.fillText('Write here · double-tap to convert · New line moves it above',12,inkHeight-12);inkRecognition.pan();}

// Graph: real plotting from parsed math, pinch/drag, point inspection, snapped shapes.
function renderCurves(){const host=$('#curves');host.replaceChildren();problem.curves.forEach(c=>{const row=document.createElement('div');row.className='curve';const sw=document.createElement('span');sw.className='sw';sw.style.background=c.color;const f=field(c.latex,v=>{c.latex=v;drawGraph();});f.addEventListener('focus',()=>{$$('.curve').forEach(x=>x.classList.toggle('active',x===row));});const x=document.createElement('button');x.className='x';x.textContent='×';x.onclick=()=>{problem.curves.splice(problem.curves.indexOf(c),1);if(active===f){active=null;$('#kb').hidden=true;}renderCurves();drawGraph();save();};row.append(sw,f,x);host.append(row);});const add=document.createElement('button');add.className='chip addCurve';add.textContent='+ curve';add.onclick=addCurve;host.append(add);}
function addCurve(){problem.curves.push({id:uid(),latex:'y=',color:colors[problem.curves.length%4]});renderCurves();const fields=$$('#curves math-field');fields.at(-1)?.focus();drawGraph();save();}
const gc=$('#graphCanvas');let gw=390,gh=300;
const world=(x,y)=>[(x-gw/2)/graph.scale+graph.cx,(gh/2-y)/graph.scale+graph.cy];
const screen=(x,y)=>[gw/2+(x-graph.cx)*graph.scale,gh/2-(y-graph.cy)*graph.scale];
function drawGraph(){const ctx=gc.getContext('2d');if(!gw||!gh)return;ctx.clearRect(0,0,gw,gh);ctx.fillStyle='#12151b';ctx.fillRect(0,0,gw,gh);
const [xmin,ymax]=world(0,0),[xmax,ymin]=world(gw,gh);const raw=50/graph.scale,pow=10**Math.floor(Math.log10(raw)),step=(raw/pow<2?1:raw/pow<5?2:5)*pow;
if(graph.axes){ctx.strokeStyle='#242a36';ctx.lineWidth=1;ctx.font='10px -apple-system,sans-serif';ctx.fillStyle='#687389';for(let x=Math.ceil(xmin/step)*step;x<=xmax;x+=step){const sx=screen(x,0)[0];ctx.beginPath();ctx.moveTo(sx,0);ctx.lineTo(sx,gh);ctx.stroke();if(Math.abs(x)>step*.001)ctx.fillText(fmt(x),sx+3,Math.max(12,Math.min(gh-6,screen(0,0)[1]+13)));}for(let y=Math.ceil(ymin/step)*step;y<=ymax;y+=step){const sy=screen(0,y)[1];ctx.beginPath();ctx.moveTo(0,sy);ctx.lineTo(gw,sy);ctx.stroke();if(Math.abs(y)>step*.001)ctx.fillText(fmt(y),Math.max(3,Math.min(gw-30,screen(0,0)[0]+4)),sy-3);}ctx.strokeStyle='#5c6577';const [ax,ay]=screen(0,0);ctx.beginPath();ctx.moveTo(ax,0);ctx.lineTo(ax,gh);ctx.moveTo(0,ay);ctx.lineTo(gw,ay);ctx.stroke();}
let errs=[];for(const c of problem.curves){if(!c.latex||c.latex==='y=')continue;try{const expr=curveExpression(ce.parse(c.latex).json);ctx.strokeStyle=c.color;ctx.lineWidth=2.5;ctx.beginPath();let prev=null;for(let sx=0;sx<=gw;sx+=1.5){const x=world(sx,0)[0],y=evaluate(expr,{x});const sy=screen(x,y)[1];if(!Number.isFinite(sy)||Math.abs(sy)>gh*8){prev=null;continue;}if(prev!==null&&Math.abs(sy-prev)<gh*.8)ctx.lineTo(sx,sy);else ctx.moveTo(sx,sy);prev=sy;}ctx.stroke();}catch{errs.push('Use y=f(x), e.g. y=sin(x)');}}
for(const shape of problem.shapes){ctx.strokeStyle='#74c0fc';ctx.fillStyle='#4dabf715';ctx.lineWidth=2.4;ctx.beginPath();shape.pts.forEach(([x,y],i)=>{const [sx,sy]=screen(x,y);i?ctx.lineTo(sx,sy):ctx.moveTo(sx,sy);});if(shape.closed)ctx.closePath();ctx.stroke();if(shape.closed)ctx.fill();if(shape.label){const avg=shape.pts.reduce((a,p)=>[a[0]+p[0]/shape.pts.length,a[1]+p[1]/shape.pts.length],[0,0]);const [sx,sy]=screen(...avg);ctx.fillStyle='#ffd43b';ctx.font='16px -apple-system,sans-serif';ctx.fillText(shape.label,sx,sy);}}
if(graph.stroke){ctx.strokeStyle='#74c0fc';ctx.lineWidth=2.4;ctx.beginPath();graph.stroke.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.stroke();}
ctx.fillStyle='#687389';ctx.font='12px -apple-system,sans-serif';ctx.fillText(errs[0]||(graph.mode==='draw'?'Draw a line or triangle. Tap a shape to label.':'Drag · pinch to zoom · tap a curve'),10,gh-10);}
function fmt(x){return Number(x.toPrecision(4)).toString();}
$$('#graphTools [data-gmode]').forEach(b=>b.onclick=()=>{graph.mode=b.dataset.gmode;active?.blur();active=null;$('#kb').hidden=true;$$('#graphTools [data-gmode]').forEach(x=>x.classList.toggle('on',x===b));resizeCanvases();});
$('#gAxes').onclick=()=>{graph.axes=!graph.axes;drawGraph();};$('#gUndo').onclick=()=>{problem.shapes.pop();drawGraph();save();};$('#gHome').onclick=()=>{graph.cx=0;graph.cy=0;graph.scale=32;drawGraph();};
gc.onpointerdown=e=>{e.preventDefault();gc.setPointerCapture(e.pointerId);const r=gc.getBoundingClientRect();const p=[e.clientX-r.left,e.clientY-r.top];graph.points.set(e.pointerId,p);$('#graphTip').hidden=true;if(graph.points.size===2){graph.stroke=null;const ps=[...graph.points.values()];graph.gesture={type:'pinch',dist:Math.hypot(ps[0][0]-ps[1][0],ps[0][1]-ps[1][1]),scale:graph.scale,center:world((ps[0][0]+ps[1][0])/2,(ps[0][1]+ps[1][1])/2)};}else if(graph.points.size===1){graph.gesture={type:graph.mode==='draw'?'draw':'move',start:p,cx:graph.cx,cy:graph.cy,moved:false};if(graph.mode==='draw')graph.stroke=[p];}};
gc.onpointermove=e=>{if(!graph.points.has(e.pointerId))return;const r=gc.getBoundingClientRect(),p=[e.clientX-r.left,e.clientY-r.top];graph.points.set(e.pointerId,p);const g=graph.gesture;if(!g)return;if(g.type==='pinch'&&graph.points.size===2){const ps=[...graph.points.values()];const dist=Math.hypot(ps[0][0]-ps[1][0],ps[0][1]-ps[1][1]);graph.scale=Math.max(5,Math.min(400,g.scale*dist/Math.max(1,g.dist)));const mx=(ps[0][0]+ps[1][0])/2,my=(ps[0][1]+ps[1][1])/2;graph.cx=g.center[0]-(mx-gw/2)/graph.scale;graph.cy=g.center[1]+(my-gh/2)/graph.scale;}else if(graph.points.size===1&&g.type!=='pinch'){if(Math.hypot(p[0]-g.start[0],p[1]-g.start[1])>5)g.moved=true;if(g.type==='draw'&&graph.stroke)graph.stroke.push(p);else{graph.cx=g.cx-(p[0]-g.start[0])/graph.scale;graph.cy=g.cy+(p[1]-g.start[1])/graph.scale;}}drawGraph();};
gc.onpointerup=e=>{graph.points.delete(e.pointerId);const g=graph.gesture;if(!g)return;if(g.type==='draw'&&graph.stroke&&g.moved){const snapped=snapStroke(graph.stroke);problem.shapes.push({pts:snapped.pts.map(p=>world(...p)),closed:snapped.closed,label:''});save();}else if(!g.moved&&g.type!=='pinch')inspectGraph(g.start);graph.stroke=null;if(!graph.points.size)graph.gesture=null;drawGraph();};
gc.onpointercancel=()=>{graph.points.clear();graph.gesture=null;graph.stroke=null;drawGraph();};
gc.addEventListener('wheel',e=>{e.preventDefault();graph.scale=Math.max(5,Math.min(400,graph.scale*Math.exp(-e.deltaY*.002)));drawGraph();},{passive:false});
function inspectGraph(p){let closest=null,dist=24;const [x]=world(...p);for(const c of problem.curves){try{const ex=curveExpression(ce.parse(c.latex).json),y=evaluate(ex,{x});const sy=screen(x,y)[1],d=Math.abs(sy-p[1]);if(d<dist){dist=d;closest={x,y,c};}}catch{}}
if(closest){const tip=$('#graphTip');tip.textContent=`(${fmt(x)}, ${fmt(closest.y)})`;tip.style.left=Math.max(65,Math.min(gw-65,p[0]))+'px';tip.style.top=screen(x,closest.y)[1]+'px';tip.hidden=false;return;}
for(const s of problem.shapes){const ps=s.pts.map(p=>screen(...p));const xs=ps.map(p=>p[0]),ys=ps.map(p=>p[1]);if(p[0]>=Math.min(...xs)-15&&p[0]<=Math.max(...xs)+15&&p[1]>=Math.min(...ys)-15&&p[1]<=Math.max(...ys)+15){const label=prompt('Label this shape',s.label);if(label!==null){s.label=label;drawGraph();save();}return;}}}
function resizeCanvases(){const dpr=Math.min(2,devicePixelRatio||1);if(mode==='ink'){const r=$('#inkScroll').getBoundingClientRect();inkWidth=r.width;inkHeight=r.height;if(!inkWidth||!inkHeight)return;ic.width=inkWidth*dpr;ic.height=inkHeight*dpr;ic.style.width=inkWidth+'px';ic.style.height=inkHeight+'px';ic.getContext('2d').scale(dpr,dpr);drawInk();}if(mode==='graph'){const r=$('#graphWrap').getBoundingClientRect();gw=r.width;gh=r.height;if(!gw||!gh)return;gc.width=gw*dpr;gc.height=gh*dpr;gc.getContext('2d').scale(dpr,dpr);drawGraph();}}
new ResizeObserver(()=>resizeCanvases()).observe($('main'));
new ResizeObserver(()=>resizeCanvases()).observe($('#inkScroll'));
window.addEventListener('resize',resizeCanvases);
updateProblems();renderLines();renderCurves();renderQ();inkRecognition.renderTyped();switchMode(mode);
