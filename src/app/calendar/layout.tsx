'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import {
  CalendarDays, LayoutGrid, Clock, Users, Link2,
} from 'lucide-react';

const tabs = [
  { href: '/calendar', label: 'Calendar', icon: CalendarDays, exact: true },
  { href: '/calendar/event-types', label: 'Event Types', icon: LayoutGrid },
  { href: '/calendar/availability', label: 'Availability', icon: Clock },
  { href: '/calendar/bookings', label: 'Bookings', icon: Users },
  { href: '/calendar/connections', label: 'Connections', icon: Link2 },
];

export default function CalendarLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Sub-navigation */}
      <div className="border-b border-gray-800 bg-gray-950/50 px-3 sm:px-6 overflow-x-auto scrollbar-hide">
        <nav className="flex items-center gap-1 -mb-px min-w-max">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = tab.exact
              ? pathname === tab.href
              : pathname.startsWith(tab.href);

            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  'flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors',
                  isActive
                    ? 'border-blue-500 text-blue-400'
                    : 'border-transparent text-gray-500 hover:text-gray-300 hover:border-gray-700'
                )}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Page content */}
      <div className="flex-1 overflow-auto">
        {children}
      </div>
    </div>
  );
}
