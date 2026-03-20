'use client';

interface ActivityBadgeProps {
  openCount: number;
  clickCount: number;
  replied: boolean;
  lastOpenAt?: string | null;
  replyAt?: string | null;
}

export function ActivityBadge({ openCount, clickCount, replied, lastOpenAt, replyAt }: ActivityBadgeProps) {
  if (replied) {
    return (
      <div>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-purple-500/20 text-purple-400">
          Replied
        </span>
        {replyAt && (
          <p className="text-xs text-gray-500 mt-1">
            {formatRelative(replyAt)}
          </p>
        )}
      </div>
    );
  }

  if (openCount === 0 && clickCount === 0) {
    return (
      <span className="text-xs text-gray-600">No activity</span>
    );
  }

  const parts: string[] = [];
  if (openCount > 0) parts.push(`${openCount} open${openCount !== 1 ? 's' : ''}`);
  if (clickCount > 0) parts.push(`${clickCount} click${clickCount !== 1 ? 's' : ''}`);

  return (
    <div>
      <span className="text-sm font-medium text-white">{parts.join(' \u00B7 ')}</span>
      {lastOpenAt && (
        <p className="text-xs text-gray-500 mt-0.5">
          Last open {formatRelative(lastOpenAt)}
        </p>
      )}
    </div>
  );
}

function formatRelative(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
