/**
 * Vercel Serverless Function — AI 聊天代理
 *
 * 作用：前端请求 /api/chat，本函数在服务器端用环境变量里的 API Key
 *       转发给 Kimi（Moonshot），再把流式响应透传回前端。
 *       这样 API Key 永远不会暴露在浏览器里。
 *
 * 环境变量（在 Vercel 后台设置）：
 *   KIMI_API_KEY   — 你的 Moonshot API Key（sk-xxx）
 *   KIMI_MODEL     — 模型名称，默认 kimi-k2.6
 *   KIMI_BASE_URL  — API 地址，默认 https://api.moonshot.cn/v1/chat/completions
 */

// ===== 简易限流：每个 IP 每分钟最多 20 次请求 =====
const rateMap = new Map(); // ip -> { count, resetTime }
const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60 * 1000;

function checkRateLimit(ip) {
  const now = Date.now();
  let entry = rateMap.get(ip);
  if (!entry || now > entry.resetTime) {
    entry = { count: 0, resetTime: now + RATE_WINDOW_MS };
    rateMap.set(ip, entry);
  }
  entry.count++;
  rateMap.set(ip, entry);

  // 清理过期条目，防止内存泄漏
  if (rateMap.size > 5000) {
    for (const [key, val] of rateMap) {
      if (now > val.resetTime) rateMap.delete(key);
    }
  }

  return entry.count <= RATE_LIMIT;
}

export default async function handler(req, res) {
  // 仅允许 POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: '仅支持 POST 请求' });
  }

  // CORS（如果前端和 API 同域可以不需要，但加上更安全）
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 检查 API Key 是否已配置
  const apiKey = process.env.KIMI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: '服务器未配置 KIMI_API_KEY 环境变量，请在 Vercel 后台设置。',
    });
  }

  // 限流检查
  const clientIp =
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.socket?.remoteAddress ||
    'unknown';

  if (!checkRateLimit(clientIp)) {
    return res.status(429).json({
      error: '请求太频繁，请稍后再试（每分钟最多 20 次）。',
    });
  }

  // 读取前端发来的消息
  const { messages } = req.body || {};
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: '缺少 messages 参数' });
  }

  // 限制消息条数，防止超长上下文滥用
  const trimmedMessages = messages.slice(-30);

  const model = process.env.KIMI_MODEL || 'kimi-k2.6';
  const baseUrl =
    process.env.KIMI_BASE_URL ||
    'https://api.moonshot.cn/v1/chat/completions';

  try {
    const response = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: trimmedMessages,
        stream: true,
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      return res.status(response.status).json({
        error: `Kimi API 返回错误 (${response.status}): ${errText.slice(0, 300)}`,
      });
    }

    // 流式透传：把 Kimi 的 SSE 响应直接透传给前端
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        res.write(chunk);
      }
    } catch (streamErr) {
      // 客户端断开等情况，静默处理
    }

    res.end();
  } catch (err) {
    return res
      .status(500)
      .json({ error: `服务器请求失败: ${err.message}` });
  }
}
