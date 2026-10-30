from pathlib import Path
from PIL import Image, ImageDraw
import math
root=Path(__file__).resolve().parents[1] / 'docs/director-bundle/templates'
# Original deterministic editorial illustrations, not generated model outputs.
# Retained poster fixture used by media-import tests, not an offered template.
im=Image.new('RGB',(720,1280),'#191c32');d=ImageDraw.Draw(im)
for y in range(1280):
 t=y/1280;d.line((0,y,720,y),fill=(int(25+15*t),int(28+4*t),int(50+15*t)))
for i in range(34,-1,-1):
 radius=35+i*8; cx=360+math.sin(i*.1)*60;cy=490
 d.ellipse((cx-radius,cy-radius,cx+radius,cy+radius),fill=('#f1b6a2' if i%2 else '#4d448b'))
d.ellipse((298,428,422,552),fill='#dafa81');d.line((48,70,672,70),fill='#c9c3df',width=2)
im.save(root/'poster-motion.png')
