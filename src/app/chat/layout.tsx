import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'SalesHub - AI Sales Assistant',
  description: 'Chat with our AI assistant to learn how we can help your business grow.',
};

export default function ChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="h-full overflow-hidden !bg-white !text-gray-900">
      {children}
    </div>
  );
}
