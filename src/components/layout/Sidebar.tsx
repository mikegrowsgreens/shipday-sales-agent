'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  LayoutGrid,
  Kanban,
  ListTodo,
  Workflow,
  Target,
  GitBranch,
  Headphones,
  GraduationCap,
  MapPin,
  BarChart3,
  Zap,
  Settings,
  Brain,
  Bot,
  Bookmark,
  Inbox,
  Users,
  Activity,
} from 'lucide-react';

interface NavSection {
  label: string;
  items: NavItem[];
}

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const navSections: NavSection[] = [
  {
    label: 'MAIN',
    items: [
      { href: '/', label: 'Dashboard', icon: LayoutGrid },
      { href: '/inbox', label: 'Inbox', icon: Inbox },
      { href: '/pipeline', label: 'Pipeline', icon: Kanban },
      { href: '/contacts', label: 'Contacts', icon: Users },
      { href: '/queue', label: 'Action Queue', icon: ListTodo },
      { href: '/activity', label: 'Activity Feed', icon: Activity },
    ],
  },
  {
    label: 'OUTREACH',
    items: [
      { href: '/sequences', label: 'Sequences', icon: Workflow },
      { href: '/sequences/templates', label: 'Templates', icon: Bookmark },
      { href: '/outbound', label: 'Outbound', icon: Target },
      { href: '/followups', label: 'Follow-Ups', icon: GitBranch },
    ],
  },
  {
    label: 'INTELLIGENCE',
    items: [
      { href: '/brain', label: 'Knowledge Brain', icon: Brain },
      { href: '/assistant', label: 'BDR Assistant', icon: Bot },
      { href: '/calls', label: 'Phone Agent', icon: Headphones },
      { href: '/coaching', label: 'Coaching & Intel', icon: GraduationCap },
    ],
  },
  {
    label: 'TERRITORY & GROWTH',
    items: [
      { href: '/signups', label: 'Signups & Growth', icon: MapPin },
    ],
  },
  {
    label: 'ANALYTICS',
    items: [
      { href: '/analytics', label: 'Analytics', icon: BarChart3 },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();

  if (pathname === '/login' || pathname === '/chat') return null;

  return (
    <aside className="w-64 border-r border-gray-800 bg-gray-900 flex flex-col shrink-0">
      {/* Header */}
      <div className="p-5 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-blue-400" />
          <div>
            <h1 className="text-lg font-semibold text-white">Shipday</h1>
            <p className="text-xs text-gray-400 -mt-0.5">Sales Hub</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto p-3 space-y-5">
        {navSections.map((section) => (
          <div key={section.label}>
            <div className="px-3 mb-1.5 text-[10px] font-semibold tracking-wider text-gray-500 uppercase">
              {section.label}
            </div>
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const Icon = item.icon;
                const isActive =
                  pathname === item.href ||
                  (item.href !== '/' && pathname.startsWith(item.href));
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-blue-600/20 text-blue-400'
                        : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
                    )}
                  >
                    <Icon className="w-4 h-4" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-gray-800 space-y-1">
        <Link
          href="/settings"
          className={cn(
            'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
            pathname === '/settings'
              ? 'bg-blue-600/20 text-blue-400'
              : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
          )}
        >
          <Settings className="w-4 h-4" />
          Settings
        </Link>
        <div className="flex items-center gap-2 px-3 py-2 text-xs text-gray-500">
          <BarChart3 className="w-3.5 h-3.5" />
          <span>v3.0 - Full Suite</span>
        </div>
      </div>
    </aside>
  );
}
