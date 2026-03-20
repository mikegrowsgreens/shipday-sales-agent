import { redirect } from 'next/navigation';

export default function Redirect({ params }: { params: { id: string } }) {
  redirect(`/calendar/bookings/${params.id}`);
}
