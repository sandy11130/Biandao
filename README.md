# 小意思AI · 编导智能体

短视频脚本 AI 编导工具，支持对标博主风格学习。

## 项目结构

```
biandao-agent/
├── api/
│   ├── generate.js          # AI 代理接口（隐藏 API key）
│   └── health.js            # 健康检查
├── public/
│   └── index.html           # 前端单文件应用
├── vercel.json              # Vercel 配置
├── .gitignore
└── README.md
```

## 部署到 Vercel（推荐）

### 第一次部署

1. 把这个目录推到 GitHub
   ```bash
   git init
   git add .
   git commit -m "init"
   git remote add origin https://github.com/你的用户名/biandao-agent.git
   git push -u origin main
   ```

2. 登录 [vercel.com](https://vercel.com) → **Add New** → **Project**

3. 选择刚才推送的 GitHub 仓库 → **Import**

4. 在 Vercel 项目页面 → **Settings** → **Environment Variables**，添加：

   | Name | Value | 环境 |
   |---|---|---|
   | `DEEPSEEK_API_KEY` | `sk-你的deepseek key` | Production, Preview, Development |
   | `QWEN_API_KEY` | `sk-你的通义千问 key`（可选）| Production, Preview, Development |

5. 回到 **Deployments** → **Redeploy**（让环境变量生效）

6. 部署完成，访问 `https://你的项目.vercel.app` 即可使用

### 后续更新

只要往 GitHub 推代码，Vercel 自动重新部署：

```bash
git add .
git commit -m "update"
git push
```

## 本地开发

```bash
npm install -g vercel
cd biandao-agent
vercel dev  # 启动本地开发服务器，会自动加载 .env.local 里的环境变量
```

本地用 `.env.local`（不要提交到 git）：
```
DEEPSEEK_API_KEY=sk-xxx
QWEN_API_KEY=sk-xxx
```

## 验证部署是否成功

部署后访问 `https://你的项目.vercel.app/api/health`，应该返回：

```json
{
  "ok": true,
  "vision": false,
  "time": "2026-05-15T..."
}
```

- `vision: true` 说明配置了通义千问 key，图片识别可用
- `vision: false` 说明没配 `QWEN_API_KEY`，图片功能仍然可以用但 AI 看不到图片

## 安全说明

- ✅ API key 只在 Vercel 环境变量里，前端永远拿不到
- ✅ 前端通过 `/api/generate` 同域调用，无 CORS 问题
- ✅ 后端做了速率限制：单 IP 每分钟最多 20 次请求
- ✅ Vercel 自动 HTTPS

## 自定义域名

在 Vercel 项目 → **Settings** → **Domains** 绑定你自己的域名即可。
