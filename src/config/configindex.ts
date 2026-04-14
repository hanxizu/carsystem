// src/config/index.ts
// 注意：Vercel 环境变量通过 process.env 自动注入
// 本地开发时可使用 dotenv

export interface Config {
  supabase: {
    url: string | undefined;
    anonKey: string | undefined;
  };
  wework: {
    corpId: string | undefined;
    corpSecret: string | undefined;
    agentId: string | undefined;
    token: string | undefined;
    encodingAESKey: string | undefined;
  };
  tencent: {
    secretId: string | undefined;
    secretKey: string | undefined;
  };
  paddleOcr: {
    url: string | undefined;
  };
}

export const config: Config = {
  supabase: {
    url: process.env.SUPABASE_URL,
    anonKey: process.env.SUPABASE_ANON_KEY,
  },
  wework: {
    corpId: process.env.WEWORK_CORP_ID,
    corpSecret: process.env.WEWORK_CORP_SECRET,
    agentId: process.env.WEWORK_AGENT_ID,
    token: process.env.WEWORK_TOKEN,
    encodingAESKey: process.env.WEWORK_ENCODING_AES_KEY,
  },
  tencent: {
    secretId: process.env.TENCENT_SECRET_ID,
    secretKey: process.env.TENCENT_SECRET_KEY,
  },
  paddleOcr: {
    url: process.env.PADDLE_OCR_URL || 'http://localhost:8866/predict/ocr_system',
  }
};

export function validateConfig(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  const requiredConfigs = [
    { value: config.supabase.url, name: 'SUPABASE_URL' },
    { value: config.supabase.anonKey, name: 'SUPABASE_ANON_KEY' },
    { value: config.wework.corpId, name: 'WEWORK_CORP_ID' },
    { value: config.wework.corpSecret, name: 'WEWORK_CORP_SECRET' },
    { value: config.wework.agentId, name: 'WEWORK_AGENT_ID' },
    { value: config.wework.token, name: 'WEWORK_TOKEN' },
    { value: config.wework.encodingAESKey, name: 'WEWORK_ENCODING_AES_KEY' },
    { value: config.tencent.secretId, name: 'TENCENT_SECRET_ID' },
    { value: config.tencent.secretKey, name: 'TENCENT_SECRET_KEY' },
  ];
  
  for (const cfg of requiredConfigs) {
    if (!cfg.value) {
      errors.push(`缺少必需配置: ${cfg.name}`);
    }
  }
  
  if (config.wework.encodingAESKey && config.wework.encodingAESKey.length !== 43) {
    errors.push(`WEWORK_ENCODING_AES_KEY 长度应为43位，当前为${config.wework.encodingAESKey.length}位`);
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}