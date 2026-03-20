'use client';

function getColor(score: number): { dot: string; text: string } {
  if (score >= 70) return { dot: 'bg-green-500', text: 'text-green-400' };
  if (score >= 40) return { dot: 'bg-yellow-500', text: 'text-yellow-400' };
  return { dot: 'bg-red-500', text: 'text-red-400' };
}

export function HealthScore({ score }: { score: number }) {
  const { dot, text } = getColor(score);

  return (
    <div className="flex items-center gap-1.5 group relative" title={`Health: ${score}/100`}>
      <div className={`w-2 h-2 rounded-full ${dot}`} />
      <span className={`text-sm ${text}`}>{score}</span>
    </div>
  );
}
