import { Link } from 'react-router-dom';
import { MountainPhoto } from '../../ui/kit.jsx';
import { AipanBorder, AipanCorner } from '../../ui/aipan.jsx';
import { Brand } from '../../ui/AppShell.jsx';
import { Icon } from '../../ui/icons.jsx';

/** Only same-site paths are allowed as a post-sign-in destination. */
export function safeNext(next, fallback = '/search') {
  return typeof next === 'string' && next.startsWith('/') && !next.startsWith('//') ? next : fallback;
}

/** Split screen: the Himalaya on one side (hidden on phones), the form on an ivory card. */
export function AuthLayout({ title, deva, subtitle, children, footer }) {
  return (
    <main id="main" className="grid min-h-screen bg-ivory lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative isolate hidden overflow-hidden lg:block">
        <div className="absolute inset-0 -z-10"><MountainPhoto position="50% 35%" priority /></div>
        <div className="absolute inset-0 -z-10 bg-linear-to-b from-pine/30 via-pine/35 to-pine/90" />
        <div className="flex h-full flex-col justify-between p-10">
          <Link to="/" className="self-start rounded-xl" aria-label="Athityam — home"><Brand light /></Link>
          <div className="max-w-md text-white">
            <p className="font-deva text-2xl text-amber" lang="hi">अतिथि देवो भव</p>
            <p className="text-shadow-soft mt-3 font-serif text-4xl leading-tight">Every guest review across the hills, read and compared.</p>
            <ul className="mt-6 space-y-2 text-sm text-mist/90">
              {['Reviews from Google, Booking.com, MakeMyTrip, Agoda', 'Understood in English, हिंदी and Hinglish', 'Compared with the hotels your guests choose between'].map((t) => (
                <li key={t} className="flex items-center gap-2"><Icon name="check" className="size-4 text-amber" /> {t}</li>
              ))}
            </ul>
          </div>
        </div>
        <div className="absolute inset-x-0 bottom-0"><AipanBorder height={20} /></div>
      </aside>

      <section className="relative flex flex-col justify-center px-4 py-10 sm:px-10">
        <div className="mx-auto w-full max-w-md">
          <Link to="/" className="mb-8 inline-block rounded-xl lg:hidden" aria-label="Athityam — home"><Brand /></Link>
          <div className="relative rounded-[2rem] bg-white p-6 shadow-card ring-1 ring-line sm:p-8">
            <AipanCorner className="pointer-events-none absolute top-3 right-3 size-10 opacity-20" rotate={90} />
            {deva && <p className="font-deva text-lg text-geru" lang="hi">{deva}</p>}
            <h1 className="font-serif text-3xl text-pine sm:text-4xl">{title}</h1>
            {subtitle && <p className="mt-2 text-slate">{subtitle}</p>}
            <div className="mt-6">{children}</div>
          </div>
          {footer && <div className="mt-5 text-center text-sm text-slate">{footer}</div>}
        </div>
      </section>
    </main>
  );
}

/** Password input with a show/hide toggle. */
export function PasswordInput({ id, value, onChange, autoComplete, minLength, placeholder, show, onToggle }) {
  return (
    <span className="relative block">
      <input id={id} type={show ? 'text' : 'password'} className="field pr-20" value={value} onChange={onChange} autoComplete={autoComplete} minLength={minLength} placeholder={placeholder} required />
      <button type="button" onClick={onToggle} className="absolute inset-y-1.5 right-1.5 rounded-xl px-3 text-xs font-bold text-forest hover:bg-mist" aria-pressed={show} aria-controls={id}>
        {show ? 'Hide' : 'Show'}
      </button>
    </span>
  );
}
