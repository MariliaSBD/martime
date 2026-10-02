import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Remote, RemoteRow } from '@/db/sync';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** Without these variables the app runs in local-only mode (used by the end-to-end tests). */
export const supabase: SupabaseClient | null = url && key && import.meta.env.MODE !== 'test' ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'martime.auth' } }) : null;

export const SUPABASE_URL = url ?? '';
export const SUPABASE_KEY = key ?? '';

export function supabaseRemote(client: SupabaseClient): Remote {
  return {
    async push(table, rows) {
      for (let i = 0; i < rows.length; i += 200) {
        const { error } = await client.from(table).upsert(
          rows.slice(i, i + 200).map(({ server_updated_at: _s, ...r }) => r),
          { onConflict: 'id' },
        );
        if (error) throw error;
      }
    },
    async pull(table, since) {
      const out: RemoteRow[] = [];
      let cursor = since;
      for (;;) {
        let q = client.from(table).select('*').order('server_updated_at', { ascending: true }).limit(1000);
        if (cursor) q = q.gt('server_updated_at', cursor);
        const { data, error } = await q;
        if (error) throw error;
        out.push(...(data as RemoteRow[]));
        if (!data || data.length < 1000) break;
        cursor = (data[data.length - 1] as RemoteRow).server_updated_at ?? cursor;
      }
      return out;
    },
  };
}
