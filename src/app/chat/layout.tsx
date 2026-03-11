import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Shipday - Delivery Management Assistant',
  description: 'Chat with our AI assistant to learn how Shipday can help your business manage deliveries more efficiently.',
};

export default function ChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="h-full !bg-white !text-gray-900">
      {children}
    </div>
  );
}
