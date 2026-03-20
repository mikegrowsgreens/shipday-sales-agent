'use client';

const planConfig: Record<string, { label: string; bg: string; text: string }> = {
  branded_elite_lite: { label: 'Elite Lite', bg: 'bg-blue-600/20', text: 'text-blue-400' },
  branded_elite_custom: { label: 'Elite Custom', bg: 'bg-cyan-600/20', text: 'text-cyan-400' },
  branded_premium_plus: { label: 'Premium Plus', bg: 'bg-purple-600/20', text: 'text-purple-400' },
  branded_premium: { label: 'Premium', bg: 'bg-violet-600/20', text: 'text-violet-400' },
  business_advanced_lite: { label: 'Adv Lite', bg: 'bg-amber-600/20', text: 'text-amber-400' },
  business_advanced: { label: 'Advanced', bg: 'bg-green-600/20', text: 'text-green-400' },
  pro: { label: 'Pro', bg: 'bg-orange-600/20', text: 'text-orange-400' },
  elite: { label: 'Elite', bg: 'bg-indigo-600/20', text: 'text-indigo-400' },
};

export function PlanBadge({ plan }: { plan: string | null }) {
  if (!plan) return <span className="text-gray-600 text-xs">—</span>;

  const config = planConfig[plan] || {
    label: plan.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    bg: 'bg-gray-600/20',
    text: 'text-gray-400',
  };

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${config.bg} ${config.text}`}>
      {config.label}
    </span>
  );
}
