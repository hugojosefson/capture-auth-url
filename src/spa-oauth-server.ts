import { CaptureAuthUrlError, CaptureSpaOAuthTokenError } from "./errors.ts";
import { readBoundedBody } from "./handle-url-submission.ts";
import { runSpaOAuthBrowser } from "./spa-oauth-browser.ts";
import type { StartSpaOAuthServerOptions } from "./spa-oauth-options.ts";
import { listenerUrl, normalHostname } from "./validation.ts";

const sessionHeader = "X-Capture-Spa-OAuth-Session";
const failureInstructions =
  "<h1>Authentication failed.</h1><p>Return to the application.</p>";
const failureMessages = {
  STATE_MISMATCH: [
    "STATE_MISMATCH",
    "Authorization state could not be verified",
  ],
  OAUTH_CALLBACK_ERROR: ["OAUTH_CALLBACK_ERROR", "Authorization was declined"],
  TOKEN_EXCHANGE_FAILED: ["TOKEN_EXCHANGE_FAILED", "Token exchange failed"],
  BROWSER_ERROR: ["BROWSER_ERROR", "Browser authorization failed"],
} as const;
const scriptJson = (value: unknown) =>
  JSON.stringify(value).replace(
    /[<>&\u2028\u2029]/g,
    (character) =>
      `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );

export function startSpaOAuthServer<T>(options: StartSpaOAuthServerOptions<T>) {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  let server: Deno.HttpServer<Deno.NetAddr> | undefined;
  let settled = false;
  const controller = new AbortController();
  const resultPromise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  resultPromise.catch(() => undefined);
  const settle = async (error?: Error, value?: T, force = true) => {
    if (settled) return;
    settled = true;
    clearTimeout(timeout);
    if (force) {
      controller.abort();
      await server?.finished.catch(() => undefined);
    } else {
      try {
        await server?.shutdown();
      } catch (shutdownError) {
        reject(
          new CaptureSpaOAuthTokenError(
            "INTERNAL",
            "Could not shut down OAuth callback server",
            { cause: shutdownError },
          ),
        );
        return;
      }
    }
    if (error) reject(error);
    else resolve(value!);
  };
  const fail = (error: CaptureSpaOAuthTokenError) => {
    void settle(error);
  };
  const timeout = setTimeout(
    () =>
      fail(
        new CaptureSpaOAuthTokenError(
          "TIMEOUT",
          "OAuth authorization timed out",
        ),
      ),
    options.totalTimeoutMillis,
  );
  try {
    const random = options.randomBytes(48);
    if (!(random instanceof Uint8Array) || random.byteLength < 48) {
      throw new TypeError(
        "randomBytes must return at least the requested bytes",
      );
    }
    const hex = Array.from(random, (byte) => byte.toString(16).padStart(2, "0"))
      .join("");
    const sessionId = hex.slice(0, 64);
    const nonce = hex.slice(64, 96);
    const listener = listenerUrl(options.hostname, options.port);
    const tokenOrigin = new URL(options.tokenEndpoint).origin;
    const config = {
      sessionId,
      authorizationEndpoint: options.authorizationEndpoint,
      tokenEndpoint: options.tokenEndpoint,
      clientId: options.clientId,
      redirectUri: options.redirectUri,
      scopes: options.scopes,
      authorizationParameters: options.authorizationParameters,
      tokenParameters: options.tokenParameters,
      callbackPath: options.callbackPath,
      submissionPath: options.submissionPath,
      sessionHeader,
      expiresAt: Date.now() + options.totalTimeoutMillis,
      maxRequestBodyBytes: options.maxRequestBodyBytes,
    };
    const page =
      `<!doctype html><html><head><meta charset="utf-8"><title>Authentication</title></head><body><script nonce="${nonce}">(${runSpaOAuthBrowser.toString()})(window,${
        scriptJson(config)
      });</script></body></html>`;
    const headers = {
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    };
    const response = (status: number, body: string) =>
      new Response(body, { status, headers });
    const validHost = (value: string | null) => {
      if (!value) return false;
      try {
        const parsed = new URL(`http://${value}`);
        return normalHostname(parsed.hostname) ===
            normalHostname(options.hostname) &&
          Number(parsed.port || 80) === options.port && !parsed.username &&
          !parsed.password && parsed.pathname === "/" && !parsed.search &&
          !parsed.hash;
      } catch {
        return false;
      }
    };
    let submitting = false;
    const handler = async (request: Request): Promise<Response> => {
      try {
        const target = new URL(request.url);
        if (
          target.origin !== listener.origin ||
          !validHost(request.headers.get("host"))
        ) return response(400, "Invalid Host");
        if (
          target.pathname === options.startPath ||
          target.pathname === options.callbackPath
        ) {
          if (
            request.method !== "GET" ||
            (target.pathname === options.startPath && target.search)
          ) return response(405, "Method Not Allowed");
          return new Response(page, {
            headers: {
              ...headers,
              "Content-Type": "text/html; charset=utf-8",
              "Content-Security-Policy":
                `default-src 'none'; script-src 'nonce-${nonce}'; connect-src 'self' ${tokenOrigin}; base-uri 'none'; frame-ancestors 'none'`,
            },
          });
        }
        if (target.pathname !== options.submissionPath || target.search) {
          return response(404, "Not Found");
        }
        if (request.method !== "POST") {
          return response(405, "Method Not Allowed");
        }
        if (request.headers.get("origin") !== listener.origin) {
          return response(403, "Invalid Origin");
        }
        if (
          request.headers.get("content-type")?.split(";", 1)[0].trim()
            .toLowerCase() !== "application/json"
        ) return response(415, "Unsupported Media Type");
        if (request.headers.get(sessionHeader) !== sessionId) {
          return response(403, "Invalid session");
        }
        if (submitting || settled) {
          return response(409, "Submission already received");
        }
        submitting = true;
        let envelope: { ok?: unknown; token?: unknown; code?: unknown };
        try {
          envelope = JSON.parse(
            await readBoundedBody(request, options.maxRequestBodyBytes),
          );
        } catch (error) {
          submitting = false;
          return error instanceof CaptureAuthUrlError &&
              error.code === "BODY_TOO_LARGE"
            ? response(413, "Payload Too Large")
            : response(400, "Invalid submission");
        }
        if (
          !envelope || typeof envelope !== "object" ||
          typeof envelope.ok !== "boolean"
        ) {
          submitting = false;
          return response(400, "Invalid submission");
        }
        if (!envelope.ok) {
          const detail = typeof envelope.code === "string"
            ? failureMessages[envelope.code as keyof typeof failureMessages]
            : undefined;
          if (!detail) {
            submitting = false;
            return response(400, "Invalid submission");
          }
          setTimeout(
            () =>
              void settle(new CaptureSpaOAuthTokenError(detail[0], detail[1])),
            0,
          );
          return new Response(failureInstructions, {
            headers: { ...headers, "Content-Type": "text/html; charset=utf-8" },
          });
        }
        try {
          let rejectOnAbort!: () => void;
          const aborted = new Promise<never>((_resolve, rejectAbort) => {
            rejectOnAbort = () =>
              rejectAbort(new DOMException("Aborted", "AbortError"));
            controller.signal.addEventListener("abort", rejectOnAbort, {
              once: true,
            });
          });
          let token: T;
          try {
            token = await Promise.race([
              options.tokenResponseValidator(envelope.token),
              aborted,
            ]);
          } finally {
            controller.signal.removeEventListener("abort", rejectOnAbort);
          }
          setTimeout(() => void settle(undefined, token, false), 0);
          return new Response(options.returnInstructions, {
            headers: { ...headers, "Content-Type": "text/html; charset=utf-8" },
          });
        } catch (error) {
          setTimeout(
            () =>
              void settle(
                new CaptureSpaOAuthTokenError(
                  "TOKEN_VALIDATION_FAILED",
                  "Token response validation failed",
                  { cause: error },
                ),
              ),
            0,
          );
          return new Response(failureInstructions, {
            headers: { ...headers, "Content-Type": "text/html; charset=utf-8" },
          });
        }
      } catch (error) {
        fail(
          new CaptureSpaOAuthTokenError(
            "INTERNAL",
            "OAuth callback handler failed",
            { cause: error },
          ),
        );
        return response(500, "Internal Server Error");
      }
    };
    server = options.createServer({
      hostname: options.hostname,
      port: options.port,
      onListen: () => undefined,
      signal: controller.signal,
    }, handler);
    return {
      startUrl: new URL(options.startPath, listener).toString(),
      resultPromise,
      fail,
    };
  } catch (error) {
    fail(
      new CaptureSpaOAuthTokenError(
        "INTERNAL",
        "Could not create OAuth callback server",
        { cause: error },
      ),
    );
    throw error;
  }
}
