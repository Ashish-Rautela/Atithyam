import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext.jsx';
import { Notice, Spinner } from '../../ui/kit.jsx';
import { Icon } from '../../ui/icons.jsx';
import { AuthLayout, PasswordInput, safeNext } from './AuthLayout.jsx';

function strength(pw) {
  let s = 0;
  if (pw.length >= 8) s += 1;
  if (pw.length >= 12) s += 1;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s += 1;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) s += 1;
  return s; // 0..4
}
const STRENGTH = ['Too short', 'Okay', 'Good', 'Strong', 'Very strong'];

export default function SignupPage() {
  const { register, status, signupOpen } = useAuth();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', organisation: '', email: '', password: '' });
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => { document.title = 'Create account — Atithyam'; }, []);
  if (status === 'signed-in' && !busy) return <Navigate to={next} replace />;

  const s = strength(form.password);
  const submit = async (e) => {
    e.preventDefault();
    if (form.password.length < 8) {
      setError('Use at least 8 characters for your password.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await register({ name: form.name.trim(), email: form.email.trim(), password: form.password, ...(form.organisation.trim() ? { organisation: form.organisation.trim() } : {}) });
      navigate(next, { replace: true });
    } catch (err) {
      setError(err.status === 400 ? 'Please check the fields: a name, a valid email and a password of 8+ characters.' : err.message);
      setBusy(false);
    }
  };
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <AuthLayout
      deva="पधारो, अतिथि"
      title="Create your account"
      subtitle="Free to start: one hotel with all its reviews. Upgrade any time."
      footer={<>Already have an account? <Link to={`/login${params.get('next') ? `?next=${encodeURIComponent(next)}` : ''}`} className="font-bold text-forest underline-offset-4 hover:underline">Sign in</Link></>}
    >
      {!signupOpen ? (
        <Notice tone="info" title="Sign-ups are closed">Ask an administrator to create an account for you.</Notice>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block" htmlFor="su-name">
              <span className="label">Your name</span>
              <input id="su-name" className="field" value={form.name} onChange={set('name')} autoComplete="name" minLength={2} required autoFocus />
            </label>
            <label className="block" htmlFor="su-org">
              <span className="label">Hotel / organisation</span>
              <input id="su-org" className="field" value={form.organisation} onChange={set('organisation')} autoComplete="organization" placeholder="Optional" />
            </label>
          </div>
          <label className="block" htmlFor="su-email">
            <span className="label">Email</span>
            <input id="su-email" type="email" className="field" value={form.email} onChange={set('email')} autoComplete="email" required />
          </label>
          <label className="block" htmlFor="su-password">
            <span className="label">Password</span>
            <PasswordInput id="su-password" value={form.password} onChange={set('password')} autoComplete="new-password" minLength={8} placeholder="At least 8 characters" show={show} onToggle={() => setShow((v) => !v)} />
          </label>
          {form.password && (
            <div aria-live="polite" className="-mt-1">
              <div className="flex gap-1">{[0, 1, 2, 3].map((i) => <span key={i} className={`h-1.5 flex-1 rounded-full ${i < s ? (s >= 3 ? 'bg-good' : 'bg-amber') : 'bg-line'}`} />)}</div>
              <p className="mt-1 text-xs font-semibold text-slate">Password: {STRENGTH[s]}</p>
            </div>
          )}
          {error && <Notice tone="bad">{error}</Notice>}
          <button type="submit" disabled={busy} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-geru px-6 font-bold text-rice transition hover:bg-geru-600 disabled:opacity-60">
            {busy ? <Spinner className="size-5" /> : <Icon name="key" className="size-4.5" />} {busy ? 'Creating your account…' : 'Create free account'}
          </button>
          <p className="text-center text-xs text-slate">We only use your email for your account and payment receipts.</p>
        </form>
      )}
    </AuthLayout>
  );
}
