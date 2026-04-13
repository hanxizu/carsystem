import 'dotenv/config';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';

const app = new Hono();

// 中间件
app.use('*', logger());
app.use('*', cors());

// ========== 基础端点 ==========
app.get('/', (c) => {
  return c.json({
    status: 'ok',
    name: '车险自动报价系统',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

app.get('/health', (c) => {
  const checks = {
    supabase: !!process.env.SUPABASE_URL,
    wework: !!process.env.WEWORK_CORP_ID,
    tencent_ocr: !!process.env.TENCENT_SECRET_ID
  };
  
  const allOk = Object.values(checks).every(v => v === true);
  
  return c.json({
    status: allOk ? 'healthy' : 'degraded',
    checks,
    timestamp: new Date().toISOString()
  }, allOk ? 200 : 503);
});

app.get('/test-db', async (c) => {
  try {
    const { supabase } = await import('./db/supabase.js');
    const { error } = await supabase
      .from('tasks')
      .select('count', { count: 'exact', head: true });
    
    if (error) {
      return c.json({ 
        success: false, 
        error: error.message,
        hint: '请确保表 tasks 已创建'
      }, 500);
    }
    
    return c.json({ 
      success: true, 
      message: '数据库连接正常'
    });
  } catch (error: any) {
    return c.json({ 
      success: false, 
      error: error.message,
      hint: '请检查 SUPABASE_URL 和 SUPABASE_ANON_KEY 配置'
    }, 500);
  }
});

app.post('/api/webhook', async (c) => {
  try {
    const body = await c.req.json();
    console.log('收到回调:', JSON.stringify(body, null, 2));
    return c.json({ success: true, message: 'Webhook received' });
  } catch (error: any) {
    console.error('Webhook error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

app.post('/api/quote-callback', async (c) => {
  try {
    const body = await c.req.json();
    console.log('报价回调:', body);
    return c.json({ success: true });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

app.get('/api/tasks/:taskId', async (c) => {
  try {
    const taskId = c.req.param('taskId');
    const { taskService } = await import('./services/task.js');
    const task = await taskService.getTask(taskId);
    
    if (!task) {
      return c.json({ success: false, error: '任务不存在' }, 404);
    }
    
    const quotes = await taskService.getQuotesByTask(taskId);
    
    return c.json({
      success: true,
      task,
      quotes,
      quoteCount: quotes.length
    });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

app.get('/api/stats', async (c) => {
  try {
    const { supabase } = await import('./db/supabase.js');
    
    const { count: taskCount } = await supabase.from('tasks').select('*', { count: 'exact', head: true });
    const { count: quoteCount } = await supabase.from('quotes').select('*', { count: 'exact', head: true });
    
    return c.json({
      success: true,
      stats: {
        totalTasks: taskCount || 0,
        totalQuotes: quoteCount || 0,
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
      }
    });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

app.post('/api/ext/activate', (c) => {
  return c.json({ 
    success: true, 
    message: 'Extension activated',
    timestamp: new Date().toISOString()
  });
});

app.get('/favicon.ico', (c) => {
  // 设置缓存控制头，减少请求
  c.header('Cache-Control', 'public, max-age=86400');
  // 返回 204 无内容状态码
  return c.body(null, 204);
});

// 404 处理
app.notFound((c) => {
  return c.json({
    error: 'Not Found',
    message: `Endpoint ${c.req.path} not found`
  }, 404);
});

// 错误处理
app.onError((err, c) => {
  console.error('Server error:', err);
  return c.json({
    error: 'Internal Server Error',
    message: err.message
  }, 500);
});

// 直接导出 app（不要使用 serve()）
export default app;