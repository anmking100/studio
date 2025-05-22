import AuthenticatedLayout from '@/components/layout/authenticated-layout';

export default function MicrosoftGraphPageLayout({ children }: { children: React.ReactNode }) {
  return <AuthenticatedLayout>{children}</AuthenticatedLayout>;
}
