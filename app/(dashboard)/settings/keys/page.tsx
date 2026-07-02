import { PageHeader } from "@/components/PageHeader";
import { KeyManager } from "@/components/KeyManager";
import { DataSourceBar } from "@/components/DataSourceBar";

export default function SettingsKeysPage() {
  return (
    <div className="space-y-4">
      <PageHeader
        title="API Keys"
        description="Manage provider keys. Stored server-side only — never in browser storage."
      />
      <DataSourceBar
        dataLabel="SERVER_SIDE_KEYS"
        status="ENCRYPTED_AT_REST"
        freshness="Never sent to client"
        blockedReason={null}
      />
      <KeyManager />
    </div>
  );
}
