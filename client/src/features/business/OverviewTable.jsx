import { StatusBadge, Stars } from '../../components/DataState.jsx';
import { PLATFORM_LABELS, PLATFORM_ORDER, STATUS_INFO, formatInr, formatNumber } from '../../utils/format.js';
import { Table } from '../../ui/kit.jsx';
import { Icon } from '../../ui/icons.jsx';

export default function OverviewTable({ listings, job, platforms = PLATFORM_ORDER }) {
  return (
    <Table>
      <thead>
        <tr>
          <th scope="col">Platform</th>
          <th scope="col">Status</th>
          <th scope="col">Rating</th>
          <th scope="col" className="text-right!">Reviews on site</th>
          <th scope="col" className="text-right!">Collected</th>
          <th scope="col" className="text-right!">Price shown</th>
        </tr>
      </thead>
      <tbody>
        {platforms.map((p) => {
          const s = listings[p];
          const status = job?.platforms?.[p]?.status === 'RUNNING' ? 'RUNNING' : s?.status ?? job?.platforms?.[p]?.status ?? 'PENDING';
          const googlePrice = listings.google_maps?.listing?.prices?.find((x) => x.platform === p)?.priceInr;
          return (
            <tr key={p}>
              <td className="font-bold text-ink">
                {s?.listing?.url ? (
                  <a href={s.listing.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-forest hover:underline">
                    {PLATFORM_LABELS[p]} <Icon name="external" className="size-3.5" title="opens in a new tab" />
                  </a>
                ) : (
                  PLATFORM_LABELS[p]
                )}
              </td>
              <td><StatusBadge status={status} info={STATUS_INFO} /></td>
              <td><Stars rating={s?.listing?.rating} /></td>
              <td className="num text-right">{formatNumber(s?.listing?.reviewCount)}</td>
              <td className="num text-right">{formatNumber(s?.reviewsStored ?? s?.reviewsCollected)}</td>
              <td className="num text-right font-semibold">{formatInr(s?.listing?.priceInr ?? googlePrice)}</td>
            </tr>
          );
        })}
      </tbody>
    </Table>
  );
}
