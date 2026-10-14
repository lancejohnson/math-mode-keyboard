// Pure helpers shared by the app and the tests. Never eval user expressions.
export function curveExpression(json) {
  if (Array.isArray(json) && json[0] === 'Equal') {
    if (json[1] !== 'y') throw new Error('Use y=f(x)');
    return json[2];
  }
  return json;
}
export function evaluate(e, vars = {}) {
  if (typeof e === 'number') return e;
  if (typeof e === 'string') {
    if (Object.hasOwn(vars, e)) return vars[e];
    if (e === 'Pi') return Math.PI;
    if (e === 'ExponentialE') return Math.E;
    throw new Error('Unknown variable: '+e);
  }
  if (e && !Array.isArray(e) && typeof e === 'object' && 'num' in e) return Number(e.num);
  if (!Array.isArray(e)) throw new Error('Incomplete expression');
  const [op,...args] = e;
  const a=args.map(x=>evaluate(x, vars));
  switch(op) {
    case 'Add': return a.reduce((x,y)=>x+y,0);
    case 'Subtract': return a[0]-a[1];
    case 'Negate': return -a[0];
    case 'Multiply': return a.reduce((x,y)=>x*y,1);
    case 'Divide': case 'Rational': return a[0]/a[1];
    case 'Power': return a[0]**a[1];
    case 'Square': return a[0]**2;
    case 'Sqrt': return Math.sqrt(a[0]);
    case 'Root': return a[0]**(1/a[1]);
    case 'Sin': return Math.sin(a[0]);
    case 'Cos': return Math.cos(a[0]);
    case 'Tan': return Math.tan(a[0]);
    case 'Arcsin': return Math.asin(a[0]);
    case 'Arccos': return Math.acos(a[0]);
    case 'Arctan': return Math.atan(a[0]);
    case 'Abs': return Math.abs(a[0]);
    case 'Ln': return Math.log(a[0]);
    case 'Log': return Math.log(a[0])/Math.log(a[1]??10);
    case 'Exp': return Math.exp(a[0]);
    case 'Floor': return Math.floor(a[0]);
    case 'Ceil': return Math.ceil(a[0]);
    case 'Min': return Math.min(...a);
    case 'Max': return Math.max(...a);
    default: throw new Error('Unsupported function: '+op);
  }
}
function distanceToSegment(p,a,b) {
  const dx=b[0]-a[0],dy=b[1]-a[1];
  const t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy||1)));
  return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);
}
function simplify(pts,tolerance) {
  if (pts.length<=2) return pts;
  let max=0,index=0;
  for(let i=1;i<pts.length-1;i++){const d=distanceToSegment(pts[i],pts[0],pts.at(-1));if(d>max){max=d;index=i;}}
  return max>tolerance ? [...simplify(pts.slice(0,index+1),tolerance).slice(0,-1),...simplify(pts.slice(index),tolerance)] : [pts[0],pts.at(-1)];
}
export function snapStroke(pts) {
  if(pts.length<2) return {pts,closed:false};
  const closed=pts.length>5&&Math.hypot(pts[0][0]-pts.at(-1)[0],pts[0][1]-pts.at(-1)[1])<30;
  const clean=simplify(pts,12);
  if(closed)clean.pop();
  // Straighten nearly horizontal / vertical segments, not arbitrary triangles.
  if(clean.length===2&&!closed){const [a,b]=clean;if(Math.abs(a[0]-b[0])<16)b[0]=a[0];if(Math.abs(a[1]-b[1])<16)b[1]=a[1];}
  return {pts:clean,closed:closed&&clean.length>=3};
}
