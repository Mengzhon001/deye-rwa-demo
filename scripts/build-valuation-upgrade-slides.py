from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE, MSO_CONNECTOR
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pathlib import Path

OUT=Path('docs/valuation-upgrade')
OUT.mkdir(parents=True,exist_ok=True)
p=Presentation();p.slide_width=Inches(13.333);p.slide_height=Inches(7.5)
NAVY=RGBColor(24,28,98); BLUE=RGBColor(11,93,170); TEAL=RGBColor(27,145,145); INK=RGBColor(32,38,51); MUTED=RGBColor(77,91,106); PALE=RGBColor(237,245,251); WHITE=RGBColor(255,255,255); GREY=RGBColor(220,228,235)
FONT='Noto Sans CJK SC'
def rect(s,x,y,w,h,fill=WHITE,line=None,radius=False):
 sh=s.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE if radius else MSO_SHAPE.RECTANGLE, Inches(x), Inches(y), Inches(w), Inches(h));sh.fill.solid();sh.fill.fore_color.rgb=fill;sh.line.color.rgb=line or fill;return sh
def txt(s,x,y,w,h,value,size=18,color=INK,bold=False,align=None):
 sh=s.shapes.add_textbox(Inches(x),Inches(y),Inches(w),Inches(h));tf=sh.text_frame;tf.word_wrap=True;tf.vertical_anchor=MSO_ANCHOR.MIDDLE;tf.margin_left=tf.margin_right=Inches(.06);tf.margin_top=tf.margin_bottom=Inches(.03)
 for i,line in enumerate(value.split('\n')):
  q=tf.paragraphs[0] if i==0 else tf.add_paragraph();q.text=line;q.font.name=FONT;q.font.size=Pt(size);q.font.bold=bold;q.font.color.rgb=color;q.space_after=Pt(8)
  if align is not None:q.alignment=align
 return sh
def base(title,n,subtitle=''):
 s=p.slides.add_slide(p.slide_layouts[6]);rect(s,0,0,13.333,.12,NAVY);txt(s,.62,.35,11.7,.7,title,28,NAVY,True);txt(s,.65,1.02,11.9,.45,subtitle,13,MUTED);rect(s,.62,7.08,12.05,.015,GREY);txt(s,.65,7.12,8,.22,'NTU – Deye  |  估值模型与设备准入',10,MUTED);txt(s,12,7.12,.6,.22,str(n),10,MUTED,align=PP_ALIGN.RIGHT);return s
def box(s,x,y,w,h,title,body='',accent=BLUE):
 rect(s,x,y,w,h,PALE,accent,True);txt(s,x+.18,y+.13,w-.36,.48,title,17,accent,True);txt(s,x+.18,y+.65,w-.36,h-.75,body,14,INK)
def arrow(s,x1,y1,x2,y2):
 ln=s.shapes.add_connector(MSO_CONNECTOR.STRAIGHT,Inches(x1),Inches(y1),Inches(x2),Inches(y2));ln.line.color.rgb=BLUE;ln.line.width=Pt(2)
def bullets(s,items,x=.75,y=1.68,w=11.8,spacing=.76,size=18):
 for i,item in enumerate(items):txt(s,x,y+i*spacing,w,spacing-.04,'• '+item,size,INK)
# cover
s=p.slides.add_slide(p.slide_layouts[6]);rect(s,0,0,13.333,7.5,NAVY);txt(s,.8,1.05,11.5,2.3,'NTU - Deye\nRWA 平台估值模型升级',32,WHITE,True);txt(s,.82,4.05,11.1,1.2,'公开保险数据、设备老化与剩余权益准入\n三个测试环境共用的实施与验证',19,WHITE);txt(s,.83,6.6,8,.3,'2026 年 11 月 26 日  |  项目技术汇报',13,WHITE)
s=base('本次升级解决三个问题',2,'估值依据、设备状态和申请准入必须指向同一份证据')
box(s,.7,1.7,3.8,3.4,'折现率','公开保险理赔揭示灾害类型与损失严重度。缺少承保暴露量时，不从索赔次数直接推算年风险溢价。');box(s,4.77,1.7,3.8,3.4,'设备老化','组件发电衰减与电池容量衰减分开建模。设备更换费用进入对应月份现金流。',TEAL);box(s,8.83,1.7,3.8,3.4,'权益准入','收益权期限必须由经审核的剩余使用寿命支持。超期或电池健康度不足时自动拒绝。')
txt(s,.85,5.6,11.8,.7,'现有已签协议和已发行产品保持原值。新规则只作用于新申请和明确发起的重新估值。',16,NAVY,True)
s=base('目前系统的基线与缺口',3,'三种发电预测方法共用一套现金流与折现公式')
for i,(a,b) in enumerate([('长期历史季节性','最多 36 个月实测记录'),('近期上网比例','用近期完整日修正上网分配'),('PVGIS 辐照基线','历史气象形成未来季节性情景')]):box(s,.75+i*4.16,1.7,3.8,2.0,a,b)
txt(s,.8,4.15,11.8,1.5,'现有模型已按年衰减发电量，默认 0.7%。它尚未单列电池 SOH、设备剩余寿命和更换费用，也没有用公开保险数据校准风险溢价。',19,INK)
s=base('设备数据进入申请的路径',4,'API 明确提供的字段可预填，缺失字段由业主补录')
for i,(a,b) in enumerate([('德业 API','电站与明确标注的设备字段'),('业主表单','投运日期、寿命、SOH、维护方案'),('中介核对','检查证据、单位和冲突'),('参数快照','用于报价、准入与审批')]):
 x=.7+i*3.18;box(s,x,2.05,2.85,2.25,a,b,TEAL if i==2 else BLUE)
 if i<3:arrow(s,x+2.85,3.18,x+3.18,3.18)
txt(s,.8,5.3,11.7,.75,'SOC 反映当前充电量，不能用作电池健康度 SOH。API 没有提供 SOH 时，界面必须保留空项与资料来源。',17,NAVY,True)
s=base('申请准入决策',5,'缺资料先补录，确认不足则硬性拒绝')
for i,(a,b) in enumerate([('资料齐全？','缺项进入补充材料'),('中介审核？','核对投运日期与检测依据'),('寿命覆盖？','五年权益不得超过剩余寿命'),('电池达标？','更换前 SOH 不低于审核下限')]):
 x=.7+i*3.18;box(s,x,1.9,2.85,2.55,a,b)
 if i<3:arrow(s,x+2.85,3.18,x+3.18,3.18)
rect(s,.75,5.2,11.8,.8,PALE,TEAL,True);txt(s,1,5.35,11.2,.45,'通过后才能形成正式报价。被拒申请保留原因，可补充维修或更换方案后重新申请。',16,TEAL,True)
s=base('组件与电池分别老化',6,'图示为模型关系，不代表当前上海电站的实测曲线')
box(s,.7,1.7,5.7,3.9,'光伏组件','历史电量已包含截至估值日的状态。未来按审核的年性能衰减率预测，PVGIS 情景须与设备年龄和实测表现校准。');box(s,6.85,1.7,5.7,3.9,'储能电池','以 SOH、年容量衰减和依赖储能的自用比例预测未来分配。低于运行下限前须完成更换，更换成本按月计入。',TEAL)
s=base('逐期现金流如何变化',7,'不同风险要进入正确的现金流或折现率位置')
for i,(a,b) in enumerate([('发电量','组件状态 × 可用率'),('自用与上网','电池 SOH × 经审核依赖比例'),('收入','业主电费 + 合格售电回款'),('净现金流','扣运营、维修和更换成本')]):
 x=.6+i*3.2;box(s,x,2.0,2.9,2.4,a,b)
 if i<3:arrow(s,x+2.9,3.2,x+3.2,3.2)
txt(s,.8,5.1,11.5,.8,'已在预计现金流扣除的损失，不得再完整加入折现率风险溢价。',18,NAVY,True)
s=base('公开保险数据能提供什么',8,'NREL 六年光伏理赔分析适合识别灾害类型与严重程度')
box(s,.75,1.65,5.75,3.75,'可以使用','识别火灾、冰雹、风灾等风险类别；比较索赔严重程度；为情景分析和证据审阅提供公开出处。',TEAL)
box(s,6.8,1.65,5.75,3.75,'不能直接推算','报告没有与上海电站匹配的承保设备年数。理赔次数不是年度发生概率；保费率也不是收益权风险溢价。')
txt(s,.85,5.8,11.7,.5,'来源：NREL/TP-6A20-78588《Insurance in the Operation of Photovoltaic Plants》',13,MUTED)
s=base('折现率校准框架',9,'10% 目前仍是演示假设，6% 与 14% 用于敏感性分析')
for i,(a,b) in enumerate([('同币种基准','期限匹配的低风险利率'),('收款风险','业主缴费与电网结算'),('设备与灾害','扣除现金流损失后的剩余风险'),('其他风险','合同执行、流动性、USDC')]):
 x=.7+i*3.18;box(s,x,2,2.85,2.5,a,b)
 if i<3:arrow(s,x+2.85,3.25,x+3.18,3.25)
txt(s,.8,5.3,11.7,.7,'只有取得可比承保暴露量、损失金额和覆盖条款后，才能把公开保险资料转化为可信的定量校准。',16,NAVY,True)
s=base('三环境共用一套模型',10,'三个入口具有独立产品与业务状态，估值逻辑由同一代码实现')
box(s,.85,1.75,3.55,2.3,'私有链','完整生命周期演示');box(s,4.9,1.75,3.55,2.3,'Base Sepolia','公共链兼容性测试');box(s,8.95,1.75,3.55,2.3,'Local Oracle on Sepolia','报告登记与账单核验')
rect(s,2.0,5.1,9.35,.85,PALE,TEAL,True);txt(s,2.2,5.27,8.95,.46,'共用：申请证据、设备准入、三种估值基线、逐期现金流与折现报告',16,TEAL,True)
s=base('从申请到报价的业务时序',11,'每一步保留角色、依据和审批记录')
for i,(a,b) in enumerate([('业主','提交设备资料'),('中介','核对 API 与表单'),('模型','计算剩余寿命和现金流'),('中介','报价或自动拒绝'),('受托人','复核并批准报价')]):
 x=.45+i*2.55;box(s,x,2.05,2.25,2.4,a,b,TEAL if i==2 else BLUE)
 if i<4:arrow(s,x+2.25,3.25,x+2.55,3.25)
txt(s,.8,5.2,11.8,.7,'资料缺失先补录；不合格原因返回申请记录；新报价不得覆盖已经签署的历史条款。',16,NAVY,True)
s=base('验收与交付',12,'以真实状态和可复核文件验证，不把演示假设写成实证')
bullets(s,['三环境同一输入得到一致估值；旧产品、合约和历史报告不变。','覆盖缺资料、API 与填报冲突、寿命不足、电池更换和拒绝路径。','中英文网站 Documentation 与操作手册说明公式、来源和申请步骤。','公开保险数据只提供风险参考，10% 仍标为未校准的演示假设。'],y=1.65,spacing=1.05,size=18)
path=OUT/'Deye_Valuation_Equipment_Insurance_2026-11-26.zh.pptx';p.save(path);print(path)
