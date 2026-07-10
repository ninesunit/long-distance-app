import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Check your .env file.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  realtime: { params: { eventsPerSecond: 10 } },
});

// Set auth immediately for whatever session already exists on load, THEN
// keep it in sync going forward. Without the immediate getSession() call,
// windows that open with an already-active session (no fresh sign-in event)
// never authorize their realtime connection — breaking private channels.
supabase.auth.getSession().then(({ data: { session } }) => {
  supabase.realtime.setAuth(session?.access_token ?? '');
});

supabase.auth.onAuthStateChange((_event, session) => {
  supabase.realtime.setAuth(session?.access_token ?? '');
});