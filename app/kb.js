// The Math Mode keyboard: digits get the space, not a QWERTY alphabet. Shared by the workspace and the courses.
// kb: the #kb element. active(): the focused math-field. special(v): handle @next/@copyNext (return true if handled).
export function createKeyboard(kb,{active,getLayout,setLayout,special=()=>false,afterRender=()=>{}}){
let keysPage='numbers';
const key=(label,value=label,cls='',alt=null)=>({label,value,cls,alt});
const cmd=(label,value,cls='s')=>key(label,'@'+value,cls);
function renderKB(){if(!active())return;kb.replaceChildren();
const bar=document.createElement('div');bar.className='kbbar';
for(const [id,label]of [['numbers','123'],['functions','ƒ(x)'],['letters','abc']]){const b=document.createElement('button');b.textContent=label;b.classList.toggle('on',keysPage===id);b.onpointerdown=e=>e.preventDefault();b.onclick=()=>{keysPage=id;renderKB();};bar.append(b);}
const sp=document.createElement('span');sp.className='sp';bar.append(sp);
const layout=document.createElement('button');layout.textContent=getLayout()==='big'?'4 wide':'5 compact';layout.title='Switch numpad layout';layout.onpointerdown=e=>e.preventDefault();layout.onclick=()=>{setLayout(getLayout()==='big'?'compact':'big');renderKB();};bar.append(layout);
const hide=document.createElement('button');hide.textContent='⌄';hide.title='Hide keyboard';hide.onpointerdown=e=>e.preventDefault();hide.onclick=()=>{active()?.blur();kb.hidden=true;};bar.append(hide);kb.append(bar);
const templates=[key('<span class="tex">▢ / ▢</span>','\\frac{#@}{#?}','s'),key('<span class="tex">x<sup>▢</sup></span>','^{#?}','s'),key('√▢','\\sqrt{#?}','s'),key('( )','\\left(#?\\right)','s'),cmd('↶','undo')];
addKeyRow(templates,5,42);
if(keysPage==='numbers'){
addKeyRow([...(getLayout()==='big'?[key('x','x','s','^{2}'),key('y','y','s','^{3}')]:[key('x²','x^{2}','s'),key('y²','y^{2}','s')]),key('π','\\pi','s'),cmd('←','moveToPreviousChar'),cmd('→ / out','moveToNextChar')],5,40);
if(getLayout()==='big'){
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
requestAnimationFrame(afterRender);
}
function bindKey(b,k){let start=null,repeat=null,bubble=null,flick=false;
const isReturn=k.value==='@next';
const showCopy=()=>{if(!start)return;flick=performance.now()-start.time>=350&&start.y-start.lastY>24;b.classList.toggle('flick',flick);if(bubble)bubble.textContent=flick?'Copy line ↓':'Slide ↑ to copy';};
const clean=()=>{clearTimeout(repeat);b.classList.remove('down','flick');bubble?.remove();bubble=null;};
b.addEventListener('pointerdown',e=>{e.preventDefault();start={x:e.clientX,y:e.clientY,lastY:e.clientY,time:performance.now()};flick=false;b.setPointerCapture(e.pointerId);b.classList.add('down');if(k.value==='@deleteBackward'){applyKey(k.value);const again=()=>{applyKey(k.value);repeat=setTimeout(again,85);};repeat=setTimeout(again,420);}else{bubble=document.createElement('div');bubble.className='bubble';bubble.innerHTML=isReturn?'Blank line ↓':k.label;const r=b.getBoundingClientRect();bubble.style.left=r.left+r.width/2+'px';bubble.style.top=r.top+'px';document.body.append(bubble);if(isReturn)repeat=setTimeout(showCopy,350);}});
b.addEventListener('pointermove',e=>{if(!start)return;start.lastY=e.clientY;if(isReturn){showCopy();return;}if(!k.alt)return;flick=start.y-e.clientY>18;b.classList.toggle('flick',flick);if(bubble)bubble.textContent=flick?(k.alt==='^{2}'?'x²':'y³'):k.label;});
b.addEventListener('pointerup',e=>{e.preventDefault();if(!start)return;if(isReturn){start.lastY=e.clientY;showCopy();}if(k.value!=='@deleteBackward')applyKey(isReturn&&flick?'@copyNext':flick?k.value+k.alt:k.value);start=null;clean();});b.addEventListener('pointercancel',()=>{start=null;clean();});
}
function applyKey(v){if(v==='@numbers'){keysPage='numbers';renderKB();return;}if(special(v))return;const f=active();if(!f||!f.isConnected)return;f.focus();if(v.startsWith('@'))f.executeCommand(v.slice(1));else f.insert(v,{format:'latex',focus:true,selectionMode:v.includes('#?')?'placeholder':'after',feedback:false});f.dispatchEvent(new Event('input',{bubbles:true}));}
return {render:renderKB,apply:applyKey};
}
