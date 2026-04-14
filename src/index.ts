// src/index.ts
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { handle } from 'hono/vercel'; 
import { decrypt } from '@wecom/crypto';
import * as crypto from 'crypto';
import { supabase } from './db/supabase.js';
import { config } from './config/configindex.js';  // 修正导入路径

// 注意：Vercel 环境变量通过 process.env 自动注入，不需要 dotenv
// 但保留 config 模块用于类型定义

const app = new Hono();

// 中间件
app.use('*', logger());
app.use('*', cors());

// Session 和图片存储（生产环境建议使用 Redis 或 Vercel KV）
const sessions = new Map<string, any>();
const imageStore = new Map<string, Buffer>();

// ========== 企业微信加解密工具函数 ==========
function verifySignature(
  token: string, 
  timestamp: string, 
  nonce: string, 
  encryptMsg: string, 
  signature: string
): boolean {
  const sortList = [token, timestamp, nonce, encryptMsg].sort();
  const sha1 = crypto.createHash('sha1');
  sha1.update(sortList.join(''));
  const calculatedSignature = sha1.digest('hex');
  return calculatedSignature === signature;
}

function decryptMessage(
  encodingAESKey: string, 
  encryptMsg: string, 
  corpId: string
): { message: string; id: string } {
  const result = decrypt(encodingAESKey, encryptMsg);
  if (result.id !== corpId) {
    throw new Error(`CorpId不匹配: 期望${corpId}, 收到${result.id}`);
  }
  return result;
}

// ========== 基础端点 ==========
app.get('/', (c) => {
  return c.json({
    status: 'ok',
    name: '车险自动报价系统',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV || 'development'
  });
});

app.get('/health', (c) => {
  const checks = {
    supabase: !!process.env.SUPABASE_URL && !!process.env.SUPABASE_ANON_KEY,
    wework: !!process.env.WEWORK_CORP_ID && !!process.env.WEWORK_CORP_SECRET,
    wework_crypto: !!process.env.WEWORK_TOKEN && !!process.env.WEWORK_ENCODING_AES_KEY,
    tencent_ocr: !!process.env.TENCENT_SECRET_ID && !!process.env.TENCENT_SECRET_KEY
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

// ========== 企业微信 Webhook ==========
app.get('/api/webhook', async (c) => {
  try {
    const msg_signature = c.req.query('msg_signature');
    const timestamp = c.req.query('timestamp');
    const nonce = c.req.query('nonce');
    const echostr = c.req.query('echostr');
    
    const token = process.env.WEWORK_TOKEN;
    const encodingAESKey = process.env.WEWORK_ENCODING_AES_KEY;
    const corpId = process.env.WEWORK_CORP_ID;
    
    if (!token || !encodingAESKey || !corpId) {
      console.error('企业微信配置不完整');
      return c.text('配置错误', 500);
    }
    
    if (!msg_signature || !timestamp || !nonce || !echostr) {
      console.error('缺少签名验证参数');
      return c.text('缺少参数', 400);
    }
    
    const isValid = verifySignature(token, timestamp, nonce, echostr, msg_signature);
    if (!isValid) {
      console.error('URL验证签名失败');
      return c.text('签名验证失败', 403);
    }
    
    const result = decrypt(encodingAESKey, echostr);
    
    if (result.id !== corpId) {
      console.error(`CorpId不匹配: 期望${corpId}, 收到${result.id}`);
      return c.text('CorpId不匹配', 403);
    }
    
    console.log('✅ URL验证成功');
    return c.text(result.message);
    
  } catch (error: any) {
    console.error('URL验证失败:', error.message);
    return c.text('验证失败', 500);
  }
});

app.post('/api/webhook', async (c) => {
  try {
    const msg_signature = c.req.query('msg_signature');
    const timestamp = c.req.query('timestamp');
    const nonce = c.req.query('nonce');
    
    const bodyText = await c.req.text();
    console.log('收到消息原始内容:', bodyText.substring(0, 200));
    
    const token = process.env.WEWORK_TOKEN;
    const encodingAESKey = process.env.WEWORK_ENCODING_AES_KEY;
    const corpId = process.env.WEWORK_CORP_ID;
    
    if (!token || !encodingAESKey || !corpId) {
      console.error('企业微信配置不完整');
      return c.text('success');
    }
    
    if (!msg_signature || !timestamp || !nonce) {
      console.error('POST请求缺少签名验证参数');
      return c.text('success');
    }
    
    let encryptMsg = '';
    const encryptMatch = bodyText.match(/<Encrypt><!\[CDATA\[(.*?)\]\]><\/Encrypt>/);
    if (encryptMatch) {
      encryptMsg = encryptMatch[1];
    } else {
      console.error('无法从请求体中解析出加密消息');
      return c.text('success');
    }
    
    const isValid = verifySignature(token, timestamp, nonce, encryptMsg, msg_signature);
    if (!isValid) {
      console.error('消息签名验证失败');
      return c.text('success');
    }
    
    let decryptedMsg: string;
    try {
      const result = decryptMessage(encodingAESKey, encryptMsg, corpId);
      decryptedMsg = result.message;
      console.log('✅ 解密后的消息:', decryptedMsg);
    } catch (decryptError: any) {
      console.error('消息解密失败:', decryptError.message);
      return c.text('success');
    }
    
    // Vercel 环境中使用 waitUntil 进行异步处理
    c.executionCtx.waitUntil(
      handleWeWorkMessage(decryptedMsg).catch(err => {
        console.error('异步处理消息失败:', err);
      })
    );
    
    return c.text('success');
    
  } catch (error: any) {
    console.error('消息处理错误:', error);
    return c.text('success');
  }
});

async function handleWeWorkMessage(xmlContent: string) {
  try {
    const msgTypeMatch = xmlContent.match(/<MsgType><!\[CDATA\[(.*?)\]\]><\/MsgType>/);
    const msgType = msgTypeMatch ? msgTypeMatch[1] : '';
    
    const fromUserMatch = xmlContent.match(/<FromUserName><!\[CDATA\[(.*?)\]\]><\/FromUserName>/);
    const userId = fromUserMatch ? fromUserMatch[1] : '';
    
    if (!userId) return;
    
    if (msgType === 'event') {
      const eventMatch = xmlContent.match(/<Event><!\[CDATA\[(.*?)\]\]><\/Event>/);
      const event = eventMatch ? eventMatch[1] : '';
      
      if (event === 'subscribe') {
        await handleSubscribeEvent(userId);
      }
    }
    
    if (msgType === 'text') {
      const contentMatch = xmlContent.match(/<Content><!\[CDATA\[(.*?)\]\]><\/Content>/);
      const content = contentMatch ? contentMatch[1] : '';
      
      if (content) {
        await handleTextMessage(userId, content);
      }
    }
    
    if (msgType === 'image') {
      const mediaIdMatch = xmlContent.match(/<MediaId><!\[CDATA\[(.*?)\]\]><\/MediaId>/);
      const mediaId = mediaIdMatch ? mediaIdMatch[1] : '';
      
      if (mediaId) {
        await handleImageMessage(userId, mediaId);
      }
    }
    
  } catch (error) {
    console.error('处理消息失败:', error);
  }
}

async function handleSubscribeEvent(userId: string) {
  console.log(`用户 ${userId} 关注了应用`);
  
  sessions.set(userId, {
    userId,
    step: 'welcome',
    uploadedFiles: {}
  });
  
  const { weworkService } = await import('./services/wework.js');
  await weworkService.sendMessage(
    userId,
    '欢迎使用车险报价系统！\n请选择业务类型：\n回复 1 续保/过户车\n回复 2 新车'
  );
}

async function handleTextMessage(userId: string, content: string) {
  console.log(`用户 ${userId} 发送文本: ${content}`);
  
  const session = sessions.get(userId);
  if (!session) {
    sessions.set(userId, {
      userId,
      step: 'welcome',
      uploadedFiles: {}
    });
    
    const { weworkService } = await import('./services/wework.js');
    await weworkService.sendMessage(
      userId,
      '欢迎使用车险报价系统！\n请选择业务类型：\n回复 1 续保/过户车\n回复 2 新车'
    );
    return;
  }
  
  const { weworkService, taskService } = await import('./services/servicesindex.js');
  
  switch (session.step) {
    case 'welcome':
      if (content === '1') {
        session.businessDirection = 'renewal';
        session.step = 'uploading';
        await weworkService.sendMessage(
          userId,
          '请上传以下资料：\n1. 行驶证照片\n2. 车主身份证照片\n3. 车主手机号'
        );
      } else if (content === '2') {
        session.businessDirection = 'new_car';
        session.step = 'uploading';
        await weworkService.sendMessage(
          userId,
          '请上传以下资料：\n1. 购车发票\n2. 车辆合格证\n3. 车主身份证照片\n4. 车主手机号'
        );
      } else {
        await weworkService.sendMessage(
          userId,
          '请选择有效的业务类型：\n回复 1 续保/过户车\n回复 2 新车'
        );
      }
      break;
      
    case 'uploading':
      if (/^1\d{10}$/.test(content)) {
        session.phone = content;
        session.step = 'selecting_combo';
        await weworkService.sendMessage(
          userId,
          '请选择险种组合（可多选，用逗号分隔，如 1,3）：\n' +
          '1 全险\n2 交强+三者\n3 交强+三者+车损\n4 仅交强\n5 单三者'
        );
      } else {
        await weworkService.sendMessage(
          userId,
          '请输入有效的手机号码（11位数字）'
        );
      }
      break;
      
    case 'selecting_combo':
      const combos = content.split(/[ ,]+/).map(c => `combo_${c}`);
      session.combos = combos;
      
      const taskId = await taskService.createTask(session);
      session.taskId = taskId;
      session.step = 'completed';
      
      await weworkService.sendMessage(
        userId,
        `任务已创建！\n任务ID: ${taskId}\n请等待报价结果...`
      );
      break;
  }
  
  sessions.set(userId, session);
}

async function handleImageMessage(userId: string, mediaId: string) {
  console.log(`用户 ${userId} 发送图片: ${mediaId}`);
  
  const session = sessions.get(userId);
  if (!session || session.step !== 'uploading') {
    const { weworkService } = await import('./services/wework.js');
    await weworkService.sendMessage(
      userId,
      '请先选择业务类型'
    );
    return;
  }
  
  const { weworkService, ocrService } = await import('./services/servicesindex.js');
  
  try {
    const imageBuffer = await weworkService.downloadMedia(mediaId);
    const imageKey = `${userId}_${Date.now()}`;
    imageStore.set(imageKey, imageBuffer);
    
    if (session.businessDirection === 'renewal') {
      if (!session.uploadedFiles.drivingLicense) {
        session.uploadedFiles.drivingLicense = imageBuffer;
        
        const vehicleInfo = await ocrService.recognizeDrivingLicense(imageBuffer);
        session.vehicleInfo = vehicleInfo;
        
        await weworkService.sendMessage(
          userId,
          `行驶证识别成功！\n车牌号：${vehicleInfo.plate}\n车主：${vehicleInfo.ownerName}\n请继续上传身份证照片`
        );
      } else if (!session.uploadedFiles.idCard) {
        session.uploadedFiles.idCard = imageBuffer;
        await weworkService.sendMessage(
          userId,
          '身份证已收到，请输入手机号'
        );
      }
    } else if (session.businessDirection === 'new_car') {
      if (!session.uploadedFiles.invoice) {
        session.uploadedFiles.invoice = imageBuffer;
        await weworkService.sendMessage(userId, '发票已收到，请上传车辆合格证');
      } else if (!session.uploadedFiles.certificate) {
        session.uploadedFiles.certificate = imageBuffer;
        await weworkService.sendMessage(userId, '合格证已收到，请上传车主身份证');
      } else if (!session.uploadedFiles.idCard) {
        session.uploadedFiles.idCard = imageBuffer;
        await weworkService.sendMessage(userId, '身份证已收到，请输入手机号');
      }
    }
    
    sessions.set(userId, session);
    
  } catch (error: any) {
    console.error('处理图片失败:', error);
    const { weworkService } = await import('./services/wework.js');
    await weworkService.sendMessage(
      userId,
      '图片处理失败，请重试'
    );
  }
}

app.post('/api/quote-callback', async (c) => {
  try {
    const body = await c.req.json();
    console.log('报价回调:', body);
    
    const { taskService, weworkService } = await import('./services/servicesindex.js');
    
    if (body.taskId && body.quote) {
      await taskService.saveQuote(body);
      
      const quotes = await taskService.getQuotesByTask(body.taskId);
      if (quotes.length >= 3) {
        const task = await taskService.getTask(body.taskId);
        if (task) {
          const summary = quotes
            .map((q: any) => `${q.channel}: ${q.combo} - ${q.premium}元`)
            .join('\n');
          
          await weworkService.sendMessage(
            task.ownerName,
            `报价汇总：\n${summary}`
          );
        }
      }
    }
    
    return c.json({ success: true });
  } catch (error: any) {
    console.error('报价回调处理失败:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

app.get('/api/tasks/:taskId', async (c) => {
  try {
    const taskId = c.req.param('taskId');
    const { taskService } = await import('./services/servicesindex.js');
    
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
    const { count: taskCount } = await supabase
      .from('tasks')
      .select('*', { count: 'exact', head: true });
    
    const { count: quoteCount } = await supabase
      .from('quotes')
      .select('*', { count: 'exact', head: true });
    
    return c.json({
      success: true,
      stats: {
        totalTasks: taskCount || 0,
        totalQuotes: quoteCount || 0,
        activeSessions: sessions.size,
        cachedImages: imageStore.size,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

app.notFound((c) => {
  return c.json({
    error: 'Not Found',
    message: `Endpoint ${c.req.path} not found`
  }, 404);
});

app.onError((err, c) => {
  console.error('Server error:', err);
  return c.json({
    error: 'Internal Server Error',
    message: err.message
  }, 500);
});

// ========== Vercel 导出 ==========
// 使用 @hono/vercel 的 handle 函数导出
export default handle(app);

// 同时导出 fetch 以支持更多场景
export const fetch = app.fetch;