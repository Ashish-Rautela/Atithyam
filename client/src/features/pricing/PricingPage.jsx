import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../services/httpClient.js';
import { useAuth, PLAN_NAMES } from '../../auth/AuthContext.jsx';
import { Badge, Button, Notice, PageBody, PageHero, Spinner, cx } from '../../ui/kit.jsx';
import { AipanCorner, AipanMandala } from '../../ui/aipan.jsx';
import { Icon } from '../../ui/icons.jsx';
import { DataState } from '../../components/DataState.jsx';
import { openCheckout, inr } from './razorpay.js';
import { safeNext } from '../auth/AuthLayout.jsx';

const LOOK = {
  free: { icon: 'hotel', tone: 'bg-white text-ink ring-1 ring-line', for: 'To try it with your own hotel' },
  pro: { icon: 'chart', tone: 'bg-forest text-mist', for: 'For hotel, homestay and resort owners' },
  destination: { icon: 'map', tone: 'bg-geru text-rice', for: 'For tourism boards and district administration' },
};
const fmtDate = (d) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

export default function PricingPage() {
  const auth = useAuth();
  const [params] = useSearchParams();
  const wanted = params.get('plan');
  // Where to go back after paying (e.g. the report that sent the owner here).
  const next = params.get('next') ? safeNext(params.get('next'), null) : null;
  const plans = useQuery({ queryKey: ['plans'], queryFn: api.plans, staleTime: 300_000 });
  const [flow, setFlow] = useState({ step: 'idle' }); // idle | ordering | paying | verifying | done | error
  useEffect(() => { document.title = 'Plans — Athityam'; }, []);

  const activeUntil = (planId) => auth.access?.plans?.find((p) => p.plan === planId)?.endsAt;

  const buy = async (plan) => {
    setFlow({ step: 'ordering', plan: plan.id });
    try {
      const order = await api.startCheckout(plan.id);
      setFlow({ step: 'paying', plan: plan.id });
      const response = await openCheckout(order, {
        onFailure: (err) => api.reportPaymentFailure({ orderId: order.orderId, reason: err?.description }).catch(() => {}),
      });
      setFlow({ step: 'verifying', plan: plan.id });
      const result = await api.verifyPayment(response);
      auth.setAccount(result.account);
      setFlow({ step: 'done', plan: plan.id, period: result.period, payment: result.payment });
    } catch (err) {
      setFlow(err.cancelled ? { step: 'idle', note: err.message } : { step: 'error', plan: plan.id, message: err.message });
    }
  };

  const busy = ['ordering', 'paying', 'verifying'].includes(flow.step);

  return (
    <>
      <PageHero
        eyebrow="Plans"
        deva="सदस्यता"
        title="Plans for every hotel and hill town"
        subtitle="Start free with your own hotel. Pay with UPI, cards or netbanking through Razorpay - 30 days at a time, no auto-renewal."
        crumbs={[{ label: 'Home', to: '/' }, { label: 'Plans' }]}
      />
      <PageBody>
        <DataState query={plans}>
          {(data) => (
            <div className="space-y-6">
              {data.testMode && (
                <Notice tone="warn" title="Test mode - no real money moves">
                  Payments use Razorpay test keys. In the Razorpay window, pick UPI and enter <code className="rounded bg-white/70 px-1">success@razorpay</code>, or use a test card from Razorpay&rsquo;s documentation.
                </Notice>
              )}
              {!data.enabled && (
                <Notice tone="info" title="Payments are not switched on yet">
                  An administrator needs to add the Razorpay keys (RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET) on the server. Free accounts work already.
                </Notice>
              )}
              {flow.step === 'done' && <Success flow={flow} next={next} />}
              {flow.step === 'error' && <Notice tone="bad" title="The payment did not go through">{flow.message}</Notice>}
              {flow.note && flow.step === 'idle' && <Notice tone="info">{flow.note}</Notice>}

              <div className="grid gap-5 lg:grid-cols-3">
                {data.plans.map((plan) => {
                  const look = LOOK[plan.id];
                  const dark = plan.id !== 'free';
                  const until = activeUntil(plan.id);
                  const current = auth.tier === plan.id || (plan.id === 'free' && auth.tier === 'free');
                  const covered = plan.id === 'pro' && (auth.tier === 'destination' || auth.tier === 'admin');
                  return (
                    <article key={plan.id} className={cx('relative flex flex-col overflow-hidden rounded-[2rem] p-6 shadow-card sm:p-7', look.tone, wanted === plan.id && 'ring-4 ring-amber')} aria-labelledby={`plan-${plan.id}`}>
                      {dark && <AipanMandala className="pointer-events-none absolute -top-20 -right-20 size-56 opacity-10" bg={null} color="#fffdf7" />}
                      {!dark && <AipanCorner className="pointer-events-none absolute top-3 right-3 size-10 opacity-20" rotate={90} />}
                      <div className="relative flex items-center justify-between gap-2">
                        <span className={cx('grid size-12 place-items-center rounded-2xl', dark ? 'bg-white/12 ring-1 ring-white/25' : 'bg-mist')}>
                          <Icon name={look.icon} className={cx('size-6', dark ? 'text-amber' : 'text-forest')} />
                        </span>
                        {plan.id === 'pro' && <Badge tone="dark">Most popular</Badge>}
                        {current && auth.status === 'signed-in' && <Badge tone={dark ? 'dark' : 'good'} icon="check">Your plan</Badge>}
                      </div>
                      <h2 id={`plan-${plan.id}`} className={cx('relative mt-4 font-serif text-3xl', dark ? 'text-white' : 'text-pine')}>{plan.name}</h2>
                      <p className={cx('relative text-sm', dark ? 'text-mist/80' : 'text-slate')}>{look.for}</p>
                      <p className="relative mt-5 flex items-baseline gap-2">
                        <span className={cx('num font-serif text-5xl', dark ? 'text-white' : 'text-pine')}>{plan.pricePaise ? inr(plan.pricePaise) : '₹0'}</span>
                        <span className={cx('text-sm font-semibold', dark ? 'text-mist/75' : 'text-slate')}>{plan.days ? `/ ${plan.days} days` : 'forever'}</span>
                      </p>
                      <ul className="relative mt-5 flex-1 space-y-2.5 text-[0.95rem]">
                        {plan.features.map((f) => (
                          <li key={f} className="flex gap-2.5"><Icon name="check" className={cx('mt-0.5 size-4.5 shrink-0', dark ? 'text-amber' : 'text-good')} /> {f}</li>
                        ))}
                      </ul>
                      {until && <p className={cx('relative mt-4 text-sm font-bold', dark ? 'text-amber' : 'text-forest')}>Active until {fmtDate(until)}</p>}
                      <div className="relative mt-6">
                        <PlanAction plan={plan} auth={auth} enabled={data.enabled} busy={busy} flow={flow} onBuy={buy} until={until} covered={covered} next={next} />
                      </div>
                    </article>
                  );
                })}
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                {[
                  ['Not a subscription', 'Each payment gives 30 days. Buy again before it ends and the days are added on - nothing renews by itself.'],
                  ['Pay your way', 'UPI, cards, netbanking and wallets through Razorpay. Your card or UPI details never reach our servers.'],
                  ['Receipts', 'Razorpay emails a receipt, and every payment is listed under My account → Payments.'],
                ].map(([t, d]) => (
                  <div key={t} className="rounded-3xl bg-white p-5 ring-1 ring-line">
                    <p className="font-serif text-xl text-pine">{t}</p>
                    <p className="mt-1 text-sm text-slate">{d}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </DataState>
      </PageBody>
    </>
  );
}

function PlanAction({ plan, auth, enabled, busy, flow, onBuy, until, covered, next }) {
  const dark = plan.id !== 'free';
  if (auth.status !== 'signed-in') {
    return <Button to={`/signup?next=${encodeURIComponent(`/pricing?plan=${plan.id}${next ? `&next=${encodeURIComponent(next)}` : ''}`)}`} variant={dark ? 'light' : 'primary'} icon="arrowRight" className="w-full">{plan.id === 'free' ? 'Create free account' : 'Create account to buy'}</Button>;
  }
  if (plan.id === 'free') {
    return <Button to="/search" variant="ghost" icon="arrowRight" className="w-full">Check in your hotel</Button>;
  }
  if (auth.tier === 'admin') return <p className="text-sm font-bold text-amber">Administrators have every feature.</p>;
  const mine = flow.plan === plan.id;
  const label = mine && flow.step === 'ordering' ? 'Preparing…' : mine && flow.step === 'paying' ? 'Complete the payment in Razorpay…' : mine && flow.step === 'verifying' ? 'Confirming payment…' : until ? `Add ${plan.days} days · ${inr(plan.pricePaise)}` : `Pay ${inr(plan.pricePaise)} with Razorpay`;
  return (
    <>
      <button
        type="button"
        disabled={!enabled || busy}
        onClick={() => onBuy(plan)}
        className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-rice px-5 font-bold text-pine shadow-[0_10px_24px_-14px_rgb(0_0_0/0.6)] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
      >
        {mine && busy ? <Spinner className="size-5" /> : <Icon name="rupee" className="size-4.5" />} {label}
      </button>
      {covered && <p className="mt-2 text-xs text-mist/80">Your Destination plan already includes everything in Hotel Pro.</p>}
    </>
  );
}

function Success({ flow, next }) {
  const name = PLAN_NAMES[flow.plan];
  return (
    <section className="relative overflow-hidden rounded-[2rem] bg-forest p-6 text-mist shadow-lift sm:p-8" role="status" aria-live="polite">
      <AipanMandala className="pointer-events-none absolute -right-16 -bottom-16 size-56 opacity-15" bg={null} color="#fffdf7" />
      <p className="font-deva text-xl text-amber" lang="hi">धन्यवाद!</p>
      <h2 className="mt-1 font-serif text-3xl text-white">Payment received - {name} is active</h2>
      <p className="mt-2 text-mist/90">
        {flow.period ? <>Your access runs until <strong className="text-white">{fmtDate(flow.period.endsAt)}</strong>.</> : 'This payment was already confirmed.'}
        {flow.payment?.razorpayPaymentId && <> Razorpay reference: <code className="rounded bg-white/10 px-1.5">{flow.payment.razorpayPaymentId}</code></>}
      </p>
      <div className="mt-5 flex flex-wrap gap-2">
        {next
          ? <Button to={next} variant="light" icon="arrowRight">{next.endsWith('/report') ? 'Back to my full report' : 'Continue'}</Button>
          : <Button to={flow.plan === 'destination' ? '/seeding' : '/search'} variant="light" icon="arrowRight">{flow.plan === 'destination' ? 'Open destinations' : 'Open my hotels'}</Button>}
        <Button to="/account" variant="glass">My account</Button>
      </div>
    </section>
  );
}
