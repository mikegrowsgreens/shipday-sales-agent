import type { ComponentType } from 'react';

export interface KpiItem {
  label: string;
  value: number | string;
  icon: ComponentType<{ className?: string }>;
  suffix?: string;
  color?: string;
}

export default function KpiGrid({ items }: { items: KpiItem[] }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {items.map((item) => (
        <div key={item.label} className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-gray-400">{item.label}</span>
            <item.icon className="w-4 h-4 text-gray-600" />
          </div>
          <div className={`text-2xl font-bold ${item.color || 'text-white'}`}>
            {item.value}
            {item.suffix && (
              <span className="text-sm font-normal text-gray-400 ml-1">{item.suffix}</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
