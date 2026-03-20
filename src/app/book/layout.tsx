import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Book a Meeting',
  description: 'Schedule a meeting at a time that works for you.',
};

export default function BookingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
