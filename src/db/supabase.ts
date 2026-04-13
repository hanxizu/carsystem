import { createClient } from '@supabase/supabase-js';
import { config } from '../config/index';

if (!config.supabase.url) {
  throw new Error('SUPABASE_URL is not configured');
}

if (!config.supabase.anonKey) {
  throw new Error('SUPABASE_ANON_KEY is not configured');
}

export const supabase = createClient(config.supabase.url, config.supabase.anonKey);