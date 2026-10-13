/**
 * Line icons (24×24, 1.8 stroke, currentColor). Hotel-world icons for the eight review topics plus
 * the UI basics. Decorative by default; pass `title` to make one meaningful.
 */
const PATHS = {
  bed: 'M3 18V8m0 6h18v4m0-4v-2a3 3 0 0 0-3-3h-7v5M7.5 11.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z',
  key: 'M15 7.5a3.5 3.5 0 1 1-3.03 5.25L4 20.5V17h2.5v-2.5H9l2-2',
  bell: 'M4 17h16M6 17a6 6 0 1 1 12 0M12 8V6m-2 0h4M3 20h18',
  utensils: 'M7 3v8m-2.5-8v5a2.5 2.5 0 0 0 5 0V3M7 11v10m10-18c-1.7 1.3-2.5 3.3-2.5 6v4H17v8',
  broom: 'M14 4 9.5 12.5M7 14l5 2.5-1.5 4.5H4.5L7 14zm5 2.5 2-4-5-2.5-2 4',
  sparkle: 'M12 3v4m0 10v4M3 12h4m10 0h4M6.3 6.3l2.4 2.4m6.6 6.6 2.4 2.4m0-11.4-2.4 2.4m-6.6 6.6-2.4 2.4',
  pin: 'M12 21s-7-6.2-7-11.5a7 7 0 1 1 14 0C19 14.8 12 21 12 21zm0-9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  rupee: 'M7 4h10M7 8.5h10M9 4c3.5 0 5.5 1.6 5.5 4.5S12.5 13 9 13H7.5l7 7',
  calendar: 'M4 7h16v13H4zM4 11h16M8 4v4m8-4v4',
  staff: 'M12 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zm-7 9a7 7 0 0 1 14 0',
  hotel: 'M4 21V5l8-2 8 2v16M4 21h16M9 21v-4h6v4M8 8h1m3 0h1m3 0h1M8 12h1m3 0h1m3 0h1',
  mountain: 'm3 19 6.5-11 4 6.5 2-3L21 19H3zm6.5-11 1.8 3',
  search: 'M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14zm9 2-4-4',
  arrowRight: 'M5 12h14m-5-5 5 5-5 5',
  arrowLeft: 'M19 12H5m5-5-5 5 5 5',
  arrowDown: 'M12 5v14m-5-5 5 5 5-5',
  check: 'm5 12.5 4.5 4.5L19 7',
  alert: 'M12 4 2.8 19.5h18.4L12 4zm0 5.5v4.5m0 3v.01',
  star: 'm12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z',
  quote: 'M7 11H4.5A1.5 1.5 0 0 1 3 9.5v-2A1.5 1.5 0 0 1 4.5 6H7a1.5 1.5 0 0 1 1.5 1.5V12c0 2.5-1.5 4.5-4 5m14-6h-2.5A1.5 1.5 0 0 1 13 9.5v-2A1.5 1.5 0 0 1 14.5 6H17a1.5 1.5 0 0 1 1.5 1.5V12c0 2.5-1.5 4.5-4 5',
  language: 'M4 5h9M8.5 3v2m3 0c-1 4.5-3.5 7.5-7 9m2.5-6c1.2 2.4 3 4 5 5M13 21l4-10 4 10m-6.5-3.5h5',
  chart: 'M4 20V4m0 16h16M8 16v-5m4 5V8m4 8v-3',
  trendUp: 'm3 17 6-6 4 4 8-8m-5 0h5v5',
  trendDown: 'm3 7 6 6 4-4 8 8m-5 0h5v-5',
  map: 'm9 4-6 2.5v13.5l6-2.5 6 2.5 6-2.5V4l-6 2.5L9 4zm0 0v13.5m6-11v13.5',
  refresh: 'M20 11a8 8 0 0 0-14.7-4.3M4 5v4h4m-4 4a8 8 0 0 0 14.7 4.3M20 19v-4h-4',
  menu: 'M4 7h16M4 12h16M4 17h16',
  close: 'm6 6 12 12M18 6 6 18',
  download: 'M12 4v11m-4.5-4.5L12 15l4.5-4.5M5 20h14',
  layers: 'm12 4 9 5-9 5-9-5 9-5zm-9 9 9 5 9-5',
  users: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zm-6 9a6 6 0 0 1 12 0m1-9a3 3 0 1 0 0-6m2.5 15a5.5 5.5 0 0 0-3-5',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zm0-13v4.5l3 2',
  flag: 'M5 21V4m0 0h12l-2.5 4L17 12H5',
  external: 'M14 4h6v6m0-6-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zm0-10v5m0-8v.01',
};

export function Icon({ name, className = 'size-5', title, strokeWidth = 1.8 }) {
  const d = PATHS[name] ?? PATHS.info;
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true} focusable="false">
      <path d={d} />
    </svg>
  );
}

/** Icon for each of the eight review topics (keys match utils/format.js ASPECTS). */
export const ASPECT_ICON = {
  food: 'utensils',
  room: 'bed',
  housekeeping: 'broom',
  staff: 'bell',
  location: 'pin',
  value: 'rupee',
  cleanliness: 'sparkle',
  booking: 'calendar',
};

export const AspectIcon = ({ aspect, className }) => <Icon name={ASPECT_ICON[aspect] ?? 'star'} className={className} />;
