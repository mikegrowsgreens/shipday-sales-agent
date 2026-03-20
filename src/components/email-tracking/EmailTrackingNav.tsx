'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Mail, MousePointerClick, Activity, TrendingUp } from 'lucide-react';

const tabs = [
  { href: '/email-tracking', label: 'Tracked Emails', icon: Mail },
  { href: '/email-tracking/clicks', label: 'Click Report', icon: MousePointerClick },
  { href: '/email-tracking/activity', label: 'Activity Feed', icon: Activity },
  { href: '/email-tracking/productivity', label: 'Productivity', icon: TrendingUp },
];

export function EmailTrackingNav() {
  const pathname = usePathname();

  return (
    <div className="flex items-center gap-1 border-b border-gray-700 mb-6">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px',
              isActive
                ? 'border-blue-400 text-blue-400'
                : 'border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-600'
            )}
          >
            <Icon className="w-4 h-4" />
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
