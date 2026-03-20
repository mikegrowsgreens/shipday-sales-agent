'use client';

import { useState } from 'react';
import { Workflow, BookTemplate, Layers } from 'lucide-react';
import CampaignManager from '@/components/outbound/CampaignManager';
import CampaignLibrary from '@/components/outbound/CampaignLibrary';
import TemplateLibrary from '@/components/outbound/TemplateLibrary';
import TierCampaignEditor from '@/components/outbound/TierCampaignEditor';

type Section = 'campaigns' | 'templates' | 'tiers';

const sections: { key: Section; label: string; icon: typeof Workflow }[] = [
  { key: 'campaigns', label: 'My Campaigns', icon: Workflow },
  { key: 'templates', label: 'Templates', icon: BookTemplate },
  { key: 'tiers', label: 'Tier Config', icon: Layers },
];

export default function SequencesHub() {
  const [section, setSection] = useState<Section>('campaigns');

  return (
    <div className="space-y-4">
      {/* Section pill nav */}
      <div className="flex items-center gap-2">
        {sections.map(s => (
          <button
            key={s.key}
            onClick={() => setSection(s.key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-medium transition-colors ${
              section === s.key
                ? 'bg-blue-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
            }`}
          >
            <s.icon className="w-3.5 h-3.5" />
            {s.label}
          </button>
        ))}
      </div>

      {/* My Campaigns section */}
      {section === 'campaigns' && (
        <div className="space-y-6">
          {/* Active campaigns table */}
          <CampaignManager />

          {/* Library campaigns as "Start from template" */}
          <div className="border-t border-gray-800 pt-6">
            <h3 className="text-sm font-semibold text-gray-300 mb-4">Start from Library Template</h3>
            <CampaignLibrary />
          </div>
        </div>
      )}

      {/* Templates section */}
      {section === 'templates' && <TemplateLibrary />}

      {/* Tier Config section */}
      {section === 'tiers' && <TierCampaignEditor />}
    </div>
  );
}
