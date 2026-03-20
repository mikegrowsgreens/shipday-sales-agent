/**
 * Real-Time Business Lookup (Session 10 — Wow Moment)
 * When a prospect names their restaurant, we look up real data
 * from Google Places to reference in the conversation.
 */

export interface BusinessLookupResult {
  name: string;
  rating?: number;
  reviewCount?: number;
  priceLevel?: string;
  address?: string;
  types?: string[];
  isOpen?: boolean;
  topReviewSnippet?: string;
}

/**
 * Look up a restaurant/business using Google Places Text Search API.
 * Returns real data about the business that the chatbot can reference.
 */
export async function lookupBusiness(
  businessName: string,
  location?: string,
): Promise<BusinessLookupResult | null> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) return null;

  try {
    const searchQuery = location
      ? `${businessName} restaurant ${location}`
      : `${businessName} restaurant`;

    const url = new URL('https://maps.googleapis.com/maps/api/place/textsearch/json');
    url.searchParams.set('query', searchQuery);
    url.searchParams.set('type', 'restaurant');
    url.searchParams.set('key', apiKey);

    const response = await fetch(url.toString(), {
      signal: AbortSignal.timeout(3000), // 3s timeout — don't slow down chat
    });

    if (!response.ok) return null;

    const data = await response.json();
    const place = data.results?.[0];
    if (!place) return null;

    const priceLevelMap: Record<number, string> = {
      0: 'Free',
      1: '$',
      2: '$$',
      3: '$$$',
      4: '$$$$',
    };

    return {
      name: place.name,
      rating: place.rating,
      reviewCount: place.user_ratings_total,
      priceLevel: priceLevelMap[place.price_level] || undefined,
      address: place.formatted_address,
      types: place.types?.filter((t: string) => !['point_of_interest', 'establishment', 'food'].includes(t)),
      isOpen: place.opening_hours?.open_now,
    };
  } catch {
    // Lookup failed silently — don't affect chat flow
    return null;
  }
}

/**
 * Format business lookup data for injection into the AI context.
 */
export function formatBusinessContext(result: BusinessLookupResult): string {
  const parts: string[] = [];

  parts.push(`## REAL-TIME BUSINESS INTELLIGENCE (just looked this up — use naturally)`);
  parts.push(`Business: **${result.name}**`);

  if (result.rating) {
    parts.push(`Google Rating: ${result.rating}/5 (${result.reviewCount || 0} reviews)`);
    if (result.rating >= 4.5) {
      parts.push(`→ Great rating! Mention it: "I can see you've got a ${result.rating}-star rating with ${result.reviewCount} reviews — clearly people love what you're doing."`);
    } else if (result.rating >= 4.0) {
      parts.push(`→ Solid rating. Reference casually if relevant.`);
    } else if (result.rating < 3.5) {
      parts.push(`→ Lower rating — DON'T mention it directly. Instead, frame positively: "With direct ordering, you control the customer experience end-to-end, which is great for reputation."`);
    }
  }

  if (result.priceLevel) {
    parts.push(`Price Level: ${result.priceLevel}`);
  }

  if (result.address) {
    parts.push(`Location: ${result.address}`);
  }

  parts.push(`\nDO: Reference this naturally — "I took a quick look at your profile" or "I can see you're popular in your area"`);
  parts.push(`DON'T: Read out data robotically or mention you "looked them up" — weave it in conversationally`);

  return parts.join('\n');
}
