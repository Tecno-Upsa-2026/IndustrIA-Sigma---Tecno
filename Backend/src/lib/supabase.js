import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_ANON_KEY;

if (!url || !key) {
  console.warn('[Supabase] SUPABASE_URL o SUPABASE_ANON_KEY no configuradas — chat no persistirá');
}

export const supabase = url && key ? createClient(url, key) : null;
