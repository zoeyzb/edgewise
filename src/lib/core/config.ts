export type ConfigFieldState =
  | "missing"
  | "configured"
  | "invalid_format"
  | "server_only"
  | "exposed_by_mistake";

export interface EnvFieldReport {
  name: string;
  state: ConfigFieldState;
  serverOnly: boolean;
  note?: string;
}

export interface AppConfigReport {
  realMoneyTradingEnabled: boolean;
  killSwitchActive: boolean;
  encryptionKeyState: ConfigFieldState;
  fields: EnvFieldReport[];
  secretSafety: "SERVER_SIDE_ONLY" | "EXPOSED_BY_MISTAKE" | "MISSING_ENCRYPTION_KEY";
}

const SERVER_ONLY_ENV_NAMES = [
  "KALSHI_DEMO_API_KEY",
  "KALSHI_DEMO_PRIVATE_KEY",
  "KALSHI_PROD_API_KEY",
  "KALSHI_PROD_PRIVATE_KEY",
  "ODDS_API_KEY",
  "EDGEWISE_SECRET_KEY",
] as const;

function readEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : undefined;
}

function classifySecretEnv(name: string, value: string | undefined): EnvFieldReport {
  const serverOnly = (SERVER_ONLY_ENV_NAMES as readonly string[]).includes(name);

  if (!value) {
    return { name, state: "missing", serverOnly };
  }

  if (name.endsWith("_PRIVATE_KEY") && !value.includes("BEGIN")) {
    return {
      name,
      state: "invalid_format",
      serverOnly,
      note: "Expected PEM private key format",
    };
  }

  if (name.includes("API_KEY") && value.length < 8) {
    return {
      name,
      state: "invalid_format",
      serverOnly,
      note: "Key too short to be plausible",
    };
  }

  return { name, state: "configured", serverOnly };
}

export function getAppConfigReport(): AppConfigReport {
  const exposedPublicSecrets = Object.keys(process.env).filter(
    (key) =>
      key.startsWith("NEXT_PUBLIC_") &&
      /(KEY|SECRET|TOKEN|PRIVATE|PASSWORD)/i.test(key) &&
      Boolean(process.env[key])
  );

  const fields = SERVER_ONLY_ENV_NAMES.map((name) =>
    classifySecretEnv(name, readEnv(name))
  );

  const encryptionKey = readEnv("EDGEWISE_SECRET_KEY");
  let encryptionKeyState: ConfigFieldState = encryptionKey ? "configured" : "missing";
  if (encryptionKey && encryptionKey.length < 16) {
    encryptionKeyState = "invalid_format";
  }

  let secretSafety: AppConfigReport["secretSafety"] = "SERVER_SIDE_ONLY";
  if (exposedPublicSecrets.length > 0) {
    secretSafety = "EXPOSED_BY_MISTAKE";
  } else if (!encryptionKey) {
    secretSafety = "MISSING_ENCRYPTION_KEY";
  }

  if (exposedPublicSecrets.length > 0) {
    for (const name of exposedPublicSecrets) {
      fields.push({
        name,
        state: "exposed_by_mistake",
        serverOnly: false,
        note: "BLOCKED — SECRET_EXPOSED_CLIENT_SIDE",
      });
    }
  }

  return {
    realMoneyTradingEnabled: readEnv("REAL_MONEY_TRADING_ENABLED") === "true",
    killSwitchActive: readEnv("EDGEWISE_KILL_SWITCH") !== "false",
    encryptionKeyState,
    fields,
    secretSafety,
  };
}

export function getEnvSecret(name: (typeof SERVER_ONLY_ENV_NAMES)[number]): string | undefined {
  return readEnv(name);
}

export function isRealMoneyTradingEnabled(): boolean {
  return getAppConfigReport().realMoneyTradingEnabled;
}

export function isKillSwitchActive(): boolean {
  return getAppConfigReport().killSwitchActive;
}
