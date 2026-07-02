"use client";

import { useCallback, useEffect, useState } from "react";
import type { KeyProvider, KeyRecordPublic } from "@/lib/core/types";
import { StatusBadge } from "./StatusBadge";

const PROVIDER_OPTIONS: {
  value: KeyProvider;
  label: string;
  env: "demo" | "prod" | "external";
}[] = [
  { value: "kalshi_demo_api", label: "Kalshi Demo API Key", env: "demo" },
  { value: "kalshi_demo_private", label: "Kalshi Demo Private Key", env: "demo" },
  { value: "kalshi_prod_api", label: "Kalshi Production API Key", env: "prod" },
  { value: "kalshi_prod_private", label: "Kalshi Production Private Key", env: "prod" },
  { value: "odds_api", label: "Odds API Key", env: "external" },
];

interface KalshiPairSummary {
  environment: "demo" | "prod";
  apiPresent: boolean;
  privatePresent: boolean;
  pairComplete: boolean;
  pairStatus: string;
  lastTestedAt: string | null;
  errorCategory: string | null;
  message: string;
}

function isPrivateKeyProvider(provider: KeyProvider) {
  return provider.endsWith("_private");
}

function isKalshiProvider(provider: KeyProvider) {
  return provider.startsWith("kalshi_");
}

export function KeyManager() {
  const [keys, setKeys] = useState<KeyRecordPublic[]>([]);
  const [kalshiPairs, setKalshiPairs] = useState<{
    demo: KalshiPairSummary;
    prod: KalshiPairSummary;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    label: "",
    provider: "kalshi_demo_api" as KeyProvider,
    value: "",
  });
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/core/keys");
      const data = await res.json();
      if (Array.isArray(data)) {
        setKeys(data);
        setKalshiPairs(null);
      } else {
        setKeys(data.keys ?? []);
        setKalshiPairs(data.kalshiPairs ?? null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function addKey(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");
    const providerMeta = PROVIDER_OPTIONS.find((p) => p.value === form.provider);
    const res = await fetch("/api/core/keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        label: form.label || form.provider,
        provider: form.provider,
        value: form.value,
        environment: providerMeta?.env ?? "external",
      }),
    });
    const data = await res.json();
    if (res.ok) {
      setForm({ label: "", provider: form.provider, value: "" });
      setMessage("Key saved server-side. Only masked preview shown.");
      await load();
    } else {
      setMessage(data.blockCode ?? data.errorCategory ?? data.code ?? data.message ?? "Unable to save key");
    }
  }

  async function testOddsKey(id: string) {
    const res = await fetch("/api/core/keys/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const data = await res.json();
    setMessage(data.errorCategory ?? data.message ?? "Test complete");
    await load();
  }

  async function testKalshiPair(environment: "demo" | "prod") {
    const res = await fetch("/api/core/keys/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pair: environment }),
    });
    const data = await res.json();
    setMessage(data.errorCategory ?? data.message ?? "Kalshi pair test complete");
    await load();
  }

  async function disableKey(id: string) {
    await fetch("/api/core/keys/disable", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    await load();
  }

  async function removeKey(id: string) {
    await fetch("/api/core/keys/remove", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    await load();
  }

  const privateKeyInput = isPrivateKeyProvider(form.provider);

  return (
    <div className="space-y-6">
      {kalshiPairs ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {(["demo", "prod"] as const).map((env) => {
            const pair = kalshiPairs[env];
            return (
              <div key={env} className="rounded-xl border border-edge-border bg-edge-surface p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-medium capitalize">{env} Kalshi Pair</h3>
                    <p className="mt-1 text-xs text-edge-muted">{pair.message}</p>
                    <dl className="mt-3 space-y-1 text-xs">
                      <div className="flex gap-2">
                        <dt className="text-edge-muted">API key</dt>
                        <dd>{pair.apiPresent ? "present" : "missing"}</dd>
                      </div>
                      <div className="flex gap-2">
                        <dt className="text-edge-muted">Private key</dt>
                        <dd>{pair.privatePresent ? "present" : "missing"}</dd>
                      </div>
                      <div className="flex gap-2">
                        <dt className="text-edge-muted">Pair</dt>
                        <dd className="font-mono">{pair.pairStatus}</dd>
                      </div>
                      {pair.errorCategory ? (
                        <div className="flex gap-2">
                          <dt className="text-edge-muted">Reason</dt>
                          <dd className="font-mono text-amber-300">{pair.errorCategory}</dd>
                        </div>
                      ) : null}
                      <div className="flex gap-2">
                        <dt className="text-edge-muted">Last tested</dt>
                        <dd>{pair.lastTestedAt ?? "never"}</dd>
                      </div>
                    </dl>
                  </div>
                  <StatusBadge
                    variant={
                      pair.pairStatus === "KALSHI_AUTH_TEST_PASSED"
                        ? "success"
                        : pair.pairStatus === "KALSHI_AUTH_TEST_FAILED"
                          ? "danger"
                          : pair.pairComplete
                            ? "warn"
                            : "muted"
                    }
                  >
                    {pair.pairStatus}
                  </StatusBadge>
                </div>
                <button
                  type="button"
                  onClick={() => testKalshiPair(env)}
                  disabled={!pair.pairComplete}
                  className="mt-4 rounded border border-edge-border px-3 py-1.5 text-xs text-edge-muted hover:text-slate-200 disabled:opacity-40"
                >
                  Test Kalshi Pair ({env})
                </button>
              </div>
            );
          })}
        </div>
      ) : null}

      <div className="rounded-xl border border-edge-border bg-edge-surface p-5">
        <h3 className="font-medium">Add / Update Key</h3>
        <p className="mt-1 text-xs text-edge-muted">
          Keys stored encrypted server-side. Never exposed to browser after save.
          Kalshi API key and private key are saved separately but validated together as one pair.
        </p>
        <form onSubmit={addKey} className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-xs">
            <span className="text-edge-muted">Label</span>
            <input
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
              className="mt-1 w-full rounded border border-edge-border bg-edge-bg px-3 py-2 text-sm"
              placeholder="My Kalshi demo key"
            />
          </label>
          <label className="text-xs">
            <span className="text-edge-muted">Provider</span>
            <select
              value={form.provider}
              onChange={(e) => setForm({ ...form, provider: e.target.value as KeyProvider, value: "" })}
              className="mt-1 w-full rounded border border-edge-border bg-edge-bg px-3 py-2 text-sm"
            >
              {PROVIDER_OPTIONS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs sm:col-span-2">
            <span className="text-edge-muted">
              {privateKeyInput ? "Private key PEM (newlines preserved)" : "Key value (shown once, then masked)"}
            </span>
            {privateKeyInput ? (
              <textarea
                value={form.value}
                onChange={(e) => setForm({ ...form, value: e.target.value })}
                className="mt-1 min-h-[140px] w-full rounded border border-edge-border bg-edge-bg px-3 py-2 font-mono text-xs"
                autoComplete="off"
                spellCheck={false}
              />
            ) : (
              <input
                type="password"
                value={form.value}
                onChange={(e) => setForm({ ...form, value: e.target.value })}
                className="mt-1 w-full rounded border border-edge-border bg-edge-bg px-3 py-2 text-sm"
                autoComplete="off"
              />
            )}
          </label>
          <button
            type="submit"
            className="rounded bg-edge-accent/20 px-4 py-2 text-sm font-medium text-edge-accent hover:bg-edge-accent/30 sm:col-span-2"
          >
            Save Key
          </button>
        </form>
        {message && <p className="mt-3 text-xs text-edge-muted">{message}</p>}
      </div>

      <div className="rounded-xl border border-edge-border bg-edge-surface p-5">
        <h3 className="font-medium">Stored Keys</h3>
        {loading ? (
          <p className="mt-3 text-sm text-edge-muted">Loading...</p>
        ) : keys.length === 0 ? (
          <p className="mt-3 text-sm text-edge-muted">No keys configured.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {keys.map((key) => (
              <li key={key.id} className="rounded-lg border border-edge-border p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{key.label}</p>
                    <p className="text-xs text-edge-muted">{key.provider}</p>
                    <p className="mt-1 font-mono text-xs">{key.maskedPreview}</p>
                    <p className="mt-1 text-xs text-edge-muted">
                      Environment: {key.environment} · Last tested: {key.lastTestedAt ?? "never"}
                    </p>
                    {key.quotaStatus && (
                      <p className="text-xs text-edge-muted">Quota: {key.quotaStatus}</p>
                    )}
                    {key.errorCategory && (
                      <p className="text-xs text-amber-300/80">Reason: {key.errorCategory}</p>
                    )}
                  </div>
                  <StatusBadge variant={key.enabled ? "success" : "muted"}>
                    {key.status}
                  </StatusBadge>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {!isKalshiProvider(key.provider) ? (
                    <ActionBtn onClick={() => testOddsKey(key.id)}>Test</ActionBtn>
                  ) : (
                    <span className="rounded border border-edge-border px-2 py-1 text-xs text-edge-muted">
                      Use Test Kalshi Pair
                    </span>
                  )}
                  <ActionBtn onClick={() => disableKey(key.id)}>Disable</ActionBtn>
                  <ActionBtn onClick={() => removeKey(key.id)}>Remove</ActionBtn>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function ActionBtn({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded border border-edge-border px-2 py-1 text-xs text-edge-muted hover:text-slate-200"
    >
      {children}
    </button>
  );
}
