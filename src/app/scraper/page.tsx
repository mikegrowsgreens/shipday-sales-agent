'use client';

import ScraperPanel from '@/components/outbound/ScraperPanel';
import { Globe } from 'lucide-react';

export default function ScraperPage() {
  return (
    <div className="flex-1 overflow-auto bg-gray-950 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Globe className="w-6 h-6 text-blue-400" />
          <h1 className="text-2xl font-bold text-white">Lead Scraper</h1>
        </div>
        <ScraperPanel />
      </div>
    </div>
  );
}
