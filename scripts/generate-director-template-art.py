from pathlib import Path
from PIL import Image, ImageDraw
import math
root=Path(__file__).resolve().parents[1] / 'docs/director-bundle/templates'
# Original deterministic editorial illustrations, not generated model outputs.
for name,coat,accent in [('outfit-before','#d8caac','#e88f5d'),('outfit-after','#4889a8','#c9e56b')]:
 im=Image.new('RGB',(720,1280),'#141d26'); d=ImageDraw.Draw(im)
 for y in range(1280):
  t=y/1280; d.line((0,y,720,y),fill=(int(20+13*t),int(29+12*t),int(38+13*t)))
 d.ellipse((40,100,680,740),fill=accent)
 d.ellipse((154,858,566,920),fill='#101720')
 d.rounded_rectangle((256,580,344,885),30,fill='#263645')
 d.rounded_rectangle((376,580,464,885),30,fill='#263645')
 d.rounded_rectangle((239,852,345,896),18,fill='#e8e1d2');d.rounded_rectangle((375,852,481,896),18,fill='#e8e1d2')
 d.ellipse((305,195,415,320),fill='#b97a57')
 d.polygon([(278,310),(318,295),(360,335),(402,295),(442,310),(510,480),(457,506),(425,410),(437,650),(283,650),(295,410),(263,506),(210,480)],fill=coat)
 d.line((360,335,360,650),fill='#182330',width=5)
 d.polygon([(318,295),(360,335),(334,390),(303,321)],fill='#f0e5cc');d.polygon([(402,295),(360,335),(386,390),(417,321)],fill='#f0e5cc')
 d.rounded_rectangle((298,475,342,530),5,outline='#536071',width=3); d.rounded_rectangle((378,475,422,530),5,outline='#536071',width=3)
 d.line((58,72,662,72),fill='#6c7b87',width=2)
 im.save(root/(name+'.png'))
im=Image.new('RGB',(720,1280),'#191c32');d=ImageDraw.Draw(im)
for y in range(1280):
 t=y/1280;d.line((0,y,720,y),fill=(int(25+15*t),int(28+4*t),int(50+15*t)))
for i in range(34,-1,-1):
 radius=35+i*8; cx=360+math.sin(i*.1)*60;cy=490
 d.ellipse((cx-radius,cy-radius,cx+radius,cy+radius),fill=('#f1b6a2' if i%2 else '#4d448b'))
d.ellipse((298,428,422,552),fill='#dafa81');d.line((48,70,672,70),fill='#c9c3df',width=2)
im.save(root/'poster-motion.png')
