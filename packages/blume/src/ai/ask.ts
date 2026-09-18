import type { AskAiConfig } from "../core/schema.ts";

/**
 * The concrete backend the Ask AI endpoint is generated against. `gateway` uses
 * the AI SDK core (`streamText({ model })`) and the Vercel AI Gateway;
 * `openrouter` uses its dedicated provider; everything else streams through the
 * AI SDK's OpenAI-compatible provider.
 */
export type AskBackend =
  | { headers?: AskHeaders; kind: "gateway"; model: string }
  | {
      apiKeyEnv: string;
      headers?: AskHeaders;
      kind: "openrouter";
      model: string;
    }
  | {
      apiKeyEnv: string;
      baseUrl: string;
      headers?: AskHeaders;
      kind: "openai-compatible";
      model: string;
      name: string;
    };

/**
 * Static request headers (`ai.ask.headers`) every backend forwards to its
 * provider factory. Every provider Blume generates against accepts the same
 * `headers` option, so the map travels unchanged; the OpenAI-compatible
 * provider applies them after the `Authorization` header it derives from the
 * API key, so a custom header can't displace auth.
 */
export type AskHeaders = Record<string, string>;

interface AskPreset {
  apiKeyEnv: string;
  baseUrl?: string;
  kind: "openai-compatible" | "openrouter";
  name: string;
  runtimeDep: string;
}

/**
 * Connection presets for the named, non-gateway providers. OpenRouter has a
 * dedicated AI SDK provider; LLMGateway and Inkeep are OpenAI-compatible
 * endpoints with no dedicated provider, so they reuse `@ai-sdk/openai-compatible`.
 */
/** The discriminant/name shared by the OpenAI-compatible providers. */
const OPENAI_COMPATIBLE = "openai-compatible";
/** The AI SDK provider package the OpenAI-compatible providers install. */
const OPENAI_COMPATIBLE_DEP = "@ai-sdk/openai-compatible";

/**
 * Connection presets keyed by provider name. Open-keyed on purpose: lookups
 * use the configured `ai.ask.provider`, which includes values with no preset
 * (the generic `openai-compatible`).
 */
interface AskPresetRegistry {
  [provider: string]: AskPreset;
}

const ASK_PRESETS: AskPresetRegistry = {
  inkeep: {
    apiKeyEnv: "INKEEP_API_KEY",
    baseUrl: "https://api.inkeep.com/v1",
    kind: OPENAI_COMPATIBLE,
    name: "inkeep",
    runtimeDep: OPENAI_COMPATIBLE_DEP,
  },
  llmgateway: {
    apiKeyEnv: "LLMGATEWAY_API_KEY",
    baseUrl: "https://api.llmgateway.io/v1",
    kind: OPENAI_COMPATIBLE,
    name: "llmgateway",
    runtimeDep: OPENAI_COMPATIBLE_DEP,
  },
  openrouter: {
    apiKeyEnv: "OPENROUTER_API_KEY",
    kind: "openrouter",
    name: "openrouter",
    runtimeDep: "@openrouter/ai-sdk-provider",
  },
};

const DEFAULT_MODEL = "openai/gpt-5.5";

/**
 * The `headers` field every backend variant shares. An empty map is dropped so
 * the generated route only carries a `headers` option when there is something
 * to send.
 */
const askHeadersField = (ask?: AskAiConfig): { headers?: AskHeaders } =>
  ask?.headers && Object.keys(ask.headers).length > 0
    ? { headers: ask.headers }
    : {};

/** Resolve the `ai.ask` config into the backend the endpoint is built against. */
export const resolveAskBackend = (ask?: AskAiConfig): AskBackend => {
  const provider = ask?.provider ?? "gateway";
  const model = ask?.model ?? DEFAULT_MODEL;
  const headers = askHeadersField(ask);
  if (provider === "gateway") {
    return { ...headers, kind: "gateway", model };
  }
  const preset = ASK_PRESETS[provider];
  const apiKeyEnv = ask?.apiKeyEnv ?? preset?.apiKeyEnv ?? "API_KEY";
  if (provider === "openrouter") {
    return { apiKeyEnv, ...headers, kind: "openrouter", model };
  }
  // `llmgateway`, `inkeep`, and the generic `openai-compatible` provider all
  // stream through the AI SDK's OpenAI-compatible provider. The schema requires
  // `baseUrl` for the generic case; the named providers fall back to a preset.
  return {
    apiKeyEnv,
    baseUrl: ask?.baseUrl ?? preset?.baseUrl ?? "",
    ...headers,
    kind: OPENAI_COMPATIBLE,
    model,
    name: preset?.name ?? OPENAI_COMPATIBLE,
  };
};

/**
 * The provider SDK a project must install for the configured backend, or
 * `undefined` for `gateway` (which only needs the core `ai` package). Declared
 * in the generated runtime so a project pulls in exactly the backend it uses.
 */
export const askBackendRuntimeDep = (ask?: AskAiConfig): string | undefined => {
  const provider = ask?.provider ?? "gateway";
  if (provider === "gateway") {
    return undefined;
  }
  return ASK_PRESETS[provider]?.runtimeDep ?? OPENAI_COMPATIBLE_DEP;
};
