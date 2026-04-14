import { Hono } from 'hono';

const app = new Hono();

// ========== 最简单的企业微信回调验证 ==========
// 企业微信 GET 验证请求
app.get('/api/webhook', (c) => {
  const echostr = c.req.query('echostr');
  console.log('收到验证请求, echostr:', echostr);
  
  // 直接返回 echostr，不做任何验证
  if (echostr) {
    return c.text(echostr);
  }
  return c.text('success');
});

// 企业微信 POST 消息接收
app.post('/api/webhook', async (c) => {
  const body = await c.req.text();  // 修正：使用 c.req.text()
  console.log('收到消息:', body);
  // 必须返回 'success' 字符串
  return c.text('success');  // 这里需要传入参数
});

// ========== 健康检查 ==========
app.get('/health', (c) => {
  return c.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    env: {
      hasToken: !!process.env.WEWORK_TOKEN,
      hasAesKey: !!process.env.WEWORK_ENCODING_AES_KEY,
      hasCorpId: !!process.env.WEWORK_CORP_ID
    }
  });
});

app.get('/', (c) => {
  return c.json({ status: 'ok', message: 'Server is running' });
});

export default app;