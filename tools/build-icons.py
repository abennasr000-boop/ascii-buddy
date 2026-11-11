# Generates src/ui/iconBitmaps.ts from small drawing helpers. The output strings are the source of truth
# (edit them directly once an icon is right); this script exists to keep symmetric shapes exact.
import re,sys
path='src/ui/iconBitmaps.ts'
src=open(path).read()
hs_block=src[src.index('  // The provided pixel-art'):src.index('  pen: [')]

def canvas(): return [['.']*16 for _ in range(16)]
def put(c,cells):
    for x,y in cells:
        if 0<=x<16 and 0<=y<16: c[y][x]='#'
def clear(c,cells):
    for x,y in cells:
        if 0<=x<16 and 0<=y<16: c[y][x]='.'
def out(c): return [''.join(r) for r in c]
def hline(y,x0,x1): return [(x,y) for x in range(x0,x1+1)]
def vline(x,y0,y1): return [(x,y) for y in range(y0,y1+1)]
def rect(x0,y0,x1,y1): return hline(y0,x0,x1)+hline(y1,x0,x1)+vline(x0,y0,y1)+vline(x1,y0,y1)
def fillrect(x0,y0,x1,y1): return [(x,y) for y in range(y0,y1+1) for x in range(x0,x1+1)]
def rows(c,spec):  # spec: {y:[(x0,x1),...]}
    for y,runs in spec.items():
        for a,b in runs: put(c,hline(y,a,b))
icons={}

# ---- pen: a pencil, top right to bottom left
c=canvas()
rows(c,{1:[(12,13)],2:[(11,14)],3:[(10,13)],4:[(9,12)],5:[(8,11)],6:[(7,10)],7:[(6,9)],8:[(5,8)],9:[(4,7)],10:[(3,6)],11:[(3,4)],12:[(2,3)],13:[(2,2)]})
clear(c,[(10,3),(11,4)])
icons['pen']=out(c)

# ---- eraser: a slanted block, upper part outlined, lower part solid, with a rubbing line
c=canvas()
rows(c,{3:[(9,13)],4:[(8,12)],5:[(7,11)],6:[(6,10)],7:[(5,9)],8:[(4,8)],9:[(3,7)]})
clear(c,[(10,4),(11,4),(9,5),(10,5),(8,6),(9,6)])
put(c,hline(12,2,10)); put(c,hline(13,2,10))
icons['eraser']=out(c)

# ---- fill: a drop of paint landing in a puddle
c=canvas()
rows(c,{1:[(7,8)],2:[(7,8)],3:[(6,9)],4:[(6,9)],5:[(5,10)],6:[(5,10)],7:[(4,11)],8:[(4,11)],9:[(4,11)],10:[(5,10)],11:[(6,9)]})
clear(c,[(6,8),(6,9),(5,9)])
put(c,hline(13,2,13)); put(c,hline(14,4,11))
icons['fill']=out(c)

# ---- eyedropper
c=canvas()
put(c,[(12,1),(13,1),(11,2),(12,2),(13,2),(14,2),(11,3),(12,3),(13,3),(14,3),(12,4),(13,4)])
put(c,[(9,4),(10,4),(10,5),(11,5),(11,6),(12,6)])
for i in range(6): put(c,[(9-i,7+i),(10-i,7+i)])
put(c,[(3,13),(2,14)])
icons['eyedropper']=out(c)

# ---- photo
c=canvas()
put(c,rect(1,2,14,13)); put(c,fillrect(4,4,5,5))
rows(c,{7:[(9,9)],8:[(8,10)],9:[(4,4),(7,11)],10:[(3,12)],11:[(2,13)],12:[(2,13)]})
icons['photo']=out(c)

# ---- eyeOff: the eye (small pupil) struck through by a two-pixel slash, one clear pixel either side
eye_off=[
'................','................','................','................',
'.....######.....','...##......##...','..#..........#..','.#....####....#.',
'.#....####....#.','..#..........#..','...##......##...','.....######.....',
'................','................','................','................']
c=[list(r) for r in eye_off]
for y in range(1,15):
    for x in range(1,15):
        if x-y in (-1,2): clear(c,[(x,y)])
for y in range(2,14):
    for x in (y,y+1):
        if x<=14: put(c,[(x,y)])
icons['eyeOff']=out(c)

# ---- undo / redo
c=canvas()
put(c,[(1,5),(1,6),(2,4),(2,5),(2,6),(2,7),(3,3),(3,4),(3,5),(3,6),(3,7),(3,8)])
put(c,fillrect(4,5,9,6)); put(c,fillrect(10,5,11,6)); put(c,[(12,6),(12,7)])
put(c,fillrect(11,7,12,10)); put(c,[(10,11),(11,11),(9,12),(10,12)])
put(c,fillrect(5,11,9,12))
icons['undo']=[('.'+r[:-1]) for r in out(c)]  # nudged right so the arrow sits centred on the tile
icons['redo']=[r[::-1] for r in icons['undo']]

# ---- transport
def tri_right(c,x0,h):
    top=(16-h)//2
    for i in range(h//2): put(c,vline(x0+i,top+i,top+h-1-i))
def tri_left(c,x1,h):
    top=(16-h)//2
    for i in range(h//2): put(c,vline(x1-i,top+i,top+h-1-i))
c=canvas(); tri_left(c,10,10); icons['previous']=out(c)
c=canvas(); tri_right(c,5,10); icons['next']=out(c)

# ---- layers: a stack of three sheets seen from the side
c=canvas()
top=[(7,2),(8,2),(5,3),(6,3),(9,3),(10,3),(3,4),(4,4),(11,4),(12,4),(1,5),(2,5),(13,5),(14,5),(3,6),(4,6),(11,6),(12,6),(5,7),(6,7),(9,7),(10,7),(7,8),(8,8)]
put(c,top)
for dy in (3,6):
    put(c,[(1,5+dy),(2,5+dy),(3,6+dy),(4,6+dy),(5,7+dy),(6,7+dy),(7,8+dy),(8,8+dy),(9,7+dy),(10,7+dy),(11,6+dy),(12,6+dy),(13,5+dy),(14,5+dy)])
icons['layers']=out(c)

# ---- heart (the app menu: ascii_buddy<3)
c=canvas()
rows(c,{2:[(2,5),(10,13)],3:[(1,6),(9,14)],4:[(1,14)],5:[(1,14)],6:[(1,14)],7:[(2,13)],8:[(3,12)],9:[(4,11)],10:[(5,10)],11:[(6,9)],12:[(7,8)]})
icons['heart']=out(c)

# ---- more (three dots)
c=canvas()
put(c,fillrect(2,7,3,8)+fillrect(7,7,8,8)+fillrect(12,7,13,8))
icons['more']=out(c)

# ---- new frame
c=canvas()
put(c,rect(1,5,10,14)); put(c,vline(12,1,5)); put(c,hline(3,10,14))
icons['newFrame']=out(c)

# merge with the existing file: keep everything not regenerated here
existing={}
for m in re.finditer(r"  (\w+): \[\n((?:    '[.#]{16}',\n){16})\n?  \],\n", src):
    existing[m.group(1)]=[l.strip().strip("',") for l in m.group(2).strip().split('\n')]
existing.update(icons)
order=['hammerAndSickle','pen','eraser','fill','eyedropper','select','plus','photo','eye','eyeOff','lock','lockOpen','onion','info','play','stop','first','previous','next','last','newFrame','heart','more','layers','undo','redo','chevronDown','chevronUp','focus']
final=src[:src.index('export const ICON_BITMAPS')]+"export const ICON_BITMAPS: Record<string, string[]> = {\n"+hs_block
for k in order:
    if k=='hammerAndSickle': continue
    rowsK=existing[k]; assert len(rowsK)==16 and all(len(r)==16 for r in rowsK),k
    final+="  %s: [\n%s  ],\n\n"%(k,''.join("    '%s',\n"%r for r in rowsK))
final=final.rstrip()+"\n};\n"
open(path,'w').write(final)
print('ok')
