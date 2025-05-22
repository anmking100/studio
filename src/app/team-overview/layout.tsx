import AuthenticatedLayout from '@/components/layout/authenticated-layout';

export default function TeamOverviewPageLayout({ children }: { children: React.ReactNode }) {
  return <AuthenticatedLayout>{children}</AuthenticatedLayout>;
}
