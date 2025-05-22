import AuthenticatedLayout from '@/components/layout/authenticated-layout';

export default function TaskBatchingPageLayout({ children }: { children: React.ReactNode }) {
  return <AuthenticatedLayout>{children}</AuthenticatedLayout>;
}
