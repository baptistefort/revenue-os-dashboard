import "server-only";
import { Buffer } from "node:buffer";
import {
  createOpencodeClient,
  type OpencodeClient,
  type Part,
  type PermissionRuleset,
  type Session,
} from "@opencode-ai/sdk/v2";
import { z } from "zod";
import {
  OpenCodeOutputValidationError,
  validateOpenCodeStructuredOutput,
} from "@/lib/opencode-output";
import { StreamingJsonStringField } from "@/lib/streaming-json";

const DEFAULT_BASE_URL = "http://127.0.0.1:4096";
const DEFAULT_AGENT = "ops";
const DEFAULT_TIMEOUT_MS = 90_000;
const MAX_TIMEOUT_MS = 10 * 60_000;
const DEFAULT_STRUCTURED_OUTPUT_RETRIES = 0;
const MAX_STRUCTURED_OUTPUT_RETRIES = 5;
const SESSION_ABORT_TIMEOUT_MS = 5_000;

/**
 * These names must match the custom tools installed in `.opencode/tools`.
 * Document generation intentionally remains in the application route.
 */
export const DEFAULT_OPS_TOOLS = [
  "ops_memory_search",
  "ops_memory_get",
  "ops_memory_related",
  "ops_vault_search",
  "ops_vault_read",
] as const;

/**
 * Kept explicit for auditability even though the prompt also carries a
 * catch-all `"*": false` tool rule.
 */
export const OPENCODE_BUILTIN_TOOLS = [
  "bash",
  "edit",
  "write",
  "patch",
  "apply_patch",
  "read",
  "glob",
  "grep",
  "list",
  "lsp",
  "task",
  "skill",
  "question",
  "webfetch",
  "websearch",
  "todowrite",
  "todoread",
] as const;

export type OpenCodeModel = {
  providerID: string;
  modelID: string;
  variant?: string;
};

export type OpenCodeAdapterOptions = {
  baseUrl?: string;
  directory?: string;
  workspace?: string;
  username?: string;
  password?: string;
  agent?: string;
  model?: OpenCodeModel;
  system?: string;
  allowedTools?: readonly string[];
  timeoutMs?: number;
  structuredOutputRetries?: number;
};

export type OpenCodeSessionOptions = {
  sessionId?: string;
  title?: string;
  metadata?: Record<string, unknown>;
  signal?: AbortSignal;
  timeoutMs?: number;
};

export type OpenCodeSessionHandle = {
  session: Session;
  created: boolean;
};

export type OpenCodeStructuredPrompt<TSchema extends z.ZodType> = {
  message: string;
  schema: TSchema;
  researchWithTools?: boolean;
  sessionHandle?: OpenCodeSessionHandle;
  sessionId?: string;
  sessionTitle?: string;
  sessionMetadata?: Record<string, unknown>;
  agent?: string;
  model?: OpenCodeModel;
  system?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  onAnswerDelta?: (delta: string) => void;
};

export type OpenCodeStructuredResult<TSchema extends z.ZodType> = {
  sessionId: string;
  sessionCreated: boolean;
  assistantMessageId: string;
  text: string;
  data: z.output<TSchema>;
};

type ResolvedOpenCodeAdapterOptions = {
  baseUrl: string;
  directory: string;
  workspace?: string;
  username: string;
  password?: string;
  agent: string;
  model?: OpenCodeModel;
  system?: string;
  allowedTools: readonly string[];
  timeoutMs: number;
  structuredOutputRetries: number;
};

type AbortScope = {
  signal: AbortSignal;
  timedOut: () => boolean;
  parentAborted: () => boolean;
  cleanup: () => void;
};

export type OpenCodeAdapterErrorCode =
  | "opencode_configuration_error"
  | "opencode_request_failed"
  | "opencode_session_not_found"
  | "opencode_assistant_error"
  | "opencode_invalid_structured_output"
  | "opencode_timeout"
  | "opencode_aborted";

export class OpenCodeAdapterError extends Error {
  readonly code: OpenCodeAdapterErrorCode;
  readonly status?: number;
  override readonly cause?: unknown;

  constructor(
    code: OpenCodeAdapterErrorCode,
    message: string,
    options: { cause?: unknown; status?: number } = {},
  ) {
    super(message);
    this.name = "OpenCodeAdapterError";
    this.code = code;
    this.status = options.status;
    if (options.cause !== undefined) {
      Object.defineProperty(this, "cause", {
        configurable: true,
        enumerable: false,
        value: options.cause,
      });
    }
  }
}

export class OpenCodeStructuredOutputError extends OpenCodeAdapterError {
  readonly issues: readonly unknown[];
  readonly outputPreview?: string;

  constructor(message: string, issues: readonly unknown[] = [], outputPreview?: string) {
    super("opencode_invalid_structured_output", message);
    this.name = "OpenCodeStructuredOutputError";
    this.issues = issues;
    this.outputPreview = outputPreview;
  }
}

function cleanOptionalString(value: string | undefined) {
  const cleaned = value?.trim();
  return cleaned ? cleaned : undefined;
}

function parseInteger(
  value: number | string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
  label: string,
) {
  const parsed = typeof value === "number" ? value : value === undefined ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new OpenCodeAdapterError(
      "opencode_configuration_error",
      `${label} doit être un entier compris entre ${minimum} et ${maximum}.`,
    );
  }
  return parsed;
}

function parseAllowedTools(value: readonly string[] | string | undefined) {
  const candidates = typeof value === "string"
    ? value.split(",")
    : value ?? DEFAULT_OPS_TOOLS;
  const tools = [...new Set(candidates.map((tool) => tool.trim()).filter(Boolean))];

  if (!tools.length) {
    throw new OpenCodeAdapterError(
      "opencode_configuration_error",
      "Au moins un outil OPS doit être autorisé.",
    );
  }

  const invalid = tools.find((tool) => !/^[a-zA-Z0-9][a-zA-Z0-9_.:-]*$/.test(tool));
  if (invalid) {
    throw new OpenCodeAdapterError(
      "opencode_configuration_error",
      `Nom d’outil OpenCode invalide : ${invalid}. Les jokers ne sont pas autorisés dans l’allowlist.`,
    );
  }

  return Object.freeze(tools);
}

function parseModel(
  model: OpenCodeModel | undefined,
  providerFromEnvironment: string | undefined,
  modelFromEnvironment: string | undefined,
  variantFromEnvironment: string | undefined,
) {
  if (model) {
    const providerID = cleanOptionalString(model.providerID);
    const modelID = cleanOptionalString(model.modelID);
    if (!providerID || !modelID) {
      throw new OpenCodeAdapterError(
        "opencode_configuration_error",
        "Le providerID et le modelID OpenCode sont obligatoires lorsqu’un modèle est configuré.",
      );
    }
    return { providerID, modelID, variant: cleanOptionalString(model.variant) };
  }

  const providerID = cleanOptionalString(providerFromEnvironment);
  const modelID = cleanOptionalString(modelFromEnvironment);
  if (Boolean(providerID) !== Boolean(modelID)) {
    throw new OpenCodeAdapterError(
      "opencode_configuration_error",
      "OPENCODE_PROVIDER et OPENCODE_MODEL doivent être définis ensemble.",
    );
  }
  if (!providerID || !modelID) return undefined;
  return { providerID, modelID, variant: cleanOptionalString(variantFromEnvironment) };
}

function resolveOptions(options: OpenCodeAdapterOptions): ResolvedOpenCodeAdapterOptions {
  const baseUrl = cleanOptionalString(options.baseUrl ?? process.env.OPENCODE_BASE_URL) ?? DEFAULT_BASE_URL;
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(baseUrl);
  } catch (cause) {
    throw new OpenCodeAdapterError(
      "opencode_configuration_error",
      "OPENCODE_BASE_URL doit être une URL absolue valide.",
      { cause },
    );
  }
  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    throw new OpenCodeAdapterError(
      "opencode_configuration_error",
      "OPENCODE_BASE_URL doit utiliser HTTP ou HTTPS.",
    );
  }

  const directory = cleanOptionalString(options.directory ?? process.env.OPENCODE_DIRECTORY) ?? process.cwd();
  const timeoutMs = parseInteger(
    options.timeoutMs ?? process.env.OPENCODE_TIMEOUT_MS,
    DEFAULT_TIMEOUT_MS,
    100,
    MAX_TIMEOUT_MS,
    "Le délai OpenCode",
  );
  const structuredOutputRetries = parseInteger(
    options.structuredOutputRetries ?? process.env.OPENCODE_STRUCTURED_OUTPUT_RETRIES,
    DEFAULT_STRUCTURED_OUTPUT_RETRIES,
    0,
    MAX_STRUCTURED_OUTPUT_RETRIES,
    "Le nombre de tentatives de sortie structurée",
  );

  return {
    baseUrl: parsedUrl.toString().replace(/\/$/, ""),
    directory,
    workspace: cleanOptionalString(options.workspace ?? process.env.OPENCODE_WORKSPACE),
    username: cleanOptionalString(options.username ?? process.env.OPENCODE_SERVER_USERNAME) ?? "opencode",
    password: cleanOptionalString(options.password ?? process.env.OPENCODE_SERVER_PASSWORD),
    agent: cleanOptionalString(options.agent ?? process.env.OPENCODE_AGENT) ?? DEFAULT_AGENT,
    model: parseModel(
      options.model,
      process.env.OPENCODE_PROVIDER_ID ?? process.env.OPENCODE_PROVIDER,
      process.env.OPENCODE_MODEL_ID ?? process.env.OPENCODE_MODEL,
      process.env.OPENCODE_MODEL_VARIANT,
    ),
    system: cleanOptionalString(options.system),
    allowedTools: parseAllowedTools(options.allowedTools ?? process.env.OPENCODE_OPS_TOOLS),
    timeoutMs,
    structuredOutputRetries,
  };
}

function createClient(options: ResolvedOpenCodeAdapterOptions) {
  const headers = options.password
    ? { Authorization: `Basic ${Buffer.from(`${options.username}:${options.password}`).toString("base64")}` }
    : undefined;

  return createOpencodeClient({
    baseUrl: options.baseUrl,
    directory: options.directory,
    experimental_workspaceID: options.workspace,
    headers,
  });
}

function createAbortScope(parent: AbortSignal | undefined, timeoutMs: number): AbortScope {
  const controller = new AbortController();
  let didTimeOut = false;
  const abortFromParent = () => controller.abort(parent?.reason);

  if (parent?.aborted) {
    abortFromParent();
  } else {
    parent?.addEventListener("abort", abortFromParent, { once: true });
  }

  const timeout = setTimeout(() => {
    didTimeOut = true;
    controller.abort(new Error(`OpenCode timeout after ${timeoutMs} ms`));
  }, timeoutMs);

  return {
    signal: controller.signal,
    timedOut: () => didTimeOut,
    parentAborted: () => Boolean(parent?.aborted),
    cleanup: () => {
      clearTimeout(timeout);
      parent?.removeEventListener("abort", abortFromParent);
    },
  };
}

function sessionPermissions(allowedTools: readonly string[]): PermissionRuleset {
  return [
    { permission: "*", pattern: "*", action: "deny" },
    ...allowedTools.map((permission) => ({ permission, pattern: "*", action: "allow" as const })),
  ];
}

function permissionRulesMatch(actual: PermissionRuleset | undefined, expected: PermissionRuleset) {
  if (!actual || actual.length !== expected.length) return false;
  return actual.every((rule, index) => {
    const expectedRule = expected[index];
    return rule.permission === expectedRule.permission
      && rule.pattern === expectedRule.pattern
      && rule.action === expectedRule.action;
  });
}

function promptToolRules(allowedTools: readonly string[]) {
  return Object.fromEntries([
    ["*", false],
    ...OPENCODE_BUILTIN_TOOLS.map((tool) => [tool, false] as const),
    ...allowedTools.map((tool) => [tool, true] as const),
  ]);
}

function statusFromError(error: unknown) {
  if (!error || typeof error !== "object") return undefined;
  const record = error as Record<string, unknown>;
  if (typeof record.status === "number") return record.status;
  if (record.response instanceof Response) return record.response.status;
  if (record.cause && typeof record.cause === "object") {
    const cause = record.cause as Record<string, unknown>;
    if (typeof cause.status === "number") return cause.status;
    if (cause.response instanceof Response) return cause.response.status;
  }
  return undefined;
}

function errorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  if (!error || typeof error !== "object") return "";
  const record = error as Record<string, unknown>;
  if (typeof record.message === "string") return record.message;
  if (record.data && typeof record.data === "object") {
    const data = record.data as Record<string, unknown>;
    if (typeof data.message === "string") return data.message;
  }
  return "";
}

function normalizeRequestError(operation: string, error: unknown, scope: AbortScope) {
  if (scope.timedOut()) {
    return new OpenCodeAdapterError(
      "opencode_timeout",
      `OpenCode n’a pas terminé ${operation} dans le délai imparti.`,
      { cause: error },
    );
  }
  if (scope.parentAborted()) {
    return new OpenCodeAdapterError(
      "opencode_aborted",
      `La requête OpenCode a été annulée pendant ${operation}.`,
      { cause: error },
    );
  }
  if (error instanceof OpenCodeAdapterError) return error;

  const status = statusFromError(error);
  const notFound = status === 404;
  const detail = errorMessage(error);
  return new OpenCodeAdapterError(
    notFound ? "opencode_session_not_found" : "opencode_request_failed",
    notFound
      ? "La session OpenCode demandée n’existe pas ou n’est plus accessible."
      : `La requête OpenCode a échoué pendant ${operation}${detail ? ` : ${detail}` : "."}`,
    { cause: error, status },
  );
}

function assistantErrorMessage(error: unknown) {
  if (!error || typeof error !== "object") return "Erreur assistant inconnue.";
  const record = error as Record<string, unknown>;
  const name = typeof record.name === "string" ? record.name : "AssistantError";
  const detail = errorMessage(error);
  return detail ? `${name} : ${detail}` : name;
}

function extractText(parts: readonly Part[]) {
  return parts
    .filter((part) => part.type === "text" && !part.ignored && part.text.trim().length > 0)
    .map((part) => part.type === "text" ? part.text.trim() : "")
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

export class OpenCodeAdapter {
  private readonly client: OpencodeClient;
  private readonly options: ResolvedOpenCodeAdapterOptions;
  private readonly permissions: PermissionRuleset;
  private readonly tools: Record<string, boolean>;
  private readonly finalizationTools: Record<string, boolean>;

  constructor(options: OpenCodeAdapterOptions = {}) {
    this.options = resolveOptions(options);
    this.client = createClient(this.options);
    this.permissions = sessionPermissions(this.options.allowedTools);
    this.tools = promptToolRules(this.options.allowedTools);
    this.finalizationTools = Object.fromEntries(
      Object.keys(this.tools).map((tool) => [tool, false]),
    );
  }

  private location() {
    return {
      directory: this.options.directory,
      workspace: this.options.workspace,
    };
  }

  private async createSessionWithSignal(
    options: Pick<OpenCodeSessionOptions, "title" | "metadata">,
    signal: AbortSignal,
  ) {
    const response = await this.client.session.create<true>({
      ...this.location(),
      title: cleanOptionalString(options.title) ?? "Conversation OPS",
      agent: this.options.agent,
      model: this.options.model
        ? {
            id: this.options.model.modelID,
            providerID: this.options.model.providerID,
            variant: this.options.model.variant,
          }
        : undefined,
      metadata: options.metadata,
      permission: this.permissions,
    }, { signal, throwOnError: true });
    return response.data;
  }

  private async getSessionWithSignal(sessionId: string, signal: AbortSignal) {
    const response = await this.client.session.get<true>({
      sessionID: sessionId,
      ...this.location(),
    }, { signal, throwOnError: true });
    return response.data;
  }

  private async enforceSessionPermissions(session: Session, signal: AbortSignal) {
    if (permissionRulesMatch(session.permission, this.permissions)) return session;
    const response = await this.client.session.update<true>({
      sessionID: session.id,
      ...this.location(),
      permission: this.permissions,
    }, { signal, throwOnError: true });
    return response.data;
  }

  private async ensureSessionWithSignal(options: OpenCodeSessionOptions, signal: AbortSignal): Promise<OpenCodeSessionHandle> {
    const sessionId = cleanOptionalString(options.sessionId);
    if (!sessionId) {
      return {
        session: await this.createSessionWithSignal(options, signal),
        created: true,
      };
    }

    const session = await this.getSessionWithSignal(sessionId, signal);
    return {
      session: await this.enforceSessionPermissions(session, signal),
      created: false,
    };
  }

  async createSession(options: Omit<OpenCodeSessionOptions, "sessionId"> = {}) {
    const timeoutMs = parseInteger(
      options.timeoutMs,
      this.options.timeoutMs,
      100,
      MAX_TIMEOUT_MS,
      "Le délai OpenCode",
    );
    const scope = createAbortScope(options.signal, timeoutMs);
    try {
      return await this.createSessionWithSignal(options, scope.signal);
    } catch (error) {
      throw normalizeRequestError("la création de la session", error, scope);
    } finally {
      scope.cleanup();
    }
  }

  async getSession(sessionId: string, options: Pick<OpenCodeSessionOptions, "signal" | "timeoutMs"> = {}) {
    const cleanedSessionId = cleanOptionalString(sessionId);
    if (!cleanedSessionId) {
      throw new OpenCodeAdapterError(
        "opencode_configuration_error",
        "Un sessionId OpenCode non vide est obligatoire.",
      );
    }
    const timeoutMs = parseInteger(
      options.timeoutMs,
      this.options.timeoutMs,
      100,
      MAX_TIMEOUT_MS,
      "Le délai OpenCode",
    );
    const scope = createAbortScope(options.signal, timeoutMs);
    try {
      return await this.getSessionWithSignal(cleanedSessionId, scope.signal);
    } catch (error) {
      throw normalizeRequestError("la lecture de la session", error, scope);
    } finally {
      scope.cleanup();
    }
  }

  /**
   * Reuses an existing durable OpenCode session when `sessionId` is supplied.
   * The caller is responsible for persisting the returned session ID.
   */
  async ensureSession(options: OpenCodeSessionOptions = {}): Promise<OpenCodeSessionHandle> {
    const timeoutMs = parseInteger(
      options.timeoutMs,
      this.options.timeoutMs,
      100,
      MAX_TIMEOUT_MS,
      "Le délai OpenCode",
    );
    const scope = createAbortScope(options.signal, timeoutMs);
    try {
      return await this.ensureSessionWithSignal(options, scope.signal);
    } catch (error) {
      throw normalizeRequestError("la reprise de la session", error, scope);
    } finally {
      scope.cleanup();
    }
  }

  async abortSession(
    sessionId: string,
    options: Pick<OpenCodeSessionOptions, "signal" | "timeoutMs"> = {},
  ) {
    const cleanedSessionId = cleanOptionalString(sessionId);
    if (!cleanedSessionId) return false;
    const timeoutMs = parseInteger(
      options.timeoutMs,
      this.options.timeoutMs,
      100,
      MAX_TIMEOUT_MS,
      "Le délai OpenCode",
    );
    const scope = createAbortScope(options.signal, timeoutMs);
    try {
      const response = await this.client.session.abort<true>({
        sessionID: cleanedSessionId,
        ...this.location(),
      }, { signal: scope.signal, throwOnError: true });
      return response.data;
    } catch (error) {
      throw normalizeRequestError("l’arrêt de la session", error, scope);
    } finally {
      scope.cleanup();
    }
  }

  private async bestEffortAbort(sessionId: string) {
    const scope = createAbortScope(undefined, SESSION_ABORT_TIMEOUT_MS);
    try {
      await this.client.session.abort<true>({
        sessionID: sessionId,
        ...this.location(),
      }, { signal: scope.signal, throwOnError: true });
    } catch {
      // The original timeout/abort remains the useful error for the caller.
    } finally {
      scope.cleanup();
    }
  }

  private async subscribeToAnswerDeltas(
    sessionId: string,
    signal: AbortSignal,
    onAnswerDelta: ((delta: string) => void) | undefined,
  ) {
    if (!onAnswerDelta) return null;

    const controller = new AbortController();
    const abort = () => controller.abort(signal.reason);
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });

    try {
      const subscription = await this.client.event.subscribe(
        this.location(),
        { signal: controller.signal },
      );
      const parser = new StreamingJsonStringField("answer");
      const finished = (async () => {
        try {
          for await (const event of subscription.stream) {
            if (
              event.type !== "message.part.delta"
              || event.properties.sessionID !== sessionId
              || event.properties.field !== "text"
            ) {
              continue;
            }
            const delta = parser.push(event.properties.delta);
            if (delta) onAnswerDelta(delta);
          }
        } catch (error) {
          if (!controller.signal.aborted) throw error;
        }
      })();

      return {
        stop: async () => {
          controller.abort();
          signal.removeEventListener("abort", abort);
          await finished.catch(() => undefined);
        },
      };
    } catch {
      signal.removeEventListener("abort", abort);
      return null;
    }
  }

  async runStructured<TSchema extends z.ZodType>(
    prompt: OpenCodeStructuredPrompt<TSchema>,
  ): Promise<OpenCodeStructuredResult<TSchema>> {
    const message = prompt.message.trim();
    if (!message) {
      throw new OpenCodeAdapterError(
        "opencode_configuration_error",
        "Le message OpenCode ne peut pas être vide.",
      );
    }

    const timeoutMs = parseInteger(
      prompt.timeoutMs,
      this.options.timeoutMs,
      100,
      MAX_TIMEOUT_MS,
      "Le délai OpenCode",
    );
    const scope = createAbortScope(prompt.signal, timeoutMs);
    let activeSessionId = cleanOptionalString(prompt.sessionId);

    try {
      const handle = prompt.sessionHandle ?? await this.ensureSessionWithSignal({
        sessionId: activeSessionId,
        title: prompt.sessionTitle,
        metadata: prompt.sessionMetadata,
      }, scope.signal);
      activeSessionId = handle.session.id;

      const model = prompt.model ?? this.options.model;
      const agent = cleanOptionalString(prompt.agent) ?? this.options.agent;
      const system = cleanOptionalString(prompt.system) ?? this.options.system;

      const outputSchema = z.toJSONSchema(prompt.schema, {
        target: "draft-07",
        io: "output",
      });
      const finalRequest = prompt.researchWithTools === false
        ? `${message}

RÉPONSE DIRECTE
- Réponds naturellement à cette demande sans effectuer de recherche.
- Produis immédiatement la sortie structurée demandée.`
        : `${message}

RECHERCHE ET RÉPONSE EN UNE SEULE PASSE
- Utilise les outils OPS uniquement pour établir les faits nécessaires.
- Un résultat de recherche contient déjà les faits complets utiles : ne relis pas chaque identifiant.
- Ne lance jamais deux fois la même requête ou le même identifiant.
- Maximum deux tours de recherche et quatre appels d’outils.
- Dès que les preuves suffisent, produis directement la sortie structurée finale.`;

      const liveDeltas = await this.subscribeToAnswerDeltas(
        handle.session.id,
        scope.signal,
        prompt.onAnswerDelta,
      );
      let response;
      try {
        response = await this.client.session.prompt<true>({
          sessionID: handle.session.id,
          ...this.location(),
          agent,
          model: model ? { providerID: model.providerID, modelID: model.modelID } : undefined,
          variant: model?.variant,
          tools: prompt.researchWithTools === false ? this.finalizationTools : this.tools,
          format: {
            type: "json_schema",
            schema: outputSchema,
            retryCount: this.options.structuredOutputRetries,
          },
          system,
          parts: [{
            type: "text",
            text: finalRequest,
          }],
        }, { signal: scope.signal, throwOnError: true });
      } finally {
        await liveDeltas?.stop();
      }

      const assistant = response.data.info;
      const text = extractText(response.data.parts);
      let data!: z.output<TSchema>;
      let hasValidData = false;
      let validationError: unknown;
      try {
        data = validateOpenCodeStructuredOutput(
          prompt.schema,
          assistant.structured,
          text,
        );
        hasValidData = true;
      } catch (error) {
        validationError = error instanceof OpenCodeOutputValidationError
          ? new OpenCodeStructuredOutputError(
              error.message,
              error.issues,
              error.outputPreview,
            )
          : error;
      }

      if (!hasValidData && assistant.error) {
        throw new OpenCodeAdapterError(
          "opencode_assistant_error",
          `L’assistant OpenCode a interrompu sa réponse : ${assistantErrorMessage(assistant.error)}`,
          { cause: assistant.error },
        );
      }

      if (!hasValidData) throw validationError;
      return {
        sessionId: handle.session.id,
        sessionCreated: handle.created,
        assistantMessageId: assistant.id,
        text: text || JSON.stringify(data),
        data,
      };
    } catch (error) {
      if ((scope.timedOut() || scope.parentAborted()) && activeSessionId) {
        await this.bestEffortAbort(activeSessionId);
      }
      throw normalizeRequestError("la génération structurée", error, scope);
    } finally {
      scope.cleanup();
    }
  }
}

export function createOpenCodeAdapter(options: OpenCodeAdapterOptions = {}) {
  return new OpenCodeAdapter(options);
}

export async function runOpenCodeStructured<TSchema extends z.ZodType>(
  prompt: OpenCodeStructuredPrompt<TSchema>,
  options: OpenCodeAdapterOptions = {},
) {
  return createOpenCodeAdapter(options).runStructured(prompt);
}
