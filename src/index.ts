import 'dotenv/config';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { serve } from '@hono/node-server';

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
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
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

// ========== 企业微信 Webhook（完整业务逻辑）==========
app.post('/api/webhook', async (c) => {
  try {
    const body = await c.req.json();
    console.log('收到企业微信回调:', JSON.stringify(body, null, 2));
    
    // 导入服务
    const { weworkService } = await import('./services/wework.js');
    const { taskService } = await import('./services/task.js');
    const { ocrService } = await import('./services/ocr.js');
    const { routeService } = await import('./services/route.js');
    
    // 会话管理（生产环境应用 Redis 或数据库）
    const sessions = new Map();
    
    // 处理事件消息（关注/取消关注）
    if (body.msgtype === 'event') {
      const userId = body.FromUserName;
      
      if (body.Event === 'subscribe') {
        sessions.set(userId, {
          userId,
          step: 'welcome',
          uploadedFiles: {}
        });
        
        await weworkService.sendMessage(userId, 
          '欢迎使用车险报价系统！\n\n请选择业务类型：\n回复 1 续保/过户车\n回复 2 新车'
        );
        
        return c.json({ success: true });
      }
    }
    
    // 处理文本消息
    if (body.msgtype === 'text') {
      const userId = body.FromUserName;
      const content = body.Text.Content;
      let session = sessions.get(userId);
      
      if (!session) {
        session = { userId, step: 'welcome', uploadedFiles: {} };
        sessions.set(userId, session);
      }
      
      // 欢迎步骤
      if (session.step === 'welcome') {
        if (content === '1') {
          session.businessDirection = 'renewal';
          session.step = 'uploading';
          await weworkService.sendMessage(userId, 
            '请上传以下资料：\n1. 行驶证照片\n2. 车主身份证照片\n3. 车主手机号'
          );
        } else if (content === '2') {
          session.businessDirection = 'new_car';
          session.step = 'uploading';
          await weworkService.sendMessage(userId,
            '请上传以下资料：\n1. 购车发票\n2. 车辆合格证\n3. 车主身份证照片\n4. 车主手机号'
          );
        } else {
          await weworkService.sendMessage(userId, '请回复 1 或 2 选择业务类型');
        }
      }
      
      // 上传步骤（接收手机号）
      else if (session.step === 'uploading' && /^1\d{10}$/.test(content)) {
        session.phone = content;
        session.step = 'selecting_combo';
        await weworkService.sendMessage(userId,
          '请选择险种组合（可多选，用逗号分隔，如 1,3）：\n\n' +
          '1 全险（交强险+车损险+三者险+附加险）\n' +
          '2 交强+三者\n' +
          '3 交强+三者+车损\n' +
          '4 仅交强\n' +
          '5 单三者'
        );
      }
      
      // 选择险种组合
      else if (session.step === 'selecting_combo') {
        const combos = content.split(/[ ,]+/).map((c:any) => `combo_${c}`);
        session.combos = combos;
        
        // 创建任务
        const taskId = await taskService.createTask(session);
        session.taskId = taskId;
        session.step = 'completed';
        
        // 更新客户备注
        if (session.vehicleInfo) {
          await weworkService.updateCustomerRemark(userId, `${session.vehicleInfo.plate}_${session.vehicleInfo.ownerName}`);
        }
        
        // 分发任务到渠道
        const task = await taskService.getTask(taskId);
        if (task) {
          const channels = await routeService.getChannels(task);
          const imageStore = new Map(); // 实际应从 session 获取
          await routeService.distributeTask(task, channels, imageStore);
        }
        
        await weworkService.sendMessage(userId, '✅ 报价请求已分发，请等待各渠道回复...');
      }
      
      else {
        await weworkService.sendMessage(userId, '请按提示上传资料或选择险种组合');
      }
    }
    
    // 处理图片消息
    if (body.msgtype === 'image') {
      const userId = body.FromUserName;
      const mediaId = body.MediaId;
      const session = sessions.get(userId);
      
      if (session && session.step === 'uploading') {
        const { weworkService } = await import('./services/wework.js');
        const { ocrService } = await import('./services/ocr.js');
        
        const imageBuffer = await weworkService.downloadMedia(mediaId);
        
        if (session.businessDirection === 'renewal') {
          if (!session.uploadedFiles.drivingLicense) {
            session.uploadedFiles.drivingLicense = imageBuffer;
            const vehicleInfo = await ocrService.recognizeDrivingLicense(imageBuffer);
            session.vehicleInfo = vehicleInfo;
            await weworkService.sendMessage(userId, 
              `✅ 行驶证识别成功\n车牌：${vehicleInfo.plate}\n车主：${vehicleInfo.ownerName}\n\n请继续上传身份证照片`
            );
          } else if (!session.uploadedFiles.idCard) {
            session.uploadedFiles.idCard = imageBuffer;
            await weworkService.sendMessage(userId, '✅ 身份证已收到，请输入手机号');
          }
        } else if (session.businessDirection === 'new_car') {
          if (!session.uploadedFiles.invoice) {
            session.uploadedFiles.invoice = imageBuffer;
            await weworkService.sendMessage(userId, '✅ 购车发票已收到，请上传车辆合格证');
          } else if (!session.uploadedFiles.certificate) {
            session.uploadedFiles.certificate = imageBuffer;
            await weworkService.sendMessage(userId, '✅ 车辆合格证已收到，请上传身份证照片');
          } else if (!session.uploadedFiles.idCard) {
            session.uploadedFiles.idCard = imageBuffer;
            await weworkService.sendMessage(userId, '✅ 身份证已收到，请输入手机号');
          }
        }
      }
    }
    
    return c.json({ success: true });
  } catch (error: any) {
    console.error('Webhook处理错误:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// ========== 报价回调端点 ==========
app.post('/api/quote-callback', async (c) => {
  try {
    const body = await c.req.json();
    console.log('收到渠道报价回调:', JSON.stringify(body, null, 2));
    
    if (body.msgtype === 'image') {
      const { weworkService } = await import('./services/wework.js');
      const { ocrService } = await import('./services/ocr.js');
      const { taskService } = await import('./services/task.js');
      
      const mediaId = body.MediaId;
      const imageBuffer = await weworkService.downloadMedia(mediaId);
      const quoteData = await ocrService.recognizeQuote(imageBuffer);
      
      if (quoteData.displayId) {
        // 保存报价
        await taskService.saveQuote({
          task_id: quoteData.displayId,
          channel: body.ChatId || body.FromUserName,
          combo: quoteData.combo,
          premium: quoteData.premium,
          third_limit: quoteData.thirdLimit,
          raw_text: quoteData.rawText,
          created_at: new Date().toISOString()
        });
        
        // 获取该任务的所有报价
        const quotes = await taskService.getQuotesByTask(quoteData.displayId);
        
        // 当收集到足够报价时，汇总推送给客户
        if (quotes.length >= 2) {
          const task = await taskService.getTask(quoteData.displayId);
          if (task) {
            const summary = quotes.map(q => 
              `💰 ${q.channel}: ${q.combo} - ${q.premium}元${q.third_limit ? ` (三者${q.third_limit})` : ''}`
            ).join('\n');
            
            await weworkService.sendMessage(task.ownerName, 
              `📊 报价汇总\n\n${summary}\n\n请选择最优惠的方案`
            );
          }
        }
      }
    }
    
    return c.json({ success: true });
  } catch (error: any) {
    console.error('报价回调错误:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// ========== 任务管理端点 ==========
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

// ========== 渠道管理端点 ==========
app.get('/api/channels', async (c) => {
  try {
    const { supabase } = await import('./db/supabase.js');
    const { data, error } = await supabase.from('channels').select('*');
    
    if (error) throw error;
    return c.json({ success: true, channels: data });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

app.post('/api/channels', async (c) => {
  try {
    const { supabase } = await import('./db/supabase.js');
    const body = await c.req.json();
    
    const { data, error } = await supabase.from('channels').insert(body).select();
    
    if (error) throw error;
    return c.json({ success: true, channel: data[0] });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// ========== 辅助端点 ==========
app.post('/api/ext/activate', (c) => {
  return c.json({ 
    success: true, 
    message: 'Extension activated',
    timestamp: new Date().toISOString()
  });
});

//app.get('/favicon.ico', (c) => c.text('', 204));

// 获取系统统计信息
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

// 404 处理
app.notFound((c) => {
  return c.json({
    error: 'Not Found',
    message: `Endpoint ${c.req.path} not found`,
    availableEndpoints: [
      'GET /',
      'GET /health',
      'GET /test-db',
      'POST /api/webhook',
      'POST /api/quote-callback',
      'GET /api/tasks/:taskId',
      'GET /api/channels',
      'POST /api/channels',
      'GET /api/stats'
    ]
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

// ========== 服务器启动 ==========
const port = parseInt(process.env.PORT || '3000');

if (process.env.NODE_ENV !== 'production') {
  serve({
    fetch: app.fetch,
    port
  }, (info) => {
    console.log(`\n🚀 车险系统已启动`);
    console.log(`📍 本地地址: http://localhost:${info.port}`);
    console.log(`📊 健康检查: http://localhost:${info.port}/health`);
    console.log(`🗄️  数据库测试: http://localhost:${info.port}/test-db`);
    console.log(`🔗 Webhook: http://localhost:${info.port}/api/webhook`);
    console.log(`📈 统计信息: http://localhost:${info.port}/api/stats`);
    console.log(`\n📋 可用端点:`);
    console.log(`   GET  /api/channels - 获取渠道列表`);
    console.log(`   POST /api/channels - 添加渠道`);
    console.log(`   GET  /api/tasks/:taskId - 查询任务详情`);
    console.log(`\n✨ 系统就绪，等待请求...\n`);
  });
}

export default app;