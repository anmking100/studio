
import AuthenticatedLayout from '@/components/layout/authenticated-layout';

export default function UserActivityReportPageLayout({ children }: { children: React.ReactNode }) {
  return <AuthenticatedLayout>{children}</AuthenticatedLayout>;
}
