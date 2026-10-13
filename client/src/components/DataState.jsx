import { Button, EmptyState, Notice, Spinner, StatusBadge as KitStatusBadge, Stars as KitStars } from '../ui/kit.jsx';

/**
 * One component for the loading / error / empty states every data view needs.
 * Renders children only when data is ready.
 */
export function DataState({ query, isEmpty, emptyTitle = 'Nothing here yet', emptyHint, loadingText = 'Loading…', children }) {
  if (query.isPending) {
    return (
      <div className="flex items-center gap-3 rounded-2xl bg-white/70 px-4 py-4 text-sm font-semibold text-slate ring-1 ring-line" role="status">
        <Spinner className="size-7" /> {loadingText}
      </div>
    );
  }
  if (query.isError) {
    return (
      <Notice tone="bad" title="Something went wrong." action={<Button size="sm" variant="ghost" icon="refresh" onClick={() => query.refetch()}>Try again</Button>}>
        {query.error?.message}
        {query.error?.correlationId && <span className="mt-1 block text-xs opacity-75">Reference: {query.error.correlationId}</span>}
      </Notice>
    );
  }
  if (isEmpty?.(query.data)) return <EmptyState title={emptyTitle} hint={emptyHint} />;
  return children(query.data);
}

export const StatusBadge = KitStatusBadge;
export const Stars = KitStars;
