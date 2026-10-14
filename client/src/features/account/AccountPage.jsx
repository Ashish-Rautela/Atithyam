import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '../../services/httpClient.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { Badge, Button, Card, CardHeader, KeyTag, Notice, PageBody, PageHero, Table } from '../../ui/kit.jsx';
import { DataState } from '../../components/DataState.jsx';
import { PasswordInput } from '../auth/AuthLayout.jsx';
import { inr } from '../pricing/razorpay.js';

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const STATUS = { paid: { label: 'Paid', tone: 'good' }, created: { label: 'Not completed', tone: 'muted' }, failed: { label: 'Failed', tone: 'bad' } };

export default function AccountPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const { user, access } = auth;
  useEffect(() => { document.title = 'My account — Atithyam'; }, []);
  if (!user) return null; // RequireAuth handles signed-out visitors

  const paidPlans = access?.plans ?? [];
  const until = paidPlans.length ? paidPlans.map((p) => p.endsAt).sort().at(-1) : null;

  return (
    <>
      <PageHero
        eyebrow="My account"
        deva="आपका खाता"
        title={`Namaste, ${user.name.split(' ')[0]}`}
        subtitle={user.organisation ? `${user.organisation} · ${user.email}` : user.email}
        crumbs={[{ label: 'Home', to: '/' }, { label: 'My account' }]}
        actions={<Button variant="glass" icon="logout" onClick={async () => { await auth.logout(); navigate('/'); }}>Sign out</Button>}
      />
      <PageBody>
        <div className="grid gap-4 sm:grid-cols-3">
          <KeyTag label="Plan" value={auth.planName} sub={until ? `Active until ${fmtDate(until)}` : auth.tier === 'free' ? 'Free forever' : auth.tier === 'admin' ? 'Full access' : ''} icon="key" tone={auth.tier === 'free' ? 'white' : 'geru'} />
          <KeyTag label="Hotels" value={access?.hotelLimit === null ? String(access?.hotelsUsed ?? 0) : `${access?.hotelsUsed ?? 0} of ${access?.hotelLimit}`} sub={access?.hotelLimit === null ? 'No limit on your plan' : 'Upgrade for more hotels'} icon="hotel" />
          <KeyTag label="Member since" value={fmtDate(user.createdAt)} sub={user.role === 'admin' ? 'Administrator' : 'Account'} icon="calendar" />
        </div>

        {auth.tier === 'free' && (
          <Notice tone="info" className="mt-6" title="Compare yourself with the hotels next door" action={<Button size="sm" to="/pricing?plan=pro" icon="arrowRight">See plans</Button>}>
            Hotel Pro adds benchmarks, competitors, trends and AI summaries.
          </Notice>
        )}

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <ProfileCard user={user} onSaved={auth.setAccount} />
          <PasswordCard />
        </div>
        <PaymentsCard />
      </PageBody>
    </>
  );
}

function ProfileCard({ user, onSaved }) {
  const [form, setForm] = useState({ name: user.name, organisation: user.organisation ?? '' });
  const save = useMutation({ mutationFn: () => api.updateProfile({ name: form.name.trim(), organisation: form.organisation.trim() }), onSuccess: (data) => onSaved(data) });
  return (
    <Card>
      <CardHeader title="Profile" icon="user" desc="How your name appears in the app and on payment receipts." />
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
        <label className="block" htmlFor="pf-name"><span className="label">Name</span>
          <input id="pf-name" className="field" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} minLength={2} required />
        </label>
        <label className="block" htmlFor="pf-org"><span className="label">Hotel or organisation</span>
          <input id="pf-org" className="field" value={form.organisation} onChange={(e) => setForm((f) => ({ ...f, organisation: e.target.value }))} />
        </label>
        <label className="block" htmlFor="pf-email"><span className="label">Email</span>
          <input id="pf-email" className="field bg-mist/50" value={user.email} readOnly aria-readonly="true" />
        </label>
        {save.isError && <Notice tone="bad">{save.error.message}</Notice>}
        {save.isSuccess && <Notice tone="good">Saved.</Notice>}
        <Button type="submit" disabled={save.isPending} icon="check">{save.isPending ? 'Saving…' : 'Save profile'}</Button>
      </form>
    </Card>
  );
}

function PasswordCard() {
  const [form, setForm] = useState({ currentPassword: '', newPassword: '' });
  const [show, setShow] = useState(false);
  const change = useMutation({ mutationFn: () => api.changePassword(form), onSuccess: () => setForm({ currentPassword: '', newPassword: '' }) });
  return (
    <Card>
      <CardHeader title="Password" icon="lock" desc="Changing it signs you out on every other device." />
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); change.mutate(); }}>
        <label className="block" htmlFor="pw-current"><span className="label">Current password</span>
          <PasswordInput id="pw-current" value={form.currentPassword} onChange={(e) => setForm((f) => ({ ...f, currentPassword: e.target.value }))} autoComplete="current-password" show={show} onToggle={() => setShow((v) => !v)} />
        </label>
        <label className="block" htmlFor="pw-new"><span className="label">New password</span>
          <PasswordInput id="pw-new" value={form.newPassword} onChange={(e) => setForm((f) => ({ ...f, newPassword: e.target.value }))} autoComplete="new-password" minLength={8} placeholder="At least 8 characters" show={show} onToggle={() => setShow((v) => !v)} />
        </label>
        {change.isError && <Notice tone="bad">{change.error.status === 400 && change.error.type !== 'INVALID_CREDENTIALS' ? 'The new password needs at least 8 characters.' : change.error.message}</Notice>}
        {change.isSuccess && <Notice tone="good">Password changed. Other devices have been signed out.</Notice>}
        <Button type="submit" variant="ghost" disabled={change.isPending} icon="check">{change.isPending ? 'Changing…' : 'Change password'}</Button>
      </form>
    </Card>
  );
}

function PaymentsCard() {
  const q = useQuery({ queryKey: ['payments'], queryFn: api.payments });
  return (
    <Card className="mt-6">
      <CardHeader title="Payments" icon="receipt" desc="Every Razorpay payment on this account." actions={<Button size="sm" variant="ghost" to="/pricing" icon="arrowRight">Plans</Button>} />
      <DataState query={q} isEmpty={(d) => !d.items.length} emptyTitle="No payments yet" emptyHint="Paid plans appear here with their Razorpay reference.">
        {(d) => (
          <Table>
            <thead><tr><th>Date</th><th>Plan</th><th>Amount</th><th>Status</th><th>Razorpay reference</th></tr></thead>
            <tbody>
              {d.items.map((p) => (
                <tr key={p.paymentId}>
                  <td>{fmtDate(p.paidAt ?? p.createdAt)}</td>
                  <td className="font-bold text-pine">{p.plan === 'pro' ? 'Hotel Pro' : 'Destination'} <span className="font-medium text-slate">· {p.days} days</span></td>
                  <td className="num">{inr(p.amountPaise)}</td>
                  <td><Badge tone={STATUS[p.status]?.tone}>{STATUS[p.status]?.label ?? p.status}</Badge></td>
                  <td className="font-mono text-xs text-slate">{p.razorpayPaymentId ?? p.orderId}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </DataState>
    </Card>
  );
}
