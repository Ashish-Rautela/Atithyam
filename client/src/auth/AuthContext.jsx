import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, AUTH_EVENT, PLAN_EVENT } from '../services/httpClient.js';
import { PageBody, PageHero, Spinner } from '../ui/kit.jsx';
import { PlanRequiredCard, UpgradeDialog } from './PlanGate.jsx';

const AuthCtx = createContext(null);

export const PLAN_NAMES = { free: 'Free', pro: 'Hotel Pro', destination: 'Destination', admin: 'Administrator' };
const RANK = { free: 0, pro: 1, destination: 2, admin: 3 };

/** Signed-in account, its plan, and sign-in/out actions for the whole app. */
export function AuthProvider({ children }) {
  const qc = useQueryClient();
  const me = useQuery({ queryKey: ['me'], queryFn: api.me, staleTime: 60_000, retry: 1 });
  const [upgrade, setUpgrade] = useState(null);

  // A new account (or signing out) must not see the previous account's cached pages.
  // (The ['me'] query itself is kept, so components watching it update at once.)
  const replaceAccount = useCallback((account) => {
    qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' });
    qc.setQueryData(['me'], (old) => ({ ...old, ...account }));
  }, [qc]);

  useEffect(() => {
    const onAuth = () => qc.invalidateQueries({ queryKey: ['me'] });
    const onPlan = (e) => setUpgrade(e.detail ?? {});
    window.addEventListener(AUTH_EVENT, onAuth);
    window.addEventListener(PLAN_EVENT, onPlan);
    return () => {
      window.removeEventListener(AUTH_EVENT, onAuth);
      window.removeEventListener(PLAN_EVENT, onPlan);
    };
  }, [qc]);

  const value = useMemo(() => {
    const data = me.data;
    const user = data?.user ?? null;
    const access = data?.access ?? null;
    const tier = access?.tier ?? null;
    return {
      status: me.isPending ? 'loading' : user ? 'signed-in' : me.isError ? 'unknown' : 'signed-out',
      user,
      access,
      tier,
      planName: tier ? PLAN_NAMES[tier] : null,
      authRequired: data?.authRequired ?? true,
      signupOpen: data?.signupOpen ?? true,
      /** True when the account's plan includes `plan` ('pro' | 'destination'). */
      has: (plan) => Boolean(tier) && RANK[tier] >= RANK[plan],
      login: async (payload) => replaceAccount(await api.login(payload)),
      register: async (payload) => replaceAccount(await api.register(payload)),
      logout: async () => {
        await api.logout().catch(() => {});
        replaceAccount({ user: null, access: null });
      },
      /** After a payment or profile change. */
      setAccount: (account) => qc.setQueryData(['me'], (old) => ({ ...old, ...account })),
      refresh: () => qc.invalidateQueries({ queryKey: ['me'] }),
    };
  }, [me.data, me.isPending, me.isError, qc, replaceAccount]);

  return (
    <AuthCtx.Provider value={value}>
      {children}
      <UpgradeDialog open={Boolean(upgrade)} requiredPlan={upgrade?.requiredPlan} message={upgrade?.message} onClose={() => setUpgrade(null)} />
    </AuthCtx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

/** Wraps pages that need an account: sends signed-out visitors to sign in, then back here. */
export function RequireAuth({ children }) {
  const { status, authRequired } = useAuth();
  const loc = useLocation();
  if (!authRequired) return children;
  if (status === 'loading') {
    return (
      <div className="grid min-h-[70vh] place-items-center" role="status">
        <span className="flex items-center gap-3 font-semibold text-slate"><Spinner className="size-8" /> Opening your account…</span>
      </div>
    );
  }
  if (status === 'signed-out') {
    return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  }
  return children;
}

/**
 * For whole pages that belong to a paid plan: signed-in accounts without it see the upgrade card
 * (the server enforces the same rule, this just avoids loading a page that cannot work).
 */
export function RequirePlan({ plan, title, children }) {
  const { has, authRequired, status } = useAuth();
  if (!authRequired || status !== 'signed-in' || has(plan)) return children;
  return (
    <>
      <PageHero eyebrow={plan === 'destination' ? 'For tourism boards' : 'For hotel owners'} title={title} subtitle="Choose a plan to open this view." crumbs={[{ label: 'Home', to: '/' }, { label: 'Plans', to: '/pricing' }]} />
      <PageBody><PlanRequiredCard requiredPlan={plan} /></PageBody>
    </>
  );
}
