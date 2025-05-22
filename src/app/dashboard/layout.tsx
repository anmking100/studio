import AuthenticatedLayout from '@/components/layout/authenticated-layout';

export default function DashboardPageLayout({ children }: { children: React.ReactNode }) {
  return <AuthenticatedLayout>{children}</AuthenticatedLayout>;
}
