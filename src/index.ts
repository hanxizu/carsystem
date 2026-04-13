import 'dotenv/config';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import * as crypto from 'crypto';

const app = new Hono();

// 中间件
app.use('*', logger());
app.use('*', cors());

// ========== 企业微信加解密工具函数 ==========

/**
 * 解密企业微信消息
 */
function decryptMsg(encryptMsg: string, encodingAESKey: string, corpId: string): string {
  // 解码 AESKey
  const AESKey = Buffer.from(encodingAESKey + '=', 'base64');
  const iv = AESKey.subarray(0, 16);
  
  // 解密
  const decipher = crypto.createDecipheriv('aes-256-cbc', AESKey, iv);
  decipher.setAutoPadding(false);
  
  let decrypted = Buffer.concat([decipher.update(Buffer.from(encryptMsg, 'base64')), decipher.final()]);
  
  // 去除补位
  const pad = decrypted[decrypted.length - 1];
  decrypted = decrypted.subarray(0, decrypted.length - pad);
  
  // 解析内容：16字节随机数 + 4字节消息长度 + 消息内容 + CorpId
  const msgLen = decrypted.readUInt32BE(16);
  const msg = decrypted.subarray(20, 20 + msgLen).toString();
  const receivedCorpId = decrypted.subarray(20 + msgLen).toString();
  
  if (receivedCorpId !== corpId) {
    throw new Error('CorpId 不匹配');
  }
  
  return msg;
}

/**
 * 验证企业微信签名
 */
function verifySignature(token: string, timestamp: string, nonce: string, encryptMsg: string, signature: string): boolean {
  const sortList = [token, timestamp, nonce, encryptMsg].sort();
  const sha1 = crypto.createHash('sha1');
  sha1.update(sortList.join(''));
  const calculatedSignature = sha1.digest('hex');
  console.log('签名对比:', { expected: signature, calculated: calculatedSignature });
  return calculatedSignature === signature;
}

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
    wework_token: !!process.env.WEWORK_TOKEN,
    wework_aes_key: !!process.env.WEWORK_ENCODING_AES_KEY,
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

// ========== 企业微信 Webhook（支持验证和消息接收）==========

/**
 * GET 请求：企业微信 URL 验证
 * 企业微信在配置回调地址时会发送 GET 请求验证
 */
app.get('/api/webhook', async (c) => {
  try {
    // 获取验证参数
    const msg_signature = c.req.query('msg_signature');
    const timestamp = c.req.query('timestamp');
    const nonce = c.req.query('nonce');
    const echostr = c.req.query('echostr');
    
    console.log('收到验证请求:', { 
      msg_signature, 
      timestamp, 
      nonce, 
      echostr: echostr?.substring(0, 30) + '...' 
    });
    
    // 获取配置
    const token = process.env.WEWORK_TOKEN;
    const encodingAESKey = process.env.WEWORK_ENCODING_AES_KEY;
    const corpId = process.env.WEWORK_CORP_ID;
    
    // ========== 调试模式：跳过验证 ==========
    // 在本地测试或环境变量未配置时，直接返回 echostr
    const isDebugMode = process.env.DEBUG_MODE === 'true' || 
                        !token || !encodingAESKey || !corpId ||
                        process.env.NODE_ENV === 'development';
    
    if (isDebugMode) {
      console.log('⚠️ 调试模式：跳过签名验证，直接返回 echostr');
      // 直接返回 echostr（不做验证）
      if (echostr) {
        return c.text(echostr);
      } else {
        return c.text('success');
      }
    }
    
    // ========== 正式验证逻辑 ==========
    console.log('正式验证模式，开始签名验证...');
    
    // 检查配置
    if (!token || !encodingAESKey || !corpId) {
      console.error('缺少必要配置: WEWORK_TOKEN, WEWORK_ENCODING_AES_KEY, WEWORK_CORP_ID');
      return c.text('配置错误', 500);
    }
    
    // 验证签名
    if (!verifySignature(token, timestamp!, nonce!, echostr!, msg_signature!)) {
      console.error('签名验证失败');
      return c.text('签名验证失败', 403);
    }
    
    // 解密 echostr
    const decryptedEchostr = decryptMsg(echostr!, encodingAESKey, corpId);
    console.log('验证成功，返回:', decryptedEchostr);
    
    // 关键：必须返回纯文本，不能带引号、换行等
    return c.text(decryptedEchostr);
    
  } catch (error: any) {
    console.error('验证处理错误:', error);
    return c.text('验证失败: ' + error.message, 500);
  }
});

/**
 * POST 请求：接收企业微信推送的消息
 */
app.post('/api/webhook', async (c) => {
  try {
    // 获取请求参数
    const msg_signature = c.req.query('msg_signature');
    const timestamp = c.req.query('timestamp');
    const nonce = c.req.query('nonce');
    
    // 获取请求体（XML 格式）
    const bodyText = await c.req.text();
    console.log('收到消息原始内容:', bodyText.substring(0, 200));
    
    // 简单解析 XML 获取 Encrypt 节点
    const encryptMatch = bodyText.match(/<Encrypt><!\[CDATA\[(.*?)\]\]><\/Encrypt>/);
    if (!encryptMatch) {
      console.log('消息不是加密格式，可能是明文消息');
      // 尝试解析明文消息
      const contentMatch = bodyText.match(/<Content><!\[CDATA\[(.*?)\]\]><\/Content>/);
      const fromUserMatch = bodyText.match(/<FromUserName><!\[CDATA\[(.*?)\]\]><\/FromUserName>/);
      
      if (contentMatch && fromUserMatch) {
        const userId = fromUserMatch[1];
        const content = contentMatch[1];
        console.log(`用户 ${userId} 发送明文消息: ${content}`);
        
        // 异步处理业务逻辑
        setTimeout(async () => {
          try {
            const { weworkService } = await import('./services/wework.js');
            await weworkService.sendMessage(userId, `收到消息: ${content}`);
          } catch (err) {
            console.error('处理消息失败:', err);
          }
        }, 0);
      }
      return c.text('success');
    }
    
    const encryptMsg = encryptMatch[1];
    
    // 获取配置
    const token = process.env.WEWORK_TOKEN;
    const encodingAESKey = process.env.WEWORK_ENCODING_AES_KEY;
    const corpId = process.env.WEWORK_CORP_ID;
    
    // 调试模式或配置缺失时，跳过验证
    const isDebugMode = process.env.DEBUG_MODE === 'true' || 
                        !token || !encodingAESKey || !corpId;
    
    if (isDebugMode) {
      console.log('⚠️ 调试模式：跳过消息验证');
      return c.text('success');
    }
    
    // 验证签名
    if (!verifySignature(token, timestamp!, nonce!, encryptMsg, msg_signature!)) {
      console.error('消息签名验证失败');
      return c.text('success');
    }
    
    // 解密消息
    const decryptedMsg = decryptMsg(encryptMsg, encodingAESKey, corpId);
    console.log('解密后的消息:', decryptedMsg);
    
    // 解析 XML 获取消息内容
    const contentMatch = decryptedMsg.match(/<Content><!\[CDATA\[(.*?)\]\]><\/Content>/);
    const fromUserMatch = decryptedMsg.match(/<FromUserName><!\[CDATA\[(.*?)\]\]><\/FromUserName>/);
    
    if (contentMatch && fromUserMatch) {
      const userId = fromUserMatch[1];
      const content = contentMatch[1];
      console.log(`用户 ${userId} 发送: ${content}`);
      
      // 异步处理业务逻辑（避免超时）
      setTimeout(async () => {
        try {
          const { weworkService } = await import('./services/wework.js');
          await weworkService.sendMessage(userId, `收到消息: ${content}`);
        } catch (err) {
          console.error('处理消息失败:', err);
        }
      }, 0);
    }
    
    // 必须返回 "success" 字符串
    return c.text('success');
    
  } catch (error: any) {
    console.error('消息处理错误:', error);
    // 返回 success 避免企业微信重复推送
    return c.text('success');
  }
});

// ========== 其他业务端点 ==========

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
  c.header('Cache-Control', 'public, max-age=86400');
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

export default app;