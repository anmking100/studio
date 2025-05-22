
import AuthenticatedLayout from '@/components/layout/authenticated-layout';

export default function TeamsIntegrationPageLayout({ children }: { children: React.ReactNode }) {
  return <AuthenticatedLayout>{children}</AuthenticatedLayout>;
}
