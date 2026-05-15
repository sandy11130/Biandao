/**
 * Vercel Serverless Function - 健康检查
 * 路径: /api/health
 *
 * 前端用这个接口检测后端是否支持视觉模型
 */

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.status(200).json({
    ok: true,
    vision: !!process.env.QWEN_API_KEY,
    time: new Date().toISOString(),
  });
}
