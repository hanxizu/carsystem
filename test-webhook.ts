import 'dotenv/config';
import app from './src/index';

// 模拟企业微信验证请求
async function testWebhook() {
  console.log('开始测试企业微信回调验证...\n');
  
  // 模拟企业微信发送的验证参数
  const testParams = {
    msg_signature: 'test_signature',
    timestamp: Math.floor(Date.now() / 1000).toString(),
    nonce: Math.random().toString(36).substring(2, 15),
    echostr: 'test_echostr_123456'
  };
  
  // 构建请求 URL
  const url = `/api/webhook?msg_signature=${testParams.msg_signature}&timestamp=${testParams.timestamp}&nonce=${testParams.nonce}&echostr=${testParams.echostr}`;
  
  console.log('请求 URL:', url);
  console.log('请求参数:', testParams);
  console.log('');
  
  // 发送请求
  const response = await app.request(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'text/plain'
    }
  });
  
  const text = await response.text();
  console.log('响应状态:', response.status);
  console.log('响应内容:', text);
  console.log('响应头:', response.headers);
  
  if (response.status === 200 && text) {
    console.log('\n✅ 测试通过！服务器正确响应了验证请求');
  } else {
    console.log('\n❌ 测试失败！请检查 /api/webhook 路由是否正确处理 GET 请求');
  }
}

// 测试 POST 消息接收
async function testPostMessage() {
  console.log('\n========== 测试 POST 消息接收 ==========\n');
  
  // 模拟企业微信推送的消息（XML 格式）
  const mockXml = `<xml>
    <ToUserName><![CDATA[ww123456]]></ToUserName>
    <FromUserName><![CDATA[user123]]></FromUserName>
    <CreateTime>1234567890</CreateTime>
    <MsgType><![CDATA[text]]></MsgType>
    <Content><![CDATA[测试消息]]></Content>
    <MsgId>1234567890</MsgId>
  </xml>`;
  
  const response = await app.request('/api/webhook', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/xml'
    },
    body: mockXml
  });
  
  const text = await response.text();
  console.log('响应状态:', response.status);
  console.log('响应内容:', text);
  
  if (text === 'success') {
    console.log('✅ POST 测试通过！');
  } else {
    console.log('❌ POST 测试失败！');
  }
}

// 运行测试
testWebhook().then(() => testPostMessage());