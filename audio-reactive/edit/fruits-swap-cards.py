# Pixel typography cards + overlays for the Dance with Fruits swap edit. 256x144 canvas, x8 nearest -> 2048x1152.
# Usage: fruits-swap-cards.py OUT NEXT_NAME... --mids MID0 MID1 ...  (a card per swap, an overlay per mid-loop word)
import os, sys
from PIL import Image, ImageDraw, ImageFont
S=sys.argv[1]
args=sys.argv[2:]; names=args[:args.index('--mids')] if '--mids' in args else args
mids=args[args.index('--mids')+1:] if '--mids' in args else []
NOKIA="/Users/radek/Library/Fonts/nokiafc22.ttf"; RETRO="/Users/radek/Library/Fonts/Retro Gaming.ttf"
W,H=256,144; BG=(14,14,16); FG=(245,245,240); ACC=(199,255,0); DIM=(120,120,118)
big=ImageFont.truetype(NOKIA,24); mid=ImageFont.truetype(NOKIA,16); small=ImageFont.truetype(RETRO,8)
def up(im): return im.resize((W*8,H*8),Image.NEAREST)
def text_w(d,t,f): b=d.textbbox((0,0),t,font=f); return b[2]-b[0], b[3]-b[1]
def card_frame(word1, w1_slide, word2, typed, cursor_on, line3=None, fade=1.0, footer="GENOBI"):
    im=Image.new("RGB",(W,H),BG); d=ImageDraw.Draw(im)
    # footer / header chrome, Nokia-menu feel
    d.rectangle([0,0,W-1,9],fill=(22,22,26)); d.text((4,1),"DANCE WITH FRUITS",font=small,fill=DIM)
    d.text((4,H-10),footer,font=small,fill=ACC); d.text((W-4-text_w(d,"24FPS",small)[0],H-10),"24FPS",font=small,fill=DIM)
    y=40
    if word1:
        tw,th=text_w(d,word1,big); x=(W-tw)//2 - int((1-w1_slide)*W)  # slides in from left in pixel steps
        d.text((x,y),word1,font=big,fill=FG)
    if word2:
        shown=word2[:typed]; tw,th=text_w(d,word2,big); x=(W-tw)//2
        d.text((x,y+34),shown,font=big,fill=ACC)
        if cursor_on:
            cw=text_w(d,shown,big)[0] if shown else 0
            d.rectangle([x+cw+2,y+36,x+cw+2+12,y+36+20],fill=ACC)
    if line3:
        tw,th=text_w(d,line3,mid); d.text(((W-tw)//2,y+72),line3,font=mid,fill=FG)
    if fade<1.0:
        im=Image.blend(Image.new("RGB",(W,H),(0,0,0)),im,fade)
    return up(im)
def seq(name,frames):
    os.makedirs(f"{S}/cards/{name}",exist_ok=True)
    for i,fr in enumerate(frames): fr.save(f"{S}/cards/{name}/{i:04d}.png")
    print(name,len(frames))
def swap_card(word2,n=31,beat2=14):
    fr=[]
    for i in range(n):
        if i<beat2:
            slide=min(1.0,(i+1)/4)  # 4-frame pixel slide
            fr.append(card_frame("SWAP",slide,None,0,False))
        else:
            j=i-beat2; typed=min(len(word2),j+1); cursor=(j//3)%2==0
            fr.append(card_frame("SWAP",1.0,word2,typed,cursor))
    return fr
for i,name in enumerate(names): seq(f"card{i}",swap_card(name))
# outro: 42 frames. beats at 0,14,28. GENOBI typed, then DANCE WITH FRUITS, hold, fade last 8.
fr=[]
for i in range(42):
    typed=min(6,i+1) if i<14 else 6
    line3="DANCE WITH FRUITS" if i>=14 else None
    cursor=((i//3)%2==0) if i<28 else False
    fade=1.0 if i<34 else max(0.0,(41-i)/8)
    fr.append(card_frame(None,1.0,"GENOBI",typed,cursor,line3,fade,footer="genobi.pages.dev"))
seq("outro",fr)
# overlays (RGBA): title typed top-centre over the first loop's voice; a mid-loop word typed bottom-centre
def overlay(name,text,n,font,y,color):
    os.makedirs(f"{S}/ov/{name}",exist_ok=True)
    for i in range(n):
        im=Image.new("RGBA",(W,H),(0,0,0,0)); d=ImageDraw.Draw(im)
        shown=text[:min(len(text),i+1)]; tw,th=text_w(d,text,font); x=(W-tw)//2
        d.rectangle([x-4,y-3,x+tw+4,y+th+5],fill=(0,0,0,150))
        d.text((x,y),shown,font=font,fill=color)
        if (i//3)%2==0 and i<n-4:
            cw=text_w(d,shown,font)[0]; d.rectangle([x+cw+2,y+1,x+cw+2+8,y+th],fill=color)
        up(im).save(f"{S}/ov/{name}/{i:04d}.png")
    print(name,n)
overlay("title","DANCE WITH FRUITS",35,mid,14,(245,245,240,255))
for i,word in enumerate(mids):
    if word: overlay(f"mid{i}",word,29,mid,114,(199,255,0,255))
