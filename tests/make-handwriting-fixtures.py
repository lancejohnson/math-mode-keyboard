"""Manually drawn stroke fixtures, not typeset text and not Lance's handwriting."""
import json
from pathlib import Path
from PIL import Image,ImageDraw
root=Path(__file__).parent/'fixtures';root.mkdir(exist_ok=True)
paths={
 'x':[[(0,0),(15,25),(35,55)],[(32,0),(18,26),(0,56)]],
 '1':[[(0,12),(15,0),(15,58)]],
 '2':[[(0,10),(10,0),(28,0),(38,10),(36,23),(24,35),(0,57),(39,57)]],
 '3':[[(0,6),(30,0),(47,8),(48,20),(29,29),(46,36),(49,52),(29,62),(1,57)]],
 '5':[[(40,0),(0,0),(0,25),(28,22),(40,29),(41,48),(25,59),(0,54)]],
 '+':[[(0,25),(50,25)],[(25,0),(25,50)]],
 '-':[[(0,25),(45,25)]],
 '=':[[(0,15),(50,15)],[(0,35),(50,35)]]}
def fixture(name,items,extra=()):
 strokes=[]
 for char,x,y,scale in items:
  for path in paths[char]:strokes.append({'color':'#7dd3fc','pts':[[x+px*scale,y+py*scale] for px,py in path]})
 strokes += [{'color':'#7dd3fc','pts':p} for p in extra]
 (root/(name+'.json')).write_text(json.dumps(strokes))
 im=Image.new('RGB',(650,280),'white');d=ImageDraw.Draw(im)
 for s in strokes:d.line([tuple(p) for p in s['pts']],fill='black',width=4,joint='curve')
 im.save(root/(name+'.png'))
fixture('quadratic',[('x',40,115,1),('2',88,65,.65),('+',153,116,1),('2',243,112,1),('x',301,115,1),('=',382,118,1),('3',481,112,1)])
fixture('fraction',[('2',45,50,1),('x',102,50,1),('+',160,53,1),('3',229,48,1),('x',95,163,1),('-',158,164,1),('1',220,164,1),('=',350,112,1),('5',453,108,1)],extra=[[[35,137],[296,135]]])
fixture('wrong-arithmetic',[('2',50,110,1),('+',128,110,1),('2',215,110,1),('=',300,110,1),('5',400,110,1)])
