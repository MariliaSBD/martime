import type { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_KEY, SUPABASE_URL } from '@/lib/supabase';

export interface Session {
  userId: string;
  email: string;
}

export type AuthErrorCode = 'invalid' | 'exists' | 'weak' | 'code' | 'network' | 'closed' | 'unknown';

export class AuthError extends Error {
  constructor(public code: AuthErrorCode) {
    super(code);
  }
}

export interface AuthBackend {
  kind: 'supabase' | 'local';
  getSession(): Promise<Session | null>;
  onChange(cb: (s: Session | null) => void): () => void;
  signUp(email: string, password: string): Promise<Session>;
  signIn(email: string, password: string): Promise<Session>;
  signOut(): Promise<void>;
  registrationsOpen(): Promise<boolean>;
  sendResetCode(email: string): Promise<void>;
  resetWithCode(email: string, code: string, password: string): Promise<Session>;
  changePassword(password: string): Promise<void>;
  deleteAccount(): Promise<void>;
}

function mapError(e: unknown): AuthError {
  const msg = String((e as { message?: string })?.message ?? e).toLowerCase();
  const code = String((e as { code?: string })?.code ?? '').toLowerCase();
  if (code.includes('signup_disabled') || msg.includes('signups not allowed')) return new AuthError('closed');
  if (code.includes('user_already_exists') || msg.includes('already registered')) return new AuthError('exists');
  if (code.includes('weak_password') || msg.includes('password should')) return new AuthError('weak');
  if (code.includes('otp') || msg.includes('token has expired') || msg.includes('invalid otp') || msg.includes('token')) return new AuthError('code');
  if (code.includes('invalid_credentials') || msg.includes('invalid login')) return new AuthError('invalid');
  if (msg.includes('fetch') || msg.includes('network')) return new AuthError('network');
  return new AuthError('unknown');
}

export function supabaseAuth(client: SupabaseClient): AuthBackend {
  const toSession = (s: { user: { id: string; email?: string } } | null): Session | null => (s ? { userId: s.user.id, email: s.user.email ?? '' } : null);
  return {
    kind: 'supabase',
    async getSession() {
      const { data } = await client.auth.getSession();
      return toSession(data.session);
    },
    onChange(cb) {
      const { data } = client.auth.onAuthStateChange((_e, s) => cb(toSession(s)));
      return () => data.subscription.unsubscribe();
    },
    async signUp(email, password) {
      const { data, error } = await client.auth.signUp({ email, password });
      if (error) throw mapError(error);
      if (!data.session) throw new AuthError('unknown');
      return toSession(data.session)!;
    },
    async signIn(email, password) {
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw mapError(error);
      return toSession(data.session)!;
    },
    async signOut() {
      await client.auth.signOut();
    },
    async registrationsOpen() {
      try {
        const r = await fetch(`${SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: SUPABASE_KEY } });
        const j = (await r.json()) as { disable_signup?: boolean };
        return !j.disable_signup;
      } catch {
        return false;
      }
    },
    async sendResetCode(email) {
      const { error } = await client.auth.resetPasswordForEmail(email);
      if (error) throw mapError(error);
    },
    async resetWithCode(email, code, password) {
      const { data, error } = await client.auth.verifyOtp({ email, token: code, type: 'recovery' });
      if (error || !data.session) throw mapError(error ?? 'token');
      const up = await client.auth.updateUser({ password });
      if (up.error) throw mapError(up.error);
      return toSession(data.session)!;
    },
    async changePassword(password) {
      const { error } = await client.auth.updateUser({ password });
      if (error) throw mapError(error);
    },
    async deleteAccount() {
      const { error } = await client.functions.invoke('delete-account', { method: 'POST' });
      if (error) throw mapError(error);
      await client.auth.signOut();
    },
  };
}

// ---------- local-only backend (no server; used by end-to-end tests) ----------
const LS_USERS = 'martime.local.users';
const LS_SESSION = 'martime.local.session';
const LS_CODE = 'martime.local.resetCode';
const LS_CLOSED = 'martime.local.registrationsClosed';

async function hash(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function localAuth(): AuthBackend {
  const subs = new Set<(s: Session | null) => void>();
  const users = (): Record<string, { id: string; pw: string }> => JSON.parse(localStorage.getItem(LS_USERS) ?? '{}');
  const setSession = (s: Session | null) => {
    if (s) localStorage.setItem(LS_SESSION, JSON.stringify(s));
    else localStorage.removeItem(LS_SESSION);
    subs.forEach((cb) => cb(s));
  };
  return {
    kind: 'local',
    async getSession() {
      const v = localStorage.getItem(LS_SESSION);
      return v ? (JSON.parse(v) as Session) : null;
    },
    onChange(cb) {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    async signUp(email, password) {
      if (localStorage.getItem(LS_CLOSED) === '1') throw new AuthError('closed');
      const u = users();
      if (u[email]) throw new AuthError('exists');
      if (password.length < 8) throw new AuthError('weak');
      const id = crypto.randomUUID();
      u[email] = { id, pw: await hash(password) };
      localStorage.setItem(LS_USERS, JSON.stringify(u));
      const s = { userId: id, email };
      setSession(s);
      return s;
    },
    async signIn(email, password) {
      const u = users()[email];
      if (!u || u.pw !== (await hash(password))) throw new AuthError('invalid');
      const s = { userId: u.id, email };
      setSession(s);
      return s;
    },
    async signOut() {
      setSession(null);
    },
    async registrationsOpen() {
      return localStorage.getItem(LS_CLOSED) !== '1';
    },
    async sendResetCode(email) {
      if (!users()[email]) return;
      const code = String(Math.floor(100000 + Math.random() * 900000));
      localStorage.setItem(LS_CODE, JSON.stringify({ email, code }));
    },
    async resetWithCode(email, code, password) {
      const saved = JSON.parse(localStorage.getItem(LS_CODE) ?? 'null') as { email: string; code: string } | null;
      if (!saved || saved.email !== email || saved.code !== code) throw new AuthError('code');
      if (password.length < 8) throw new AuthError('weak');
      const u = users();
      u[email].pw = await hash(password);
      localStorage.setItem(LS_USERS, JSON.stringify(u));
      localStorage.removeItem(LS_CODE);
      const s = { userId: u[email].id, email };
      setSession(s);
      return s;
    },
    async changePassword(password) {
      const s = await this.getSession();
      if (!s) return;
      const u = users();
      u[s.email].pw = await hash(password);
      localStorage.setItem(LS_USERS, JSON.stringify(u));
    },
    async deleteAccount() {
      const s = await this.getSession();
      if (!s) return;
      const u = users();
      delete u[s.email];
      localStorage.setItem(LS_USERS, JSON.stringify(u));
      setSession(null);
    },
  };
}
