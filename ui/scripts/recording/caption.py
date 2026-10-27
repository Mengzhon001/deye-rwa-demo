import sys,json,glob,os
from PIL import Image,ImageDraw,ImageFont
spec=json.load(open(sys.argv[1]))
fonts=glob.glob('/System/Library/AssetsV2/com_apple_MobileAsset_Font7/*/AssetData/PingFang.ttc')+['/System/Library/Fonts/STHeiti Medium.ttc']
font=ImageFont.truetype(next(p for p in fonts if os.path.exists(p)),38)
for item in spec:
 if item.get('metric'):
  if not item['text']:Image.new('RGBA',(2,2),(0,0,0,0)).save(item['path']);continue
  im=Image.new('RGB',(1860,40),'#102834');d=ImageDraw.Draw(im)
  small=ImageFont.truetype(next(p for p in fonts if os.path.exists(p)),26)
  if d.textlength(item['text'],font=small)>1820:raise ValueError('Transaction annotation too wide')
  d.text((0,4),item['text'],font=small,fill='#9edecb');im.save(item['path']);continue
 if item.get('badge'):
  im=Image.new('RGB',(600,32),'#091a25');d=ImageDraw.Draw(im)
  small=ImageFont.truetype(next(p for p in fonts if os.path.exists(p)),24)
  d.text((600-d.textlength(item['text'],font=small),0),item['text'],font=small,fill='#9edecb');im.save(item['path']);continue
 if item.get('banner'):
  im=Image.new('RGB',(2560,60),'#102834');d=ImageDraw.Draw(im)
  d.text((52,10),item['text'],font=font,fill='#9edecb');im.save(item['path']);continue
 im=Image.new('RGB',(2560,120),'#102834');d=ImageDraw.Draw(im);lines=['']
 for char in item['text']:
  if d.textlength(lines[-1]+char,font=font)>2360:lines.append(char)
  else:lines[-1]+=char
 if len(lines)>2:raise ValueError('Subtitle exceeds two lines')
 y=(120-len(lines)*56)//2
 for line in lines:
  d.text(((2560-d.textlength(line,font=font))/2,y),line,font=font,fill='#f2f8f8');y+=56
 im.save(item['path'])
