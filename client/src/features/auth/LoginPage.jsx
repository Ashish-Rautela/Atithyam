import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext.jsx';
import { Notice, Spinner } from '../../ui/kit.jsx';
import { Icon } from '../../ui/icons.jsx';
import { AuthLayout, PasswordInput, safeNext } from './AuthLayout.jsx';

export default function LoginPage() {
  const { login, status } = useAuth();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => { document.title = 'Sign in — Review Intelligence'; }, []);
  if (status === 'signed-in' && !busy) return <Navigate to={next} replace />;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login({ email: form.email.trim(), password: form.password });
      navigate(next, { replace: true });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <AuthLayout
      deva="स्वागत है"
      title="Welcome back"
      subtitle="Sign in to see your hotels, reviews and benchmarks."
      footer={<>New here? <Link to={`/signup${params.get('next') ? `?next=${encodeURIComponent(next)}` : ''}`} className="font-bold text-forest underline-offset-4 hover:underline">Create a free account</Link></>}
    >
      <form onSubmit={submit} className="space-y-4" noValidate={false}>
        <label className="block" htmlFor="login-email">
          <span className="label">Email</span>
          <input id="login-email" type="email" className="field" value={form.email} onChange={set('email')} autoComplete="email" required autoFocus />
        </label>
        <label className="block" htmlFor="login-password">
          <span className="label">Password</span>
          <PasswordInput id="login-password" value={form.password} onChange={set('password')} autoComplete="current-password" show={show} onToggle={() => setShow((s) => !s)} />
        </label>
        {error && <Notice tone="bad">{error}</Notice>}
        <button type="submit" disabled={busy} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-geru px-6 font-bold text-rice transition hover:bg-geru-600 disabled:opacity-60">
          {busy ? <Spinner className="size-5" /> : <Icon name="key" className="size-4.5" />} {busy ? 'Signing in…' : 'Sign in'}
        </button>
        <p className="text-center text-xs text-slate">Forgot your password? Ask your administrator to reset it.</p>
      </form>
    </AuthLayout>
  );
}
