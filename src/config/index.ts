import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 加载 .env 文件
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const config = {
  supabase: {
    url: process.env.SUPABASE_URL,
    anonKey: process.env.SUPABASE_ANON_KEY,
  },
  wework: {
    corpId: process.env.WEWORK_CORP_ID,
    corpSecret: process.env.WEWORK_CORP_SECRET,
    agentId: process.env.WEWORK_AGENT_ID,
  },
  tencent: {
    secretId: process.env.TENCENT_SECRET_ID,
    secretKey: process.env.TENCENT_SECRET_KEY,
  }
};

// 验证必需的环境变量
const requiredEnvVars = [
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'WEWORK_CORP_ID',
  'WEWORK_CORP_SECRET',
  'WEWORK_AGENT_ID'
];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`Missing required environment variable: ${envVar}`);
    if (process.env.NODE_ENV === 'production') {
      throw new Error(`Missing required environment variable: ${envVar}`);
    }
  }
}