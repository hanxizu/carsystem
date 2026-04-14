// src/db/supabase.ts
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl) {
  throw new Error('SUPABASE_URL is not configured');
}

if (!supabaseAnonKey) {
  throw new Error('SUPABASE_ANON_KEY is not configured');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);