import { ResearchLibrary } from '@/components/research/ResearchLibrary';
import { query } from '@/lib/db';
import { NewsletterInsight } from '@/lib/types';

export const dynamic = 'force-dynamic';

async function getInsights(): Promise<NewsletterInsight[]> {
  try {
    return await query<NewsletterInsight>(
      'SELECT * FROM shipday.newsletter_insights ORDER BY source_date DESC NULLS LAST LIMIT 50'
    );
  } catch {
    return [];
  }
}

export default async function ResearchPage() {
  const insights = await getInsights();

  return (
    <div className="p-6 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Research Library</h1>
        <p className="text-sm text-gray-400 mt-1">
          Newsletter insights and talking points for follow-ups
        </p>
      </div>

      <ResearchLibrary insights={insights} />
    </div>
  );
}
