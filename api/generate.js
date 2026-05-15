/**
 * Vercel Serverless Function - AI 代理接口（阿里云通义千问版）
 * 路径: /api/generate
 *
 * 环境变量（在 Vercel Dashboard 配置）:
 *   DASHSCOPE_API_KEY - 阿里云百炼 API key（必填）
 *                       从 https://bailian.console.aliyun.com 申请
 *
 * 模型自动选择：
 *   无图片 → qwen-plus（性价比之王，文本场景默认）
 *   有图片 → qwen-vl-max-latest（视觉模型，自动切换）
 */

const CONFIG = {
  // 阿里云百炼兼容 OpenAI 协议的接入点
  API_URL: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',

  // 文本模型（性价比最高）
  TEXT_MODEL: 'qwen-plus',
  // 视觉模型（处理图片）
  VISION_MODEL: 'qwen-vl-max-latest',

  MAX_TOKENS_DEFAULT: 4000,
  MAX_TOKENS_LIMIT: 8000,
  RATE_LIMIT_PER_MIN: 20,
};

// 速率限制（serverless 实例级，冷启动会重置，足够防滥用）
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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: '只支持 POST' });
  }

  try {
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim()
            || req.headers['x-real-ip']
            || 'unknown';
    if (!checkRateLimit(ip)) {
      return res.status(429).json({ error: '请求过于频繁，请稍后再试' });
    }

    const { prompt, images, maxTokens } = req.body || {};
    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'prompt 必填' });
    }

    const apiKey = process.env.DASHSCOPE_API_KEY;
    if (!apiKey) {
      return res.status(500).json({
        error: 'API key 未配置，请在 Vercel 设置环境变量 DASHSCOPE_API_KEY'
      });
    }

    const hasImages = Array.isArray(images) && images.length > 0;
    // 有图片→视觉模型，无图片→文本模型
    const model = hasImages ? CONFIG.VISION_MODEL : CONFIG.TEXT_MODEL;

    // 构造消息
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

    // 调用上游 AI
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

// Vercel 函数配置：放宽 body 限制（图片 base64 较大）
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '20mb',
    },
  },
};
