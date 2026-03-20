'use client';

import { useState, useEffect } from 'react';
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
  BookOpen,
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
  Crown,
  Megaphone,
  CalendarDays,
  Mail,
  Menu,
  X,
  Globe,
  LogOut,
} from 'lucide-react';
import { useRouter } from 'next/navigation';

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
      { href: '/calendar', label: 'Calendar', icon: CalendarDays },
    ],
  },
  {
    label: 'OUTREACH',
    items: [
      { href: '/sequences', label: 'Sequences', icon: Workflow },
      { href: '/sequences/templates', label: 'Templates', icon: Bookmark },
      { href: '/outbound', label: 'Outbound', icon: Target },
      { href: '/followups', label: 'Follow-Ups', icon: GitBranch },
      { href: '/scraper', label: 'Lead Scraper', icon: Globe },
    ],
  },
  {
    label: 'INTELLIGENCE',
    items: [
      { href: '/brain', label: 'Knowledge Brain', icon: Brain },
      { href: '/assistant', label: 'BDR Assistant', icon: Bot },
      { href: '/calls', label: 'Phone Agent', icon: Headphones },
      { href: '/coaching', label: 'Coaching & Intel', icon: GraduationCap },
      { href: '/research', label: 'Research Library', icon: BookOpen },
    ],
  },
  {
    label: 'CUSTOMERS',
    items: [
      { href: '/customers', label: 'Customer Hub', icon: Crown },
      { href: '/customers/campaigns', label: 'Campaigns', icon: Megaphone },
    ],
  },
  {
    label: 'TERRITORY & GROWTH',
    items: [
      { href: '/signups', label: 'Signups & Growth', icon: MapPin },
    ],
  },
  {
    label: 'EMAIL TRACKING',
    items: [
      { href: '/email-tracking', label: 'Tracked Emails', icon: Mail },
    ],
  },
  {
    label: 'ANALYTICS',
    items: [
      { href: '/analytics', label: 'Analytics', icon: BarChart3 },
      { href: '/agent-analytics', label: 'Agent Analytics', icon: Bot },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  };

  // Close mobile sidebar on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Prevent body scroll when mobile sidebar is open
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [mobileOpen]);

  if (pathname === '/login' || pathname === '/chat') return null;

  const sidebarContent = (
    <>
      {/* Header */}
      <div className="p-5 border-b border-gray-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-blue-400" />
          <div>
            <h1 className="text-lg font-semibold text-white">SalesHub</h1>
            <p className="text-xs text-gray-400 -mt-0.5">CRM Platform</p>
          </div>
        </div>
        <button
          onClick={() => setMobileOpen(false)}
          className="lg:hidden p-1.5 rounded-lg text-gray-400 hover:bg-gray-800 hover:text-gray-200 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
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
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-gray-400 hover:bg-red-600/20 hover:text-red-400 transition-colors w-full"
        >
          <LogOut className="w-4 h-4" />
          Log Out
        </button>
        <div className="flex items-center gap-2 px-3 py-2 text-xs text-gray-500">
          <BarChart3 className="w-3.5 h-3.5" />
          <span>v3.0 - Full Suite</span>
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile top bar with hamburger */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-40 h-14 bg-gray-900 border-b border-gray-800 flex items-center px-4 gap-3">
        <button
          onClick={() => setMobileOpen(true)}
          className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-800 hover:text-gray-200 transition-colors"
        >
          <Menu className="w-5 h-5" />
        </button>
        <Zap className="w-4 h-4 text-blue-400" />
        <span className="text-sm font-semibold text-white">SalesHub</span>
      </div>

      {/* Mobile spacer so content isn't hidden behind the top bar */}
      <div className="lg:hidden h-14 shrink-0" />

      {/* Mobile overlay backdrop */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar — desktop: static, mobile: slide-over */}
      <aside
        className={cn(
          'w-64 border-r border-gray-800 bg-gray-900 flex flex-col shrink-0',
          // Desktop: always visible in normal flow
          'hidden lg:flex',
          // Mobile: fixed overlay that slides in/out
          mobileOpen && '!flex fixed inset-y-0 left-0 z-50 shadow-2xl'
        )}
      >
        {sidebarContent}
      </aside>
    </>
  );
}
