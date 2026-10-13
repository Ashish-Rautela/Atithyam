# Design system — "Devbhoomi" (client)

Tailwind CSS v4 (`src/index.css` holds the `@theme` tokens). **No new CSS files; no inline `<style>`.**
Use utility classes plus the shared kit. Light theme only.

## Tokens (Tailwind colour names)
pine #102F29 (darkest text / dark surfaces) · forest #1D5746 (primary actions) · moss · glacier #B8DCE8 ·
sky / sky-deep · mist #E8F0EB (soft fills) · ivory #F7F4EC (page bg) · parchment #EFE8D8 · rice #FFFDF7 ·
**geru #8E1B1B** (Aipan red-ochre — cultural accent, sparing) · geru-600 · geru-50 · amber #E8A15A · amber-ink ·
slate #5E6D68 (secondary text) · ink #13231F (body text) · line (hairline borders)
Status: good/good-bg, warn/warn-bg, bad/bad-bg, info/info-bg — always with an icon or word.
Charts: you (forest-green), market (slate-blue), peer, div-neg/div-mid/div-pos.
Fonts: `font-serif` (Fraunces — titles, big numbers), `font-sans` (Manrope — UI), `font-deva` (Hindi accents, add `lang="hi"`).
Shadows: `shadow-card`, `shadow-lift`. Radii: cards `rounded-3xl`, controls `rounded-full` / `rounded-2xl`.
Component classes: `.field` (inputs/selects/textareas), `.label`, `.eyebrow`, `.num` (tabular numbers).

## Kit (`src/ui/…`) — use these, don't re-invent
- `kit.jsx`: `PageHero` (photo banner + Aipan border; props eyebrow, deva, title, subtitle, crumbs[{label,to}], actions),
  `PageBody` (overlapping container, already `<main>`), `Card` (tone white|pine|forest|parchment|geru, `ornament`),
  `CardHeader` (title, icon, desc, actions), `SectionTitle`, `Button` (to|href|onClick; variant primary|geru|light|glass|ghost|subtle; size sm|md|lg; icon/iconLeft),
  `Badge` (tone good|warn|bad|info|muted|geru|dark, icon), `StatusBadge`, `KeyTag` (room-key stat tile: label, value, sub, foot, icon, tone),
  `Segmented` (tabs: options[{value,label,icon,count}], value, onChange, id), `Field` (label + child input), `Notice` (tone, title),
  `EmptyState`, `Spinner`, `Stars`, `Progress`, `Table` (wraps <table>; style th/td automatically, horizontal scroll on phones), `MountainPhoto`, `cx`.
- `icons.jsx`: `<Icon name=… />` (bed key bell utensils broom sparkle pin rupee calendar staff hotel mountain search arrowRight arrowLeft arrowDown check alert star quote language chart trendUp trendDown map refresh menu close download layers users clock flag external info), `AspectIcon aspect=…`.
- `aipan.jsx`: `AipanMandala`, `AipanBorder`, `Vasudhara`, `AipanCorner`, `AipanRule` — use as accents (card corners, section rules, empty states), not wallpaper.
- `components/DataState.jsx` (`DataState`, `StatusBadge`, `Stars`) and `components/charts.jsx` are already restyled.

## Page pattern
```jsx
<>
  <PageHero crumbs={[…]} eyebrow="…" deva="…" title="…" subtitle="…" actions={<Button …/>} />
  <PageBody>
    <Card>…</Card>
  </PageBody>
</>
```
The app header/footer are provided by `App.jsx` — pages render only hero + body.

## Voice & hotel cues
Hotel language where it helps: "Check in your hotel" (add/find a property), "guest book" (reviews), "front desk" (status),
room-key tags for headline numbers, topic icons (bed, plate, bell, broom…). Keep copy plain and short.

## Responsiveness & a11y
Mobile first: stack on phones (`grid gap-4 md:grid-cols-2 lg:grid-cols-3`), tables scroll inside `Table`,
touch targets ≥ 40px, visible focus (global), labels on every input, never colour alone.
