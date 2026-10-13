import { PLATFORM_LABELS, formatDate, pct } from '../../utils/format.js';
import { Badge, Card, cx } from '../../ui/kit.jsx';
import { Icon } from '../../ui/icons.jsx';

function Quotes({ items, who }) {
  if (!items?.length) return null;
  return (
    <ul className="mt-2.5 space-y-2.5">
      {items.map((q, i) => (
        <li key={i} className="border-l-2 border-geru/70 pl-3">
          <blockquote className="font-serif text-[0.95rem] leading-snug text-ink italic">“{q.quote}”</blockquote>
          <span className="mt-0.5 block text-xs text-slate"> — {who ?? q.hotelName}, {PLATFORM_LABELS[q.platform] ?? q.platform}{q.publishedAt ? `, ${formatDate(q.publishedAt, 'month')}` : ''}</span>
        </li>
      ))}
    </ul>
  );
}

const COLUMN = {
  lead: { rule: 'bg-good', chip: 'bg-good-bg text-good', icon: 'trendUp' },
  lag: { rule: 'bg-bad', chip: 'bg-bad-bg text-bad', icon: 'trendDown' },
  market: { rule: 'bg-geru', chip: 'bg-geru-50 text-geru', icon: 'flag' },
};

function Column({ kind, title, sub, children }) {
  const c = COLUMN[kind];
  return (
    <Card className="overflow-hidden">
      <span aria-hidden="true" className={cx('absolute inset-x-0 top-0 h-1.5', c.rule)} />
      <div className="mb-2 flex items-start gap-3">
        <span className={cx('grid size-10 shrink-0 place-items-center rounded-2xl', c.chip)}>
          <Icon name={c.icon} className="size-5" />
        </span>
        <div className="min-w-0">
          <h2 className="font-serif text-xl leading-tight font-medium text-pine">{title}</h2>
          {sub && <p className="mt-0.5 text-xs font-semibold text-slate">{sub}</p>}
        </div>
      </div>
      <div className="divide-y divide-line">{children}</div>
    </Card>
  );
}

const Item = ({ children }) => <div className="py-4 last:pb-0">{children}</div>;
const Empty = ({ children }) => <p className="py-4 text-sm text-slate">{children}</p>;
const Name = ({ children }) => <p className="font-bold text-ink">{children}</p>;
const Meta = ({ children }) => <p className="mt-0.5 text-xs text-slate">{children}</p>;
const Aside = ({ children }) => <p className="mt-3 text-xs font-bold tracking-wide text-slate uppercase">{children}</p>;

/** Where you lead, where you lag, and where the whole market is weak — each with the evidence. */
export default function Findings({ b }) {
  const { leads, lags, marketWide, propertyIssues, marketIssues } = b.findings;
  return (
    <section aria-label="Findings" className="grid items-start gap-4 lg:grid-cols-3">
      <Column kind="lead" title="Where you lead" sub="Topics where guests rate you above the market">
        {leads.length === 0 && <Empty>No aspect where you are clearly ahead yet.</Empty>}
        {leads.map((f) => (
          <Item key={f.aspect}>
            <Name>{f.label}</Name>
            <Meta>score {f.you.score} vs market {f.market.median} · #{f.rank} of {f.rankOf}</Meta>
            <Quotes items={f.evidence} who="your guest" />
            {f.competitorComplaints?.length > 0 && <Aside>Meanwhile at competitors:</Aside>}
            <Quotes items={f.competitorComplaints} />
          </Item>
        ))}
      </Column>
      <Column kind="lag" title="Where you lag" sub="Topics where competitors do better">
        {lags.length === 0 && propertyIssues.length === 0 && <Empty>No aspect where you are clearly behind.</Empty>}
        {lags.map((f) => (
          <Item key={f.aspect}>
            <Name>{f.label}</Name>
            <Meta>score {f.you.score} vs market {f.market.median} · {pct(f.you.negShare)} of your mentions negative vs {pct(f.market.negShare)} in the market</Meta>
            <Quotes items={f.evidence} who="your guest" />
            {f.competitorPraise?.length > 0 && <Aside>Competitors are praised for it:</Aside>}
            <Quotes items={f.competitorPraise} />
          </Item>
        ))}
        {propertyIssues.map((i) => (
          <Item key={i.issue}>
            <div className="flex flex-wrap items-center gap-2"><Name>{i.label}</Name><Badge tone="bad" icon="alert">Your problem</Badge></div>
            <Meta>{i.you.negPer100} complaints per 100 reviews vs {i.market.negPer100 ?? 0} at competitors</Meta>
            <Quotes items={i.evidence} who="your guest" />
          </Item>
        ))}
      </Column>
      <Column kind="market" title="Weak across the market" sub="Your opportunity — whoever fixes it first stands out">
        {marketWide.length === 0 && marketIssues.length === 0 && <Empty>No weakness shared by most competitors.</Empty>}
        {marketWide.map((f) => (
          <Item key={f.aspect}>
            <Name>{f.label}</Name>
            <Meta>{pct(f.market.negShare)} of competitors’ mentions are negative{f.youToo ? ' — yours too' : ' — you do better: say so in your listing'}</Meta>
            <Quotes items={f.evidence} />
          </Item>
        ))}
        {marketIssues.map((i) => (
          <Item key={i.issue}>
            <div className="flex flex-wrap items-center gap-2">
              <Name>{i.label}</Name>
              {i.scope === 'destination' && <Badge tone="info" icon="map">Destination issue</Badge>}
            </div>
            <Meta>{i.market.hotelsAffected} competitors get this complaint</Meta>
            <Quotes items={i.evidence} />
          </Item>
        ))}
      </Column>
    </section>
  );
}
