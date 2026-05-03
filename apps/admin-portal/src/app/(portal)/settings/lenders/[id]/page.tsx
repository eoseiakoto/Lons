import { redirect } from 'next/navigation';

export default function LenderDetailRedirect({ params }: { params: { id: string } }) {
  redirect(`/lenders/${params.id}`);
}
