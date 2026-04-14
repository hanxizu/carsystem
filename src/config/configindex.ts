// config/index.ts
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 加载 .env 文件
const envPath = path.resolve(__dirname, '../../.env');
const result = dotenv.config({ path: envPath });

if (result.error) {
  console.warn('⚠️ 未找到 .env 文件，使用系统环境变量');
} else {
  console.log('✅ 已加载 .env 配置文件');
}

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

// 验证配置
export function validateConfig(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  const requiredConfigs = [
    { path: 'supabase.url', value: config.supabase.url, name: 'SUPABASE_URL' },
    { path: 'supabase.anonKey', value: config.supabase.anonKey, name: 'SUPABASE_ANON_KEY' },
    { path: 'wework.corpId', value: config.wework.corpId, name: 'WEWORK_CORP_ID' },
    { path: 'wework.corpSecret', value: config.wework.corpSecret, name: 'WEWORK_CORP_SECRET' },
    { path: 'wework.agentId', value: config.wework.agentId, name: 'WEWORK_AGENT_ID' },
    { path: 'wework.token', value: config.wework.token, name: 'WEWORK_TOKEN' },
    { path: 'wework.encodingAESKey', value: config.wework.encodingAESKey, name: 'WEWORK_ENCODING_AES_KEY' },
    { path: 'tencent.secretId', value: config.tencent.secretId, name: 'TENCENT_SECRET_ID' },
    { path: 'tencent.secretKey', value: config.tencent.secretKey, name: 'TENCENT_SECRET_KEY' },
  ];
  
  for (const cfg of requiredConfigs) {
    if (!cfg.value) {
      errors.push(`缺少必需配置: ${cfg.name}`);
    }
  }
  
  // 验证 EncodingAESKey 长度
  if (config.wework.encodingAESKey && config.wework.encodingAESKey.length !== 43) {
    errors.push(`WEWORK_ENCODING_AES_KEY 长度应为43位，当前为${config.wework.encodingAESKey.length}位`);
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

// 开发环境下的配置警告
if (process.env.NODE_ENV !== 'production') {
  const validation = validateConfig();
  if (!validation.valid) {
    console.warn('⚠️ 配置验证失败（开发模式）：');
    validation.errors.forEach(err => console.warn(`  - ${err}`));
    console.warn('部分功能可能无法正常工作');
  }
}