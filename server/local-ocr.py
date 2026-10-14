"""Persistent, memory-only BTTR recognition worker. No image/result logging."""
import base64,ctypes,io,json,os,sys
from PIL import Image,ImageOps
import numpy as np
from scipy.ndimage import label,find_objects,binary_erosion,grey_erosion
Image.MAX_IMAGE_PIXELS=2400000
lib=ctypes.CDLL(os.environ['MATH_MODE_OCR_LIBRARY'])
lib.crispembed_ocr_model_init.argtypes=[ctypes.c_char_p,ctypes.c_int];lib.crispembed_ocr_model_init.restype=ctypes.c_void_p
lib.crispembed_ocr_model_recognize.argtypes=[ctypes.c_void_p,ctypes.c_char_p,ctypes.c_int,ctypes.c_int,ctypes.c_int,ctypes.POINTER(ctypes.c_int)];lib.crispembed_ocr_model_recognize.restype=ctypes.c_char_p
lib.crispembed_ocr_model_mean_confidence.argtypes=[ctypes.c_void_p];lib.crispembed_ocr_model_mean_confidence.restype=ctypes.c_float
lib.crispembed_ocr_model_free.argtypes=[ctypes.c_void_p]
ctx=lib.crispembed_ocr_model_init(os.environ['MATH_MODE_OCR_MODEL'].encode(),2)
if not ctx:sys.exit(1)
def send(data):print(json.dumps(data),flush=True)
send({'ready':True})
try:
 for line in sys.stdin:
  request=json.loads(line)
  try:
   image=Image.open(io.BytesIO(base64.b64decode(request['image'],validate=True)))
   if image.format!='PNG' or image.width*image.height>2400000:raise ValueError()
   image=image.convert('L');box=ImageOps.invert(image).getbbox()
   if not box:raise ValueError()
   image=image.crop(box)
   # Connected-component heights keep superscripts and stacked fractions intact.
   # Horizontal fraction/equality bars do not dictate the character scale.
   ink=np.asarray(image)<180;labels,count=label(ink)
   if count>6000:raise ValueError()
   heights=[o[0].stop-o[0].start for o in find_objects(labels) if o and o[0].stop-o[0].start>=8 and (o[1].stop-o[1].start)<4*(o[0].stop-o[0].start)]
   glyph=float(np.median(heights)) if heights else image.height
   scale=min(36/max(1,glyph),200/image.height,900/image.width)
   # The reader expects pen strokes about 3 px wide at its 36 px character height.
   # Phone ink is thin relative to large handwriting; without thickening, a 6
   # becomes an i and whole equations fail. Thicken (never thin) to match.
   edge=ink&~binary_erosion(ink);width=2*ink.sum()/max(1,edge.sum());grow=int(round(3/scale-width))
   if grow>=1:image=Image.fromarray(grey_erosion(np.asarray(ImageOps.expand(image,border=grow,fill=255)),size=(grow+1,grow+1)))
   image=image.resize((max(1,round(image.width*scale)),max(1,round(image.height*scale))),Image.Resampling.LANCZOS)
   image=ImageOps.expand(image,border=10,fill=255)
   n=ctypes.c_int();text=lib.crispembed_ocr_model_recognize(ctx,image.tobytes(),image.width,image.height,1,ctypes.byref(n))
   if not text:raise ValueError()
   confidence=float(lib.crispembed_ocr_model_mean_confidence(ctx))
   send({'id':request['id'],'text':text.decode(),'confidence':confidence})
  except Exception:send({'id':request.get('id'),'error':'Could not read handwriting'})
finally:lib.crispembed_ocr_model_free(ctx)
