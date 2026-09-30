import { DashboardMetrics } from "@/components/organisms/admin/dashboard-metrics";
import { QuickActions } from "@/components/organisms/admin/quick-actions";
import { RecentPayments } from "@/components/organisms/admin/recent-payments";
import { SalesChart } from "@/components/organisms/admin/sales-chart";

export default function DashboardPage() {
  return (
    <section className="view active">
      <DashboardMetrics />
      <div className="dashboard-grid">
        <SalesChart />
        <QuickActions />
      </div>
      <RecentPayments />
    </section>
  );
}
