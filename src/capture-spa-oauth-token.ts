import defaultOpen from "@rdsq/open";
import { CaptureSpaOAuthTokenError } from "./errors.ts";
import type {
  CaptureSpaOAuthTokenOptions,
  CaptureSpaOAuthTokenValidatedOptions,
  OAuthParameterMap,
} from "./spa-oauth-options.ts";
import { startSpaOAuthServer } from "./spa-oauth-server.ts";
import {
  isLoopbackHostname,
  normalHostname,
  validatePath,
} from "./validation.ts";

const authorizationReserved = new Set([
  "client_id",
  "redirect_uri",
  "response_type",
  "response_mode",
  "scope",
  "state",
  "code_challenge",
  "code_challenge_method",
  "code",
  "code_verifier",
  "client_secret",
  "client_assertion",
  "client_assertion_type",
]);
const tokenReserved = new Set([
  "client_id",
  "redirect_uri",
  "grant_type",
  "scope",
  "code",
  "code_verifier",
  "client_secret",
  "client_assertion",
  "client_assertion_type",
]);
const defaultInstructions =
  "<h1>Done.</h1><p>You can close this tab and return to the program.</p>";

function endpoint(value: string | URL, name: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new CaptureSpaOAuthTokenError(
      "INVALID_CONFIGURATION",
      `${name} must be an absolute HTTPS URL without a query or fragment`,
    );
  }
  if (
    parsed.protocol !== "https:" || parsed.username || parsed.password ||
    parsed.search || parsed.hash
  ) {
    throw new CaptureSpaOAuthTokenError(
      "INVALID_CONFIGURATION",
      `${name} must be an absolute HTTPS URL without a query or fragment`,
    );
  }
  return parsed;
}
function parameters(
  value: OAuthParameterMap | undefined,
  reserved: Set<string>,
  name: string,
): OAuthParameterMap {
  for (const [key, item] of Object.entries(value ?? {})) {
    if (!key || reserved.has(key.toLowerCase()) || typeof item !== "string") {
      throw new CaptureSpaOAuthTokenError(
        "INVALID_CONFIGURATION",
        `${name} contains a reserved or invalid parameter`,
      );
    }
  }
  return value ?? {};
}
function positive(value: number, name: string): number {
  if (
    !Number.isInteger(value) || value < 1 || (name === "port" && value > 65535)
  ) {
    throw new CaptureSpaOAuthTokenError(
      "INVALID_CONFIGURATION",
      `${name} must be a positive integer`,
    );
  }
  return value;
}

/** Opens a local SPA page and redeems an OAuth authorization-code PKCE response in the browser. */
export function captureSpaOAuthToken<T>(
  options: CaptureSpaOAuthTokenValidatedOptions<T>,
): Promise<T>;
export function captureSpaOAuthToken(
  options: CaptureSpaOAuthTokenOptions,
): Promise<Record<string, unknown>>;
export async function captureSpaOAuthToken<T = Record<string, unknown>>(
  options:
    | CaptureSpaOAuthTokenOptions
    | CaptureSpaOAuthTokenValidatedOptions<T>,
): Promise<T> {
  const authorizationEndpoint = endpoint(
    options.authorizationEndpoint,
    "authorizationEndpoint",
  );
  const tokenEndpoint = endpoint(options.tokenEndpoint, "tokenEndpoint");
  let redirect: URL;
  try {
    redirect = new URL(options.redirectUri);
  } catch {
    throw new CaptureSpaOAuthTokenError(
      "INVALID_CONFIGURATION",
      "redirectUri must be an HTTP loopback URL",
    );
  }
  if (
    redirect.protocol !== "http:" || !isLoopbackHostname(redirect.hostname) ||
    redirect.username || redirect.password || redirect.hash || redirect.search
  ) {
    throw new CaptureSpaOAuthTokenError(
      "INVALID_CONFIGURATION",
      "redirectUri must be an HTTP loopback URL without query or fragment",
    );
  }
  if (
    typeof options.clientId !== "string" || !options.clientId ||
    !Array.isArray(options.scopes) ||
    options.scopes.length === 0 ||
    options.scopes.some((scope) =>
      typeof scope !== "string" || !scope || /\s/.test(scope)
    )
  ) {
    throw new CaptureSpaOAuthTokenError(
      "INVALID_CONFIGURATION",
      "clientId and non-empty scopes are required",
    );
  }
  const hostname = options.hostname ?? "localhost";
  const port = options.port ?? (redirect.port ? Number(redirect.port) : 80);
  const callbackPath = options.callbackPath ?? redirect.pathname;
  const startPath = options.startPath ?? "/oauth-start";
  const submissionPath = options.submissionPath ?? "/oauth-submit";
  try {
    validatePath(callbackPath, "callbackPath");
    validatePath(startPath, "startPath");
    validatePath(submissionPath, "submissionPath");
  } catch (error) {
    throw new CaptureSpaOAuthTokenError(
      "INVALID_CONFIGURATION",
      "OAuth broker paths must be absolute local pathnames",
      { cause: error },
    );
  }
  if (
    new Set([callbackPath, startPath, submissionPath]).size !== 3 ||
    normalHostname(hostname) !== normalHostname(redirect.hostname) ||
    port !== (redirect.port ? Number(redirect.port) : 80) ||
    callbackPath !== redirect.pathname
  ) {
    throw new CaptureSpaOAuthTokenError(
      "REDIRECT_MISMATCH",
      "Listener hostname, port, and callbackPath must match redirectUri",
    );
  }
  positive(port, "port");
  const timeout = positive(
    options.totalTimeoutMillis ?? 600_000,
    "totalTimeoutMillis",
  );
  const maxRequestBodyBytes = positive(
    options.maxRequestBodyBytes ?? 1024 * 1024,
    "maxRequestBodyBytes",
  );
  const customValidator = "tokenResponseValidator" in options
    ? options.tokenResponseValidator
    : undefined;
  const validator: (response: unknown) => T | Promise<T> = customValidator ??
    ((value: unknown) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new TypeError("Token response must be a JSON object");
      }
      if ("error" in value) {
        throw new TypeError("Token response is an OAuth error");
      }
      return value as T;
    });
  let flow;
  try {
    flow = startSpaOAuthServer({
      hostname: normalHostname(hostname),
      port,
      callbackPath,
      startPath,
      submissionPath,
      authorizationEndpoint: authorizationEndpoint.toString(),
      tokenEndpoint: tokenEndpoint.toString(),
      clientId: options.clientId,
      redirectUri: redirect.toString(),
      scopes: options.scopes,
      authorizationParameters: parameters(
        options.authorizationParameters,
        authorizationReserved,
        "authorizationParameters",
      ),
      tokenParameters: parameters(
        options.tokenParameters,
        tokenReserved,
        "tokenParameters",
      ),
      maxRequestBodyBytes,
      totalTimeoutMillis: timeout,
      returnInstructions: options.returnInstructions ?? defaultInstructions,
      randomBytes: options.randomBytes ??
        ((length) => crypto.getRandomValues(new Uint8Array(length))),
      createServer: options.createServer ?? Deno.serve,
      tokenResponseValidator: validator,
    });
  } catch (error) {
    if (error instanceof CaptureSpaOAuthTokenError) throw error;
    throw new CaptureSpaOAuthTokenError(
      "INTERNAL",
      "Could not create OAuth callback server",
      { cause: error },
    );
  }
  const openPromise = (async () => {
    try {
      await (options.open ?? defaultOpen)(flow.startUrl);
    } catch (error) {
      const failure = new CaptureSpaOAuthTokenError(
        "BROWSER_OPEN_FAILED",
        "Could not open local authorization page",
        { cause: error },
      );
      flow.fail(failure);
      await flow.resultPromise.catch(() => undefined);
      throw failure;
    }
  })();
  await Promise.race([openPromise, flow.resultPromise]);
  return await flow.resultPromise;
}
