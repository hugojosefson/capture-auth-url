import { CaptureAuthUrlError } from "./errors.ts";

export interface RedirectTarget {
  hostname: string;
  port: number;
  callbackPath: string;
  origin: string;
}

export function listenerUrl(hostname: string, port: number): URL {
  const url = new URL("http://localhost");
  const host = hostname.startsWith("[") ? hostname.slice(1, -1) : hostname;
  url.hostname = host.includes(":") ? `[${host}]` : host;
  url.port = String(port);
  return url;
}
export function normalHostname(hostname: string): string {
  return hostname.replace(/^\[|\]$/g, "").toLowerCase();
}
export function isLoopbackHostname(hostname: string): boolean {
  const host = normalHostname(hostname);
  return host === "localhost" || host === "::1" ||
    /^127(?:\.\d{1,3}){3}$/.test(host) &&
      host.split(".").every((part) => Number(part) <= 255);
}
export function redirectTarget(loginUrl: string | URL): RedirectTarget {
  let login: URL;
  try {
    login = new URL(loginUrl);
  } catch {
    throw new CaptureAuthUrlError(
      "INVALID_LOGIN_URL",
      "loginUrl must be an absolute URL",
    );
  }
  const value = login.searchParams.get("redirect_uri");
  if (!value) {
    throw new CaptureAuthUrlError(
      "INVALID_REDIRECT_URI",
      "loginUrl must contain redirect_uri",
    );
  }
  let redirect: URL;
  try {
    redirect = new URL(value);
  } catch {
    throw new CaptureAuthUrlError(
      "INVALID_REDIRECT_URI",
      "redirect_uri must be an absolute URL",
    );
  }
  if (
    redirect.protocol !== "http:" || !isLoopbackHostname(redirect.hostname) ||
    redirect.username || redirect.password || redirect.hash
  ) {
    throw new CaptureAuthUrlError(
      "INVALID_REDIRECT_URI",
      "redirect_uri must be an HTTP loopback URL without a fragment",
    );
  }
  const port = redirect.port ? Number(redirect.port) : 80;
  return {
    hostname: normalHostname(redirect.hostname),
    port,
    callbackPath: redirect.pathname,
    origin: redirect.origin,
  };
}
export function validateCors(origin: false | string): false | string {
  if (origin === false) return false;
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    throw new TypeError("cors must be one HTTP(S) origin");
  }
  if (
    !/^https?:$/.test(url.protocol) || url.origin !== origin || url.username ||
    url.password || url.pathname !== "/" || url.search || url.hash
  ) throw new TypeError("cors must be one HTTP(S) origin");
  return origin;
}
export function validatePath(path: string, name: string): void {
  const parsed = new URL(path, "http://localhost");
  if (
    !path.startsWith("/") || parsed.pathname !== path || parsed.search ||
    parsed.hash
  ) {
    throw new TypeError(
      `${name} must be an absolute pathname without a query or fragment`,
    );
  }
}
