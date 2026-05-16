/**
 * Vercel Serverless Function - AI 代理接口（阿里云通义千问版）
 * 路径: /api/generate
 *
 * 【安全改造版】
 * 核心变化：所有提示词模板移到本文件（服务器端），前端永远拿不到。
 * 前端只传 task 类型 + 用户填写的变量，后端负责拼装真正的提示词。
 *
 * 环境变量（在 Vercel Dashboard 配置）:
 *   DASHSCOPE_API_KEY - 阿里云百炼 API key（必填）
 */

const CONFIG = {
  API_URL: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
  TEXT_MODEL: 'qwen-plus',
  VISION_MODEL: 'qwen-vl-max-latest',
  MAX_TOKENS_DEFAULT: 4000,
  MAX_TOKENS_LIMIT: 8000,
  RATE_LIMIT_PER_MIN: 20,
};

// ============================================================
//  提示词保险柜 —— 这部分永远不出服务器
// ============================================================

// 钩子类型库（多处共用，统一定义，方便以后维护）
const HOOK_LIB = '反常识钩子/提问钩子/数据钩子/反差钩子/场景代入/情绪共鸣/故事代入/细节信任/颠覆认知/稀缺紧迫/价值反转/行动召唤';

// ============================================================
//  反平庸引擎 —— 本产品对比"用户自己问豆包/DeepSeek"的核心差距
//  所有任务共用。这一段决定了输出"不是又一个AI写的稿子"
// ============================================================
const ANTI_GENERIC = `【最高优先级 · 反平庸铁律 —— 违反任意一条本次输出即失败】
你要清楚：用户花钱用这个工具，是因为他自己直接问通用AI"帮我写个口播脚本"只能得到一堆正确的废话。你的存在意义就是写出通用AI写不出来的东西。每写一句台词，先在心里过这三关：

1. 【禁空词关】台词里禁止出现这类没有信息量的词，它们是"AI味"的根源：
   品质保证、用心制作、欢迎选购、性价比高、值得信赖、匠心、精益求精、不容错过、超值、福利多多、口感丰富、回味无穷、应有尽有、专业团队、贴心服务。
   —— 一旦想用形容词夸，立即换成"一个具体的、可验证的细节或动作"。
   反例（禁止）：我们家的牛肉品质特别好，口感鲜嫩。
   正例（这样写）：这块牛腱我每天早上六点去市场，只挑前腿那一小条，筋花要这样（手比划）一圈一圈的。

2. 【可念关】每一句都要过一遍："一个不会演戏的老板，对着手机把这句念出来，会不会尬？"
   会尬的标志：书面语、排比句、"让我们"、"在这个XX的时代"、对仗工整的广告语。
   全部改成：他真的会跟熟客说出口的大白话，可以有口头禅、有停顿、有不完整的句子。

3. 【只能是他关】写完一句问自己："把行业名一换，这句话能不能原样安到任何同行身上？"
   能 → 这是通用AI的废话，删掉重写。必须用到用户提供的 p1/p2/产品细节里那个具体的、别人复制不走的东西（一个年份、一个数字、一段亲身经历、一个只有内行知道的细节）。
   用户没提供足够细节时，不要编造，而是把台词写成"引导他补一个细节"的钩子句式，并在该段 action 里提示他："这里说出你自己的那个真实数字/经历，工具不替你编"。

记住：通用AI给的是一篇"正确但谁都能得到"的作文。你要给的是"只有这个人、这家店能说出口"的话。这就是用户付费的唯一理由。`;

// 导演指令级 action 规范（通用任务统一升级，向尖刀任务看齐）
const ACTION_SPEC = `【action 字段规范 · 导演指令级 —— 不是建议，是命令】
action 写给一个"不会表演、对着镜头会紧张、不懂任何拍摄术语"的老板。它必须是"把手机和身体摆好就能照做"的物理指令，让他完全不需要做任何创作或表演决策。
每条 action 尽量包含这四要素中的相关项：① 手机架在哪、镜头对着哪 ② 人站/坐在哪、上半身还是全身 ③ 手里拿什么道具、道具什么时候怎么动 ④ 说到哪个字时做什么动作或停顿。
✗ 禁止（这些是空话）：自然展现、眼神有神、营造氛围、表现热情、有感染力、放松一点
✓ 必须（这样具体）：手机横着架在收银台纸巾盒上，镜头对着你站的位置；你站过去露出上半身，左手拿那个旧零件；说到"二十年"时把零件举到镜头前停一秒，再放下接着说`;

// 通用 tips 字段说明
const TIPS_SPEC = `【tips 字段说明 - 重要】tips 是3项数组：
- tips[0] = 这段的「编导思路」，格式必须是【钩子类型】｜【编导理由】，用全角竖线 ｜ 分隔
  钩子类型从下面这个库里挑最合适的（根据段落在脚本中的位置和功能）：

  开头类（用于第1段）：
    · 反常识钩子（颠覆认知/制造期待，立人设）
    · 提问钩子（用问句直击用户疑问）
    · 数据钩子（用数字制造可信感和震撼）
    · 反差钩子（前后对比/期待落差）

  中段类（用于第2段到倒数第2段）：
    · 场景代入（五感唤醒/画面感强）
    · 情绪共鸣（戳痛点+否定错误认知）
    · 故事代入（用真实小故事承载产品）
    · 细节信任（专业术语/独家细节建立专家感）
    · 颠覆认知（打破用户固有印象）

  结尾类（用于最后一段）：
    · 稀缺紧迫（限时限量制造紧迫感）
    · 价值反转（"看似贵其实超划算"）
    · 行动召唤（明确告诉用户下一步做什么）

  编导理由不要写术语黑话，要写成"说给一个没学过编导的老板听的大白话"，让他看完明白"这句为什么这么说、不这么说会怎样"，15-35字。
  ✗ 反例（太术语，禁止）：运用反差修辞构建认知冲突，强化用户心智锚点
  ✓ 正例（大白话，这样写）：开头先说一句跟大家想的相反的话，是想让刷到的人愣一下、手指停住别划走
  示例：「反常识钩子｜先甩一句跟大家想的相反的，让人愣一下停下来，比平铺直叙'我是做XX的'强十倍」

- tips[1] = 拍摄要点1（构图/角度/道具，必须具体可照做，10-20字）
- tips[2] = 拍摄要点2（这句用什么语气说，要给"生活里哪个场景的语气"，不要写"热情/有感染力"这种空话，10-20字）

⚠️ 重要：不同段落要用不同的钩子类型，避免雷同。整条脚本应该有节奏起伏。`;

// 对标博主风格块（由变量拼装）
function buildBenchmarkBlock(bm) {
  if (!bm || !Array.isArray(bm.refs)) return '';
  const refs = bm.refs.filter(r => r && r.trim().length > 10);
  if (refs.length === 0) return '';
  let s = '\n\n=== 对标博主风格参考 ===\n用户想模仿下面这位博主的风格：\n';
  refs.forEach((r, i) => { s += `【参考文案${i + 1}】${r.trim()}\n`; });
  if (bm.gender) s += `博主性别：${bm.gender}\n`;
  if (bm.vibe) s += `博主调性：${bm.vibe}\n`;
  s += `\n【风格学习要求】
第一步先在心里分析这位博主的特征：
- 开场方式（设问/反差/数据/吐槽/陈述）
- 句式节奏（长短句搭配、是否爱用反问、口头禅）
- 语气和人设（亲切/犀利/专业/接地气）
- 内容结构（怎么递进、怎么收尾）

第二步再生成脚本，要做到：
✓ 句式节奏、开场方式、收尾习惯 尽量贴近对标博主
✓ 口头禅和语气词可以适度借鉴（但别照搬整句）

【重要护栏 - 严禁违反】
✗ 不要复用博主提到的具体产品、品牌、人名、地名、数字
✗ 不要说"大家好我是XX"这种把博主身份套到用户身上的话
✗ 博主举的客户案例不能照抄，必须用用户自己提供的故事(p1/p2)
✗ 学风格不学内容——内容100%必须是用户自己的产品和经历\n`;
  return s;
}

// ---------- 任务1：主脚本生成 ----------
function promptMainScript(v) {
  const n = v.n;
  const ft = ['还没开始/1000粉以内', '1000-1万粉', '1万粉以上'][v.fans] || '不确定';
  const gt = ['涨粉/提升知名度', '引流加微信/到店', '直接卖货/成交'][v.goal] || '涨粉';
  const isLong = n >= 7;
  const bmBlock = buildBenchmarkBlock(v.benchmark);
  return `你是操盘过上百个素人老板账号的短视频编导。你最痛恨的就是"正确但平庸、谁都能写出来"的脚本——因为用户花钱用你，就是不想要他自己问通用AI能得到的那种东西。生成${n}段完整口播脚本。

${ANTI_GENERIC}

用户信息：
- 行业：${v.ind}，视频类型：${v.tpl}，粉丝：${ft}，目标：${gt}
${v.p1 ? `- 个人背景：${v.p1}` : ''}
${v.p2 ? `- 过往经历：${v.p2}` : ''}
${v.prodName ? `- 产品名称：${v.prodName}` : ''}
${v.ms ? `- 主推规格价格：${v.ms}` : ''}
${v.p3detail ? `- 产品详细介绍：${v.p3detail}` : ''}
${v.imgCount ? `- 已上传${v.imgCount}张产品图片，请结合图片视觉细节` : ''}
${bmBlock}

要求：
1. 生成${n}段，完整覆盖：开头吸引→故事背景→产品亮点→价值说明→信任建立→行动转化
2. 每段台词${isLong ? '40字以内' : '25字以内'}，每段时长${isLong ? '10-15秒' : '5-8秒'}
3. 真诚自然有文化感，不像广告——按上面反平庸铁律自检每一句
4. ${v.ms ? `价格必须用"${v.ms}"，不能编造数字` : '台词不提具体价格数字'}
5. 【自检·对照锚点】生成后，从头扫一遍每一段台词，凡是"换个行业名就能照搬到任何同行身上"的句子，全部判定为不合格，必须用用户提供的具体细节重写。这一关不过，整篇作废。
${bmBlock ? '6. 风格贴近对标博主，但内容100%用用户自己的产品和故事' : ''}

${ACTION_SPEC}

${TIPS_SPEC}

严格JSON：{"segments":[{"badge":"名称","script":"台词","action":"导演指令级动作","tips":["钩子类型｜大白话理由","拍摄要点1","语气怎么说"],"dur":"时长","scene":"场景"}]}`;
}

// ---------- 任务2：粘贴文案拆分 ----------
function promptSplitText(v) {
  return `你是操盘过上百个素人老板账号的短视频编导，把下面这段文案拆分成适合真人出镜短视频的分段脚本。注意：拆分不是机械切句，是把原文重新"翻译"成一个真人对着镜头会自然说出口的样子。

${ANTI_GENERIC}

文案内容：
${v.text}

要求：
1. 根据内容自然拆分成3-10段，每段台词控制在25字以内，保留原文核心意思，但把书面/广告腔改写成"老板真的会说出口的大白话"（这是重点，不是照搬原文）
2. 原文里那些空洞的形容词和"AI味"词，按反平庸铁律全部替换成具体细节；原文没细节的地方，把台词改写成引导补细节的句式
3. 每段配上：导演指令级动作、tips数组3项
4. 给每段起一个简短的名称（2-4字），标注时长（5-8秒）和场景建议

${ACTION_SPEC}

${TIPS_SPEC}

严格JSON：{"title":"${v.title}","segments":[{"badge":"名称","script":"台词","action":"导演指令级动作","tips":["钩子类型｜大白话理由","拍摄要点1","语气怎么说"],"dur":"时长","scene":"场景"}]}`;
}

// ---------- 任务3：单段重写 ----------
function promptRewriteSeg(v) {
  const isLong = v.totalSegs >= 7;
  const bmBlock = buildBenchmarkBlock(v.benchmark);
  return `你是操盘过上百个素人老板账号的短视频编导，重新生成口播脚本第${v.idx + 1}段。用户对当前这段不满意——大概率是因为它太平、太像广告、谁都能说。这次必须明显不一样。

${ANTI_GENERIC}

产品：${v.prodName || v.ind}，视频类型：${v.tpl}
${v.p1 ? `个人背景：${v.p1}` : ''}
${v.p3detail ? `产品介绍：${v.p3detail.slice(0, 500)}` : ''}
${v.ms ? `主推规格价格：${v.ms}` : ''}${bmBlock}
当前台词（用户不满意的版本）：${v.curScript}
用户反馈：${v.fb || '太平了，换一个有具体细节、不像广告的角度'}
台词${isLong ? '40字以内' : '25字以内'}。${v.ms ? `价格必须用"${v.ms}"。` : ''}${bmBlock ? '风格贴近对标博主，但内容是用户自己的。' : ''}
新台词必须满足：① 不出现反平庸铁律里的任何空词 ② 换个行业名套不到别人身上 ③ 老板能照着自然念出口不尬。
action 按导演指令级写：${ACTION_SPEC}
tips[0]=编导思路，格式【钩子类型】｜【大白话理由】，理由说人话不用术语，例如「反差钩子｜先说个跟想象相反的，让人愣一下停下来」。
  钩子类型库：${HOOK_LIB}。
tips[1]=拍摄要点1（具体可照做），tips[2]=这句用什么语气说（给生活场景的语气，不写"热情"这种空话）。
严格JSON：{"badge":"${v.badge}","script":"新台词","action":"导演指令级动作","tips":["钩子类型｜大白话理由","拍摄要点1","语气怎么说"],"dur":"${v.dur}","scene":"${v.scene}"}`;
}

// ---------- 任务4：追加段落 ----------
function promptAppendSegs(v) {
  const isLong = v.totalSegs >= 7;
  const bmBlock = buildBenchmarkBlock(v.benchmark);
  return `你是操盘过上百个素人老板账号的短视频编导，在已有脚本基础上追加新段落。新段落的质感必须和已有段落一致，绝不能因为是"补的"就写得敷衍平庸。

${ANTI_GENERIC}

产品：${v.prodName || v.ind}，主推：${v.ms || ''}
${v.p3detail ? `产品介绍：${v.p3detail.slice(0, 500)}` : ''}${bmBlock}
已有${v.totalSegs}段脚本：${v.existing}
追加主题「${v.topic}」的2-3段，插入到第${v.insertPos + 1}段后面，和前后内容自然衔接，不重复。
台词${isLong ? '40字以内' : '25字以内'}。${v.ms ? `价格必须用"${v.ms}"。` : ''}${bmBlock ? '风格保持和前面一致（贴近对标博主）。' : ''}
新段落同样要过反平庸三关：不出现空词、换行业套不上别人、老板能自然念出口。
action 按导演指令级写：${ACTION_SPEC}
tips[0]=编导思路，格式【钩子类型】｜【大白话理由】，理由说人话，例如「场景代入｜用一个能闻到能摸到的具体画面，比说'很好吃'强」。
  钩子类型库：${HOOK_LIB}。和前后段不要重复用同样的钩子类型。
tips[1]=拍摄要点1（具体可照做），tips[2]=这句用什么语气说。
严格JSON：{"segments":[{"badge":"名称","script":"台词","action":"导演指令级动作","tips":["钩子类型｜大白话理由","拍摄要点1","语气怎么说"],"dur":"时长","scene":"场景"}]}`;
}

// ============================================================
//  尖刀任务：本地餐饮/实体店 同城获客专家版
//  ——这是"专家级"，区别于通用版 main_script
// ============================================================
function promptLocalFood(v) {
  const n = v.n;
  const gt = ['让3公里内的人知道这家店、想来', '引导加微信领福利/进群', '直接到店核销(团购/到店礼)'][v.goal] || '让附近的人想来';
  const bmBlock = buildBenchmarkBlock(v.benchmark);
  return `你是一位专做本地实体店"同城获客"的短视频操盘手，操盘过上百家餐饮/美容/到店类门店账号，非常清楚一条视频怎么写才能"让附近的人放下手机、决定到店"。你不是写"好看的内容"，你写的是"能带客流的内容"。

【这一行的底层逻辑——必须全程贯彻】
1. 本地店要的不是泛流量，是"3公里内、能到店的人"。脚本里必须有"地理锚点"，让本地人秒懂"这是我能去的店"（如：城市/商圈/标志性位置/"开车10分钟"这类表达），但不能像报地址一样生硬。
2. 到店决策靠两件事：① 把产品拍到"隔着屏幕都馋/都心动"——用通感和细节，不用形容词堆砌；② 给一个"为什么是现在、为什么是这家"的具体理由（到店福利/限时/限量/老板承诺），不能空喊"快来"。
3. 老板/员工本色出镜，不会演、会尴尬。所有动作指导必须"傻瓜到不需要任何表演"，是具体的物理动作，不是情绪要求。

${ANTI_GENERIC}

门店信息：
- 行业：${v.ind}（本地实体店），视频类型：${v.tpl}
- 所在城市/商圈：${v.city || '（未填，台词中用"我们这条街/附近"等本地化表达，不要编造具体地名）'}
- 这条视频的目标：${gt}
${v.p1 ? `- 老板/门店背景：${v.p1}` : ''}
${v.prodName ? `- 主推产品/招牌：${v.prodName}` : ''}
${v.ms ? `- 价格/套餐：${v.ms}` : ''}
${v.offer ? `- 到店福利/钩子：${v.offer}` : '- （老板未填到店福利，请在结尾段用"老板承诺/限量/报暗号"等轻钩子，不要编造不存在的折扣）'}
${v.p3detail ? `- 产品细节：${v.p3detail}` : ''}
${v.imgCount ? `- 已上传${v.imgCount}张实拍图，台词和拍摄建议要贴合图里的真实样子` : ''}
${bmBlock}

要求：
1. 生成${n}段，遵循本地获客黄金结构：
   ① 本地钩子（3秒内让本地人"咦这说的是我这儿"+想看下去）
   ② 产品诱惑（把招牌拍到流口水，通感+细节，这是到店核心动力）
   ③ 信任/差异（为什么是这家不是隔壁：手艺/食材/老板故事，一句够）
   ④ 到店理由（具体的现在就来的理由，落到"怎么来、来了说什么"）
2. 每段台词口语、像本地人唠嗑，不像广告。每段15-30字，时长5-9秒。
3. ${v.ms ? `价格只能用"${v.ms}"，绝不编造数字` : '不编造价格数字'}
4. ${v.offer ? `到店福利只能用"${v.offer}"，不夸大、不虚构` : '不虚构任何折扣或赠品'}
${bmBlock ? '5. 语言风格贴近对标博主，但门店信息100%用本店自己的' : ''}

【动作指导规则——本地店专用，极重要】
action 必须是"把手机架好就能做到"的物理动作，禁止任何需要表演的描述。
- 错误示例（禁止）：「展现老板的热情」「眼神要有感染力」
- 正确示例（这样写）：「手机架在出餐口，菜一端出来镜头怼近拍3秒蒸汽，你不用说话」「站在店招牌下，手指一下招牌再指自己，说这句」

${TIPS_SPEC}

严格JSON：{"segments":[{"badge":"名称","script":"台词","action":"傻瓜级物理动作（2句内）","tips":["钩子类型｜编导理由","拍摄要点1","拍摄要点2"],"dur":"时长","scene":"在店里哪个位置拍"}]}`;
}

// ============================================================
//  小白模式：给"完全没拍过视频、要自己出镜、会紧张、没人帮忙"
//  的实体店老板。目标不是内容多好，是"这个最笨的人真能拍出来并发出去"
// ============================================================
function promptNoobMode(v) {
  const n = v.n;
  const noFace = !!v.noFace; // 用户勾选"我不想露脸"
  const gt = ['让附近的人知道这家店、想来', '加微信/留线索', '到店消费/核销'][v.goal] || '让附近的人想来';
  const bmBlock = buildBenchmarkBlock(v.benchmark);
  return `你是一位专门带"从没拍过视频、自己开店、要自己上镜、一对镜头就紧张"的实体店老板拍第一条短视频的教练。你心里要始终装着一个画面：一个50岁、不会用剪辑软件、一个人看店、举着手机手会抖的老板娘，她要照着你给的东西，不问任何人，就能拍出来并且敢发出去。你的成功标准不是"内容多专业"，而是"她真的拍完了、发出去了、没有放弃"。

门店信息：
- 行业：${v.ind}，主推：${v.prodName || '（老板未填，台词里说"我们家"不要编造产品名）'}
- 目标：${gt}
${v.p1 ? `- 老板/门店背景：${v.p1}` : ''}
${v.ms ? `- 价格/套餐：${v.ms}` : ''}
${v.offer ? `- 到店福利：${v.offer}` : ''}
${v.p3detail ? `- 细节：${v.p3detail}` : ''}
${v.imgCount ? `- 已上传${v.imgCount}张实拍图，贴合真实样子写` : ''}
${noFace ? '- ⚠️ 老板【明确不想露脸】：整条视频不能要求人脸出镜，只能拍产品、拍手、拍环境、拍制作过程，人声用配音。' : ''}
${bmBlock}

生成${n}段口播脚本，每段台词20字以内、像跟熟客唠嗑、绝不像广告。

${ANTI_GENERIC}

【铁律一：动作指导必须"物理到不用思考"】
action 字段写给一个会手抖、不懂任何术语的人。只能是"把身体/手机/手摆成什么样"的物理指令，每一步都要能直接照做，禁止任何需要理解或表演的词。
- 禁止这样写：「自然展现」「眼神有神」「营造氛围」「调整情绪」
- 必须这样写：「手机横过来，靠在收银台的纸巾盒上，镜头对着你站的地方。你站过去，让镜头能看到你上半身，看着手机最上面的小圆点，开口说这句」
${noFace ? '- 因为不露脸：写清楚"手机架哪、拍桌上哪样东西、你的手从哪个方向进画面"，例如「手机举在锅正上方30厘米，只拍锅，你的手拿勺子从右边进来搅一下」' : ''}

【铁律二：每段必须告诉他"这句话用什么语气说"】
在 tips[2] 里，不要写表演指导，要写"用你生活里哪个场景的语气"。
- 禁止：「语气要有感染力」「充满热情」
- 必须：「这句就用你跟老顾客唠嗑那个语气说，说完停一秒，别赶」「这句像是不好意思地小声说，越随便越好」

【铁律三：整条脚本结尾，必须附一段"预期管理"】
在 JSON 最外层加一个字段 "encourage"，写一句给老板的真心话，降低他发出去后的心理落差。要点：告诉他前面十几二十条没人看是完全正常的、不是他不行、这条的目的是练手不是爆、先发够数比拍好更重要。语气像朋友，不像鸡汤，30-50字。

【铁律四：钩子要"老板能看懂为什么"】
tips[0] 仍按【钩子类型｜编导理由】格式，但"编导理由"要写成"说给老板听的大白话"，让他明白这句为什么这么说，而不是术语。
钩子类型库：${HOOK_LIB}。不同段用不同钩子。
- 示例：「提问钩子｜开头用一句反问，是想让刷到的人愣一下、手指停下来，别划走」

tips[1] = 这一段拍的时候，画面里最重要的是什么（大白话，10-20字）

严格JSON：{"encourage":"给老板的真心话","segments":[{"badge":"名称","script":"台词","action":"物理到不用思考的动作（可以写长，写清楚）","tips":["钩子类型｜大白话理由","画面重点","用什么语气说"],"dur":"时长","scene":"在店里站哪拍"}]}`;
}

// 任务路由表
const TASK_BUILDERS = {
  main_script: promptMainScript,
  split_text: promptSplitText,
  rewrite_seg: promptRewriteSeg,
  append_segs: promptAppendSegs,
  local_food: promptLocalFood,   // ← 本地餐饮尖刀（专家版）
  noob_mode: promptNoobMode,     // ← 小白模式（傻瓜化，含不露脸/语气/预期管理）
};

// ============================================================
//  速率限制
// ============================================================
const rateLimitMap = new Map();
function checkRateLimit(ip) {
  const minute = Math.floor(Date.now() / 60000);
  const key = `${ip}:${minute}`;
  const count = rateLimitMap.get(key) || 0;
  if (count >= CONFIG.RATE_LIMIT_PER_MIN) return false;
  rateLimitMap.set(key, count + 1);
  if (rateLimitMap.size > 500) {
    for (const k of rateLimitMap.keys()) {
      if (parseInt(k.split(':')[1]) < minute) rateLimitMap.delete(k);
    }
  }
  return true;
}

// ============================================================
//  主处理函数
// ============================================================
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: '只支持 POST' });

  try {
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim()
            || req.headers['x-real-ip'] || 'unknown';
    if (!checkRateLimit(ip)) {
      return res.status(429).json({ error: '请求过于频繁，请稍后再试' });
    }

    const { task, vars, images, maxTokens } = req.body || {};

    // 校验 task 类型
    if (!task || !TASK_BUILDERS[task]) {
      return res.status(400).json({ error: '未知的任务类型' });
    }
    if (!vars || typeof vars !== 'object') {
      return res.status(400).json({ error: '缺少参数' });
    }

    const apiKey = process.env.DASHSCOPE_API_KEY;
    if (!apiKey) {
      return res.status(500).json({
        error: 'API key 未配置，请在 Vercel 设置环境变量 DASHSCOPE_API_KEY'
      });
    }

    // 在服务器端拼装真正的提示词（前端永远看不到这一步）
    const hasImages = Array.isArray(images) && images.length > 0;
    if (hasImages) vars.imgCount = Math.min(images.length, 3);
    let prompt;
    try {
      prompt = TASK_BUILDERS[task](vars);
    } catch (e) {
      return res.status(400).json({ error: '参数不完整：' + String(e?.message || e).slice(0, 100) });
    }

    const model = hasImages ? CONFIG.VISION_MODEL : CONFIG.TEXT_MODEL;

    let messages;
    if (hasImages) {
      const content = [];
      images.slice(0, 3).forEach(img => {
        content.push({ type: 'image_url', image_url: { url: img } });
      });
      content.push({ type: 'text', text: prompt });
      messages = [{ role: 'user', content }];
    } else {
      messages = [{ role: 'user', content: prompt }];
    }

    const mt = Math.min(
      parseInt(maxTokens) || CONFIG.MAX_TOKENS_DEFAULT,
      CONFIG.MAX_TOKENS_LIMIT
    );

    const upstream = await fetch(CONFIG.API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model, max_tokens: mt, messages }),
    });

    if (!upstream.ok) {
      const errText = await upstream.text();
      console.error('Upstream error:', upstream.status, errText.slice(0, 300));
      return res.status(502).json({
        error: `AI 服务错误 (${upstream.status})`,
        detail: errText.slice(0, 200)
      });
    }

    const data = await upstream.json();
    const text = data.choices?.[0]?.message?.content || '';

    return res.status(200).json({
      ok: true,
      text,
      model,
      usedVision: hasImages
    });

  } catch (e) {
    console.error('Handler error:', e);
    return res.status(500).json({
      error: '服务器内部错误',
      detail: String(e?.message || e).slice(0, 200)
    });
  }
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '20mb',
    },
  },
};
