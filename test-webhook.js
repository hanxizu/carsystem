// 简单测试本地服务器
import { app } from './api/index.ts';

// 模拟请求
const testRequest = async () => {
  const response = await app.request('/api/webhook', {
    method: 'GET',
    query: {
      msg_signature: 'test',
      timestamp: '123456',
      nonce: 'test',
      echostr: 'test'
    }
  });
  const text = await response.text();
  console.log('响应内容:', text);
  console.log('响应状态:', response.status);
};

testRequest();