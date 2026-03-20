'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Clock, Video, Phone, MapPin, Monitor, ChevronRight } from 'lucide-react';

interface EventType {
  event_type_id: number;
  name: string;
  slug: string;
  description: string | null;
  duration_minutes: number;
  color: string;
  location_type: string;
}

interface OrgData {
  org_name: string;
  logo_url: string | null;
  primary_color: string;
  app_name: string;
  event_types: EventType[];
}

const locationIcons: Record<string, typeof Video> = {
  google_meet: Video,
  zoom: Video,
  phone: Phone,
  in_person: MapPin,
  custom: Monitor,
};

const locationLabels: Record<string, string> = {
  google_meet: 'Google Meet',
  zoom: 'Zoom',
  phone: 'Phone Call',
  in_person: 'In Person',
  custom: 'Custom Location',
};

export default function OrgBookingPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const orgSlug = params.orgSlug as string;
  const isEmbed = searchParams.get('embed') === 'true';

  const [data, setData] = useState<OrgData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/scheduling/public/org?slug=${encodeURIComponent(orgSlug)}`)
      .then(res => {
        if (!res.ok) throw new Error(res.status === 404 ? 'Organization not found' : 'Failed to load');
        return res.json();
      })
      .then(setData)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [orgSlug]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-gray-900 mb-2">Page Not Found</h1>
          <p className="text-gray-500">This booking page doesn&apos;t exist or is no longer available.</p>
        </div>
      </div>
    );
  }

  const primaryColor = data.primary_color || '#2563eb';

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-2xl mx-auto px-4 py-6 text-center">
          {data.logo_url && (
            <img
              src={data.logo_url}
              alt={data.app_name}
              className="h-10 mx-auto mb-3 object-contain"
            />
          )}
          <h1 className="text-2xl font-bold text-gray-900">{data.app_name}</h1>
          <p className="text-gray-500 mt-1">Select an event type to schedule a meeting</p>
        </div>
      </div>

      {/* Event Type Cards */}
      <div className="max-w-2xl mx-auto px-4 py-8">
        {data.event_types.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500">No event types available at this time.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {data.event_types.map(et => {
              const LocationIcon = locationIcons[et.location_type] || Monitor;
              return (
                <button
                  key={et.event_type_id}
                  onClick={() => router.push(`/book/${orgSlug}/${et.slug}${isEmbed ? '?embed=true' : ''}`)}
                  className="w-full bg-white rounded-lg border border-gray-200 p-5 hover:shadow-md transition-shadow text-left group"
                >
                  <div className="flex items-center gap-4">
                    <div
                      className="w-1.5 h-14 rounded-full flex-shrink-0"
                      style={{ backgroundColor: et.color || primaryColor }}
                    />
                    <div className="flex-1 min-w-0">
                      <h2 className="text-lg font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
                        {et.name}
                      </h2>
                      {et.description && (
                        <p className="text-sm text-gray-500 mt-0.5 line-clamp-2">{et.description}</p>
                      )}
                      <div className="flex items-center gap-4 mt-2 text-sm text-gray-400">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          {et.duration_minutes} min
                        </span>
                        <span className="flex items-center gap-1">
                          <LocationIcon className="w-3.5 h-3.5" />
                          {locationLabels[et.location_type] || et.location_type}
                        </span>
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-gray-500 flex-shrink-0" />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer (hidden in embed mode) */}
      {!isEmbed && (
        <div className="text-center py-6 text-xs text-gray-400">
          Powered by {data.app_name}
        </div>
      )}
    </div>
  );
}
