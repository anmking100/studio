
import AuthenticatedLayout from '@/components/layout/authenticated-layout';

export default function JiraRawIssuesPageLayout({ children }: { children: React.ReactNode }) {
  return <AuthenticatedLayout>{children}</AuthenticatedLayout>;
}
