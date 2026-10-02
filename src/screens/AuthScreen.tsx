import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { AuthError } from '@/auth/backend';
import { useApp } from '@/state/app';
import { Button, Card, Field, Input } from '@/components/ui';
import { LangSwitch } from '@/components/Layout';

type Mode = 'signin' | 'signup' | 'forgot' | 'code';

export function AuthScreen() {
  const { t } = useTranslation();
  const { auth } = useApp();
  const [mode, setMode] = useState<Mode>('signin');
  const [open, setOpen] = useState<boolean | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void auth.registrationsOpen().then(setOpen);
  }, [auth]);

  const fail = (e: unknown) => setError(t(`auth.errors.${e instanceof AuthError ? e.code : 'unknown'}`));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!/^\S+@\S+\.\S+$/.test(email)) return setError(t('auth.errors.email'));
    if (mode !== 'forgot' && password.length < 8) return setError(t('auth.errors.weak'));
    if (mode === 'code' && !/^\d{6}$/.test(code)) return setError(t('auth.errors.code'));
    setBusy(true);
    try {
      if (mode === 'signin') await auth.signIn(email, password);
      if (mode === 'signup') await auth.signUp(email, password);
      if (mode === 'forgot') {
        await auth.sendResetCode(email);
        setMode('code');
        setPassword('');
      }
      if (mode === 'code') await auth.resetWithCode(email, code, password);
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const title = { signin: t('auth.signIn'), signup: t('auth.signUp'), forgot: t('auth.forgot'), code: t('auth.newPassword') }[mode];

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4 py-10">
      <div className="absolute top-3 right-3">
        <LangSwitch />
      </div>
      <div className="flex flex-col items-center gap-2">
        <img src={`${import.meta.env.BASE_URL}icons/icon.svg`} alt="" width={72} height={72} className="rounded-[16px]" />
        <h1 className="text-3xl font-bold">MarTime</h1>
      </div>
      <Card className="w-full max-w-sm">
        <h2 className="mb-4 text-xl font-bold">{title}</h2>
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          <Field label={t('auth.email')}>{(id) => <Input id={id} type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value.trim())} disabled={mode === 'code'} placeholder={t('auth.emailPh')} />}</Field>
          {mode === 'code' && <Field label={t('auth.code')}>{(id) => <Input id={id} inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} placeholder="123456" />}</Field>}
          {mode !== 'forgot' && (
            <Field label={mode === 'code' ? t('auth.newPassword') : t('auth.password')}>
              {(id) => <Input id={id} type="password" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} value={password} onChange={(e) => setPassword(e.target.value)} />}
            </Field>
          )}
          {error && (
            <p role="alert" className="text-[15px] font-medium text-danger-dark">
              {error}
            </p>
          )}
          <Button type="submit" variant="primary" disabled={busy}>
            {{ signin: t('auth.signIn'), signup: t('auth.createAccount'), forgot: t('auth.sendCode'), code: t('auth.savePassword') }[mode]}
          </Button>
        </form>
        <div className="mt-4 flex flex-col gap-1">
          {mode === 'signin' && (
            <Button variant="ghost" onClick={() => (setMode('forgot'), setError(null))}>
              {t('auth.forgot')}
            </Button>
          )}
          {mode === 'signin' && open && (
            <Button variant="ghost" onClick={() => (setMode('signup'), setError(null))}>
              {t('auth.createAccount')}
            </Button>
          )}
          {mode !== 'signin' && (
            <Button variant="ghost" onClick={() => (setMode('signin'), setError(null))}>
              {t('auth.signIn')}
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
