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
          <Route path="/search" element={<SearchPage />} />
          <Route path="/business/:bizId" element={<BusinessPage />} />
          <Route path="/business/:bizId/competitors" element={<CompetitorsPage />} />
          <Route path="/seeding" element={<SeedingPage />} />
          <Route path="/seeding/:cityId" element={<CityPage />} />
          <Route path="/business/:bizId/benchmark" element={<BenchmarkPage />} />
          <Route path="/seeding/:cityId/destination" element={<DestinationPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </div>
      <AppFooter />
    </div>
  );
}
