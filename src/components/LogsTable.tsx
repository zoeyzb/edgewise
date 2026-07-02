"use client";

import { useEffect, useState } from "react";
import { EmptyState } from "./EmptyState";

interface LogItem {
  id: string;
  at: string;
  level: string;
  category: string;
  message: string;
  market?: string;
  details?: Record<string, string | number | boolean | null>;
}

export function LogsTable() {
  const [items, setItems] = useState<LogItem[]>([]);
  const [dataLabel, setDataLabel] = useState("");

  useEffect(() => {
    fetch("/api/core/logs")
      .then((r) => r.json())
      .then((d) => {
        setItems(d.items ?? []);
        setDataLabel(d.dataLabel ?? "");
      });
  }, []);

  if (items.length === 0) {
    return (
      <EmptyState
        title="No logs yet"
        message="Sanitized logs appear when scanning, validation, execution, and Auto are active."
        label={dataLabel || "NO_LOGS_YET"}
      />
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-edge-border">
      <table className="w-full text-left text-xs">
        <thead className="border-b border-edge-border bg-edge-surface text-edge-muted">
          <tr>
            <th className="px-4 py-3">Time</th>
            <th className="px-4 py-3">Level</th>
            <th className="px-4 py-3">Category</th>
            <th className="px-4 py-3">Message</th>
            <th className="px-4 py-3">Market</th>
          </tr>
        </thead>
        <tbody>
          {items.map((log) => (
            <tr key={log.id} className="border-b border-edge-border/50">
              <td className="px-4 py-2 font-mono whitespace-nowrap">
                {new Date(log.at).toLocaleString()}
              </td>
              <td className="px-4 py-2">{log.level}</td>
              <td className="px-4 py-2">{log.category}</td>
              <td className="px-4 py-2 max-w-md truncate">{log.message}</td>
              <td className="px-4 py-2 font-mono">{log.market ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="px-4 py-2 text-xs text-edge-muted">Sanitized — no secrets</p>
    </div>
  );
}
