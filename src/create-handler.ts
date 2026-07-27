import { CaptureAuthUrlError } from "./errors.ts";
import { handleFirstRequest } from "./handle-first-request.ts";
import { readBoundedBody } from "./handle-url-submission.ts";
import type { StartServerOptions } from "./options.ts";
import { listenerUrl } from "./validation.ts";

const sessionHeader = "X-Capture-Auth-Session";
export function createHandler(
  options: StartServerOptions,
  sessionId: string,
  nonce: string,
  settle: (url: URL) => void,
  fail: (error: Error) => void,
): (request: Request) => Promise<Response> {
  const listener = listenerUrl(options.hostname, options.port);
  const listenerOrigin = listener.origin;
  const expectedHost = listener.host;
  let state: "pending" | "reading" | "captured" = "pending";
  const commonHeaders: Record<string, string> = {
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  };
  const corsHeaders = (origin: string): Record<string, string> =>
    options.cors === origin
      ? {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "POST",
        "Access-Control-Allow-Headers": `Content-Type, ${sessionHeader}`,
        "Vary": "Origin",
      }
      : {};
  const invalid = (status: number, message: string, origin?: string | null) =>
    new Response(message, {
      status,
      headers: {
        ...commonHeaders,
        ...(origin ? corsHeaders(origin) : {}),
      },
    });
  const validHost = (value: string | null): boolean => {
    if (value === null) return false;
    try {
      const parsed = new URL(`http://${value}`);
      return !parsed.username && !parsed.password && parsed.pathname === "/" &&
        !parsed.search && !parsed.hash && parsed.host === expectedHost;
    } catch {
      return false;
    }
  };
  return async (request) => {
    try {
      const target = new URL(request.url);
      if (
        target.origin !== listenerOrigin ||
        !validHost(request.headers.get("host"))
      ) return invalid(400, "Invalid Host");
      const origin = request.headers.get("origin");
      const allowedOrigin = origin === listenerOrigin ||
        origin === options.cors;
      if (target.pathname === options.callbackPath) {
        if (request.method !== "GET") {
          return invalid(405, "Method Not Allowed", origin);
        }
        if (origin !== null && !allowedOrigin) {
          return invalid(403, "Invalid Origin", origin);
        }
        return handleFirstRequest(
          options.capturePath,
          sessionId,
          nonce,
          options.htmlLang,
          options.htmlTitle,
        );
      }
      if (target.pathname !== options.capturePath) {
        return invalid(404, "Not Found", origin);
      }
      if (target.search) return invalid(404, "Not Found", origin);
      if (request.method === "OPTIONS") {
        return typeof options.cors === "string" && origin === options.cors
          ? new Response(null, {
            headers: { ...commonHeaders, ...corsHeaders(origin) },
          })
          : invalid(403, "CORS is not allowed", origin);
      }
      if (request.method !== "POST") {
        return invalid(405, "Method Not Allowed", origin);
      }
      if (!allowedOrigin) return invalid(403, "Invalid Origin", origin);
      const type = request.headers.get("content-type")?.split(";", 1)[0].trim()
        .toLowerCase();
      if (type !== "text/plain") {
        return invalid(415, "Unsupported Media Type", origin);
      }
      if (request.headers.get(sessionHeader) !== sessionId) {
        return invalid(403, "Invalid session", origin);
      }
      if (state !== "pending") {
        return invalid(409, "Capture already submitted", origin);
      }
      state = "reading";
      let body: string;
      try {
        body = await readBoundedBody(request, options.maxRequestBodyBytes);
      } catch (error) {
        state = "pending";
        return error instanceof CaptureAuthUrlError &&
            error.code === "BODY_TOO_LARGE"
          ? invalid(413, "Payload Too Large", origin)
          : invalid(400, "Invalid request body", origin);
      }
      let url: URL;
      try {
        url = new URL(body);
      } catch {
        state = "pending";
        return invalid(400, "Invalid URL", origin);
      }
      if (
        url.origin !== listenerOrigin || url.username || url.password ||
        url.pathname !== options.callbackPath
      ) {
        state = "pending";
        return invalid(400, "Invalid captured URL", origin);
      }
      const response = options.returnInstructions instanceof Response
        ? options.returnInstructions
        : new Response(options.returnInstructions, {
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      const headers = new Headers(response.headers);
      for (const [key, value] of Object.entries(commonHeaders)) {
        headers.set(key, value);
      }
      for (const [key, value] of Object.entries(corsHeaders(origin!))) {
        headers.set(key, value);
      }
      const outgoingResponse = new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
      state = "captured";
      settle(url);
      return outgoingResponse;
    } catch (error) {
      fail(
        new CaptureAuthUrlError("INTERNAL", "Callback handler failed", {
          cause: error,
        }),
      );
      return invalid(500, "Internal Server Error");
    }
  };
}
