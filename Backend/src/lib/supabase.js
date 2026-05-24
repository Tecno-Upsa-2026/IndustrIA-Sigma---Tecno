import { createClient } from '@supabase/supabase-js';

const url     = process.env.SUPABASE_URL;
const anon    = process.env.SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !anon) {
  console.warn('[Supabase] SUPABASE_URL o SUPABASE_ANON_KEY no configuradas');
}

// Regular client — read/write data, verify credentials
export const supabase = url && anon ? createClient(url, anon) : null;

// Admin client — NEVER sent to frontend; used only for invite/user management
export const supabaseAdmin = url && service
  ? createClient(url, service, { auth: { autoRefreshToken: false, persistSession: false } })
  : null;
