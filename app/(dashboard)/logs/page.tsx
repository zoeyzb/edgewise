import { PageHeader } from "@/components/PageHeader";
import { LogsTable } from "@/components/LogsTable";
import { DataSourceBar } from "@/components/DataSourceBar";

export default function LogsPage() {
  return (
    <div className="space-y-4">
      <PageHeader
        title="Logs"
        description="Sanitized scan, validation, execution, Auto, and exit events."
        badge="LOGS"
      />
      <DataSourceBar
        dataLabel="SANITIZED_LOGS"
        status="ACTIVE"
        freshness="Append-only server log"
        blockedReason={null}
      />
      <LogsTable />
    </div>
  );
}
