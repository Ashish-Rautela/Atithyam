import { lazy, Suspense } from 'react';
import { PageBody, PageHero, Button } from './ui/kit.jsx';
import { Route, Routes, useLocation } from 'react-router-dom';
import SearchPage from './features/search/SearchPage.jsx';
import BusinessPage from './features/business/BusinessPage.jsx';
import CompetitorsPage from './features/competitors/CompetitorsPage.jsx';
import SeedingPage from './features/seeding/SeedingPage.jsx';
import CityPage from './features/seeding/CityPage.jsx';
import BenchmarkPage from './features/benchmark/BenchmarkPage.jsx';
import DestinationPage from './features/destination/DestinationPage.jsx';
import { AppHeader, AppFooter } from './ui/AppShell.jsx';
import { RequireAuth, RequirePlan } from './auth/AuthContext.jsx';
import LoginPage from './features/auth/LoginPage.jsx';
import SignupPage from './features/auth/SignupPage.jsx';
import AccountPage from './features/account/AccountPage.jsx';
import PricingPage from './features/pricing/PricingPage.jsx';

// The marketing homepage carries its own animation libraries and fonts; load them only there.
const HomePage = lazy(() => import('./features/home/HomePage.jsx'));

function NotFound() {
  return (
    <>
      <PageHero title="This trail doesn’t lead anywhere" subtitle="The page you were looking for isn’t here." crumbs={[{ label: 'Home', to: '/' }]} />
      <PageBody><Button to="/search" icon="arrowRight">Check in your hotel</Button></PageBody>
    </>
  );
}

export default function App() {
  const { pathname } = useLocation();
  // Sign-in screens are full-screen, without the site header.
  if (pathname === '/login') return <LoginPage />;
  if (pathname === '/signup') return <SignupPage />;
  if (pathname === '/') {
    return (
      <Suspense fallback={<div style={{ minHeight: '100vh', background: '#F7F4EC' }} />}>
        <HomePage />
      </Suspense>
    );
  }
  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only z-[60] rounded-full bg-pine px-4 py-2 text-white focus:not-sr-only focus:fixed focus:top-3 focus:left-3">Skip to content</a>
      <AppHeader />
      <div className="flex-1">
        <Routes>
          <Route path="/pricing" element={<PricingPage />} />
          <Route path="/account" element={<RequireAuth><AccountPage /></RequireAuth>} />
          <Route path="/search" element={<RequireAuth><SearchPage /></RequireAuth>} />
          <Route path="/business/:bizId" element={<RequireAuth><BusinessPage /></RequireAuth>} />
          <Route path="/business/:bizId/competitors" element={<RequireAuth><RequirePlan plan="pro" title="Competitors"><CompetitorsPage /></RequirePlan></RequireAuth>} />
          <Route path="/business/:bizId/benchmark" element={<RequireAuth><RequirePlan plan="pro" title="Benchmark against the hotels next door"><BenchmarkPage /></RequirePlan></RequireAuth>} />
          <Route path="/seeding" element={<RequireAuth><SeedingPage /></RequireAuth>} />
          <Route path="/seeding/:cityId" element={<RequireAuth><CityPage /></RequireAuth>} />
          <Route path="/seeding/:cityId/destination" element={<RequireAuth><RequirePlan plan="destination" title="Destination dashboard"><DestinationPage /></RequirePlan></RequireAuth>} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </div>
      <AppFooter />
    </div>
  );
}
