import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseFixedPointLevel,
  validateExchangeStatus,
  validateOrderbookFp,
  reconstructExecutableOrderbook,
  oddsFreshnessFromLastUpdate,
} from "../../src/lib/core/validators.js";
import { validateKeyFormat } from "../../src/lib/server/keys/key-validator.js";
import {
  normalizePrivateKeyPem,
  summarizeKalshiPair,
} from "../../src/lib/server/keys/key-validator.js";
import { testKalshiCredentialPair } from "../../src/lib/server/keys/key-auth-test.js";
import { KalshiWsManager } from "../../src/lib/core/kalshi-ws.js";
import { KALSHI_CONTRACT, ODDS_API_CONTRACT } from "../../src/lib/core/contracts.js";

const TEST_KEY_PEM = "-----BEGIN RSA PRIVATE KEY-----\nTEST_FIXTURE_ONLY\n-----END RSA PRIVATE KEY-----";

describe("fixed-point math", () => {
  it("parses orderbook level", () => {
    const level = parseFixedPointLevel(["0.4500", "100.0000"]);
    assert.ok(level);
    assert.equal(level!.priceDollars, "0.4500");
  });
});

describe("provider validation", () => {
  it("validates exchange status", () => {
    const r = validateExchangeStatus({ exchange_active: true, trading_active: true });
    assert.equal(r.ok, true);
  });

  it("rejects invalid exchange status", () => {
    const r = validateExchangeStatus({});
    assert.equal(r.ok, false);
  });
});

describe("orderbook reconstruction", () => {
  it("reconstructs executable ask from bids — no midpoint", () => {
    const ob = validateOrderbookFp({
      orderbook_fp: {
        yes_dollars: [["0.4200", "50.0000"]],
        no_dollars: [["0.5300", "80.0000"]],
      },
    });
    assert.equal(ob.ok, true);
    if (!ob.ok) return;
    const exec = reconstructExecutableOrderbook({
      ticker: "T",
      yesLevels: ob.yesLevels,
      noLevels: ob.noLevels,
      fetchedAtMs: Date.now(),
      maxAgeMs: 60_000,
      source: "REST",
    });
    assert.equal(exec.executableYesAsk, "0.47");
  });

  it("marks stale orderbook", () => {
    const ob = validateOrderbookFp({
      orderbook_fp: {
        yes_dollars: [["0.4200", "50.0000"]],
        no_dollars: [["0.5300", "80.0000"]],
      },
    });
    if (!ob.ok) return;
    const exec = reconstructExecutableOrderbook({
      ticker: "T",
      yesLevels: ob.yesLevels,
      noLevels: ob.noLevels,
      fetchedAtMs: Date.now() - 120_000,
      maxAgeMs: 60_000,
      source: "REST",
    });
    assert.equal(exec.freshnessState, "STALE");
  });
});

describe("stale odds blocking", () => {
  it("detects stale odds by last update", () => {
    const old = new Date(Date.now() - 300_000).toISOString();
    const r = oddsFreshnessFromLastUpdate(old, 120_000);
    assert.equal(r.fresh, false);
  });
});

describe("key validation", () => {
  it("blocks demo/prod mismatch", () => {
    const r = validateKeyFormat("kalshi_prod_api", "abc12345678", "demo");
    assert.equal(r.valid, false);
    assert.match(r.blockCode ?? "", /MISMATCH/);
  });

  it("requires private key PEM format", () => {
    const r = validateKeyFormat("kalshi_demo_private", "not-a-key", "demo");
    assert.equal(r.valid, false);
    assert.equal(r.errorCategory, "KALSHI_PRIVATE_KEY_FORMAT_ERROR");
  });

  it("preserves private key PEM newlines", () => {
    const pem = "-----BEGIN RSA PRIVATE KEY-----\\nLINE\\n-----END RSA PRIVATE KEY-----";
    const normalized = normalizePrivateKeyPem(pem);
    assert.ok(normalized.includes("\nLINE\n"));
  });

  it("reports incomplete Kalshi pair when API key missing", async () => {
    const result = await testKalshiCredentialPair({
      environment: "demo",
      privateKeyPem:
        "-----BEGIN RSA PRIVATE KEY-----\nTEST\n-----END RSA PRIVATE KEY-----",
    });
    assert.equal(result.ok, false);
    assert.equal(result.errorCategory, "KALSHI_KEY_PAIR_INCOMPLETE");
  });

  it("reports incomplete Kalshi pair when private key missing", async () => {
    const result = await testKalshiCredentialPair({
      environment: "prod",
      apiKey: "abc12345678",
    });
    assert.equal(result.ok, false);
    assert.equal(result.errorCategory, "KALSHI_KEY_PAIR_INCOMPLETE");
  });

  it("reports private key format failure before network", async () => {
    const result = await testKalshiCredentialPair({
      environment: "demo",
      apiKey: "abc12345678",
      privateKeyPem: "not-a-pem",
    });
    assert.equal(result.ok, false);
    assert.equal(result.errorCategory, "KALSHI_PRIVATE_KEY_FORMAT_ERROR");
  });

  it("reports signing failure for malformed PEM body", async () => {
    const result = await testKalshiCredentialPair({
      environment: "demo",
      apiKey: "abc12345678",
      privateKeyPem:
        "-----BEGIN RSA PRIVATE KEY-----\nNOT_VALID_KEY_MATERIAL\n-----END RSA PRIVATE KEY-----",
    });
    assert.equal(result.ok, false);
    assert.equal(result.errorCategory, "KALSHI_SIGNING_ERROR");
  });

  it("summarizes incomplete Kalshi pair", () => {
    const summary = summarizeKalshiPair(
      [
        {
          provider: "kalshi_demo_api",
          enabled: true,
          status: "KALSHI_DEMO_API_KEY_PRESENT",
          lastTestedAt: null,
          errorCategory: null,
        },
      ],
      "demo"
    );
    assert.equal(summary.pairComplete, false);
    assert.equal(summary.errorCategory, "KALSHI_KEY_PAIR_INCOMPLETE");
  });
});

describe("provider contracts marked", () => {
  it("Kalshi contract has official refs", () => {
    assert.ok(KALSHI_CONTRACT.demoRestOrigin);
    assert.ok(KALSHI_CONTRACT.wsPath);
  });

  it("Odds API contract has version", () => {
    assert.ok(ODDS_API_CONTRACT.basePath.includes("v4"));
  });
});

describe("WebSocket manager", () => {
  it("starts disconnected", () => {
    const mgr = new KalshiWsManager(
      { apiKeyId: "test", privateKeyPem: TEST_KEY_PEM, environment: "demo" },
      "demo"
    );
    assert.equal(mgr.getHealth().state, "DISCONNECTED");
  });

  it("tracks reconnect attempts", () => {
    const mgr = new KalshiWsManager(
      { apiKeyId: "test", privateKeyPem: TEST_KEY_PEM, environment: "demo" },
      "demo"
    );
    assert.equal(mgr.getHealth().reconnectAttempts, 0);
  });
});
