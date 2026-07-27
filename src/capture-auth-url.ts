import defaultOpen from "@rdsq/open";
import { CaptureAuthUrlError } from "./errors.ts";
import type { CaptureAuthUrlOptions } from "./options.ts";
import { startServer } from "./start-server.ts";
import {
  normalHostname,
  redirectTarget,
  validateCors,
  validatePath,
} from "./validation.ts";

const instructions =
  "<h1>Done.</h1><h2>Please close this tab/window and return to the program.</h2>";

/** Opens `loginUrl`, captures its required loopback `redirect_uri`, then returns its full URL. */
export async function captureAuthUrl(
  loginUrl: string | URL,
  options: CaptureAuthUrlOptions = {},
): Promise<URL> {
  const redirect = redirectTarget(loginUrl);
  const hostname = options.hostname ?? "localhost";
  const port = options.port ?? redirect.port;
  const callbackPath = options.callbackPath ?? redirect.callbackPath;
  const capturePath = options.capturePath ?? "/capture-url";
  validatePath(callbackPath, "callbackPath");
  validatePath(capturePath, "capturePath");
  if (
    normalHostname(hostname) !== redirect.hostname || port !== redirect.port ||
    callbackPath !== redirect.callbackPath
  ) {
    throw new CaptureAuthUrlError(
      "REDIRECT_MISMATCH",
      "Listener hostname, port, and callbackPath must match redirect_uri",
    );
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new CaptureAuthUrlError(
      "REDIRECT_MISMATCH",
      "redirect_uri port is invalid",
    );
  }
  if (
    !Number.isInteger(options.maxRequestBodyBytes ?? 16 * 1024) ||
    (options.maxRequestBodyBytes ?? 16 * 1024) < 1
  ) throw new TypeError("maxRequestBodyBytes must be a positive integer");
  if (
    !Number.isFinite(options.totalTimeoutMillis ?? 600_000) ||
    (options.totalTimeoutMillis ?? 600_000) < 1
  ) throw new TypeError("totalTimeoutMillis must be positive");
  const cors = validateCors(options.cors ?? false);
  const randomBytes = options.randomBytes ??
    ((length: number) => crypto.getRandomValues(new Uint8Array(length)));
  let flow: ReturnType<typeof startServer>;
  try {
    flow = startServer({
      hostname: normalHostname(hostname),
      port,
      callbackPath,
      capturePath,
      cors,
      maxRequestBodyBytes: options.maxRequestBodyBytes ?? 16 * 1024,
      totalTimeoutMillis: options.totalTimeoutMillis ?? 600_000,
      returnInstructions: options.returnInstructions ?? instructions,
      htmlLang: options.htmlLang ?? "en",
      htmlTitle: options.htmlTitle ?? "Authentication",
      randomBytes,
      createServer: options.createServer ?? Deno.serve,
    });
  } catch (error) {
    throw new CaptureAuthUrlError(
      "INTERNAL",
      "Could not create callback server",
      { cause: error },
    );
  }
  const openPromise = (async () => {
    try {
      await (options.open ?? defaultOpen)(String(loginUrl));
    } catch (error) {
      const openError = new CaptureAuthUrlError(
        "BROWSER_OPEN_FAILED",
        "Could not open login URL",
        { cause: error },
      );
      flow.fail(openError);
      await flow.urlPromise.catch(() => undefined);
      throw openError;
    }
  })();
  await Promise.race([openPromise, flow.urlPromise]);
  return await flow.urlPromise;
}
