import { DashboardMetrics } from "@/components/organisms/admin/dashboard-metrics";
import { QuickActions } from "@/components/organisms/admin/quick-actions";
import { RecentPayments } from "@/components/organisms/admin/recent-payments";
import { SalesChart } from "@/components/organisms/admin/sales-chart";
import { VisitChart } from "@/components/organisms/admin/visit-chart";
import { VisitStats } from "@/components/organisms/admin/visit-stats";

export default function DashboardPage() {
  return (
    <section className="view active">
      <DashboardMetrics />
      <div className="dashboard-grid">
        <VisitChart />
        <VisitStats />
      </div>
      <div className="dashboard-grid">
        <SalesChart />
        <QuickActions />
      </div>
      <RecentPayments />
    </section>
  );
}
