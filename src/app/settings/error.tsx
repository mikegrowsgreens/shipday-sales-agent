'use client';

export default function SettingsError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-4">
      <p className="text-red-400 text-sm">Failed to load settings</p>
      <p className="text-gray-500 text-xs max-w-md text-center">{error.message}</p>
      <button onClick={reset} className="text-xs bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded-lg">
        Retry
      </button>
    </div>
  );
}
