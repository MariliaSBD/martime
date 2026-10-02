// Deletes the signed-in user; every table cascades on auth.users.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { CORS, json } from '../_shared/cors.ts';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
  const { data, error } = await admin.auth.getUser(jwt);
  if (error || !data.user) return json({ error: 'unauthorized' }, 401);
  const del = await admin.auth.admin.deleteUser(data.user.id);
  if (del.error) return json({ error: del.error.message }, 500);
  return json({ ok: true });
});
