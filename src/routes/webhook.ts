import { Hono } from 'hono';
import { weworkService } from '../services/wework';
import { ocrService } from '../services/ocr';
import { taskService } from '../services/task';
import { routeService } from '../services/route';
import { SessionData } from '../types';
import { generateTaskId } from '../utils/helpers';

const sessions = new Map<string, SessionData>();
const imageStore = new Map<string, Buffer>();

const app = new Hono();

app.post('/webhook', async (c) => {
  const body = await c.req.json();
  
  if (body.msgtype === 'event' && body.Event === 'subscribe') {
    const userId = body.FromUserName;
    sessions.set(userId, {
      userId,
      step: 'welcome',
      uploadedFiles: {}
    });
    
    await weworkService.sendMessage(userId, 
      '欢迎使用车险报价系统！\n请选择业务类型：\n回复 1 续保/过户车\n回复 2 新车'
    );
  }
  
  if (body.msgtype === 'text') {
    const userId = body.FromUserName;
    const content = body.Text.Content;
    const session = sessions.get(userId);
    
    if (!session) return c.json({ success: true });
    
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
      }
    }
    
    else if (session.step === 'uploading') {
      if (/^1\d{10}$/.test(content)) {
        session.phone = content;
        session.step = 'selecting_combo';
        await weworkService.sendMessage(userId,
          '请选择险种组合（可多选，用逗号分隔，如 1,3）：\n' +
          '1 全险\n2 交强+三者\n3 交强+三者+车损\n4 仅交强\n5 单三者'
        );
      }
    }
    
    else if (session.step === 'selecting_combo') {
      const combos = content.split(/[ ,]+/).map((c:any) => `combo_${c}`);
      session.combos = combos;
      
      const taskId = await taskService.createTask(session);
      session.taskId = taskId;
      session.step = 'completed';
      
      await weworkService.updateCustomerRemark(userId, `${session.vehicleInfo!.plate}_${session.vehicleInfo!.ownerName}`);
      
      const task = await taskService.getTask(taskId);
      const channels = await routeService.getChannels(task!);
      await routeService.distributeTask(task!, channels, imageStore);
      
      await weworkService.sendMessage(userId, '报价已分发，请等待渠道回复...');
    }
  }
  
  if (body.msgtype === 'image') {
    const userId = body.FromUserName;
    const mediaId = body.MediaId;
    const session = sessions.get(userId);
    
    if (session && session.step === 'uploading') {
      const imageBuffer = await weworkService.downloadMedia(mediaId);
      const imageKey = `${userId}_${Date.now()}`;
      imageStore.set(imageKey, imageBuffer);
      
      if (session.businessDirection === 'renewal') {
        if (!session.uploadedFiles.drivingLicense) {
          session.uploadedFiles.drivingLicense = imageBuffer;
          const vehicleInfo = await ocrService.recognizeDrivingLicense(imageBuffer);
          session.vehicleInfo = vehicleInfo;
          await weworkService.sendMessage(userId, '行驶证识别成功，请继续上传身份证照片');
        } else if (!session.uploadedFiles.idCard) {
          session.uploadedFiles.idCard = imageBuffer;
          await weworkService.sendMessage(userId, '身份证已收到，请输入手机号');
        }
      }
    }
  }
  
  return c.json({ success: true });
});

app.post('/quote-callback', async (c) => {
  const body = await c.req.json();
  
  if (body.msgtype === 'image') {
    const mediaId = body.MediaId;
    const imageBuffer = await weworkService.downloadMedia(mediaId);
    
    const quoteData = await ocrService.recognizeQuote(imageBuffer);
    
    if (quoteData.displayId) {
      await taskService.saveQuote({
        task_id: quoteData.displayId,
        channel: body.ChatId,
        combo: quoteData.combo,
        premium: quoteData.premium,
        third_limit: quoteData.thirdLimit,
        raw_text: quoteData.rawText,
        created_at: new Date().toISOString()
      });
      
      const quotes = await taskService.getQuotesByTask(quoteData.displayId);
      
      if (quotes.length >= 3) {
        const task = await taskService.getTask(quoteData.displayId);
        if (task) {
          const summary = quotes.map(q => 
            `${q.channel}: ${q.combo} - ${q.premium}元`
          ).join('\n');
          
          await weworkService.sendMessage(task.ownerName, 
            `报价汇总：\n${summary}`
          );
        }
      }
    }
  }
  
  return c.json({ success: true });
});

export default app;