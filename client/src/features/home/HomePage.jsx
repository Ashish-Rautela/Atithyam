import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { MotionConfig } from 'framer-motion';
import { SmoothScroll, useSmoothScroll } from './motion/SmoothScroll.jsx';
import { ScrollTrigger } from './motion/motion.js';
import { AppHeader, AppFooter } from '../../ui/AppShell.jsx';
import Hero from './sections/Hero.jsx';
import Audience from './sections/Audience.jsx';
import Voices from './sections/Voices.jsx';
import TopicStory from './sections/TopicStory.jsx';
import MicroMarket from './sections/MicroMarket.jsx';
import { Warnings, Destinations } from './sections/Destinations.jsx';
import { Impact, Measures, FinalCta } from './sections/Closing.jsx';

/** Scrolls to /#section links (footer, nav) once the page has laid out. */
function HashScroll() {
  const { hash } = useLocation();
  const { scrollTo } = useSmoothScroll();
  useEffect(() => {
    if (!hash) return undefined;
    // Wait for fonts and the pinned section's spacer, otherwise the target position is stale.
    const timers = [];
    let live = true;
    const off = () => document.querySelector(hash)?.getBoundingClientRect().top ?? 72;
    (document.fonts?.ready ?? Promise.resolve()).then(() => {
      timers.push(setTimeout(() => {
        if (!live) return;
        ScrollTrigger.refresh();
        scrollTo(hash, { offset: -72 });
        // Sections reveal and pin while we travel, so correct once the scroll has landed.
        timers.push(setTimeout(() => {
          if (live && Math.abs(off() - 72) > 12) scrollTo(hash, { offset: -72, duration: 0.6 });
        }, 1700));
      }, 250));
    });
    return () => { live = false; timers.forEach(clearTimeout); };
  }, [hash, scrollTo]);
  return null;
}

/**
 * Homepage for the Uttarakhand review-intelligence platform: hotels and tourism boards across the
 * state. All analytics here are illustrative demo data (data/homeDemo.js), labelled on the page;
 * live coverage counts appear when destinations have been seeded.
 */
export default function HomePage() {
  useEffect(() => {
    document.title = 'Review Intelligence — guest reviews & hotel benchmarking for Uttarakhand';
  }, []);

  return (
    <MotionConfig reducedMotion="user">
      <SmoothScroll>
        <HashScroll />
        <div className="flex min-h-screen flex-col overflow-x-clip">
          <a href="#main" className="sr-only z-[60] rounded-full bg-pine px-4 py-2 text-white focus:not-sr-only focus:fixed focus:top-3 focus:left-3">Skip to content</a>
          <AppHeader />
          <main id="main" className="flex-1">
            <Hero />
            <Audience />
            <Voices />
            <TopicStory />
            <MicroMarket />
            <Warnings />
            <Destinations />
            <Impact />
            <Measures />
            <FinalCta />
          </main>
          <AppFooter />
        </div>
      </SmoothScroll>
    </MotionConfig>
  );
}
