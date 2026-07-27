import defaultOpen from "@rdsq/open";
import { extractRedirectPort } from "./extract-redirect-port.ts";
import { startServer } from "./start-server.ts";
import type { CaptureAuthUrlOptions } from "./options.ts";

/**
 * - Opens a login URL in the user's browser.
 * - Waits for the user to authenticate, and be redirected back to `localhost`.
 * - Listens for any HTTP request on the relevant port on `localhost` for when the browser is redirected back.
 * - Captures the incoming request URL, and responds with an HTML page that has client-side JavaScript in it that picks up the whole [`window.location`](https://developer.mozilla.org/en-US/docs/Web/API/Location) (including `.hash`), and sends it in a request into the server too.
 * - Resolves the returned `Promise` to the full `URL` object, including the hash (fragment identifier).
 * @param loginUrl {string|URL} The login URL that the user should visit, that will redirect back to somewhere on `localhost` when finished`
 * @param port {number} Port number to expect the user to be redirected back to on `http://localhost`. If not specified, will try to extract it from the `loginUrl`'s `redirect_uri` query param. Throws if that's not possible.
 * @param totalTimeoutMillis {number} Max milliseconds to wait for the whole authentication to complete.
 * @param returnInstructions {string|Response} Instructions to display to the user after the full URL is captured. Can be a string or a `Response` object. Defaults to a simple HTML message.
 * @param htmlLang {string} The language attribute for the HTML document. Defaults to "en".
 * @param htmlTitle {string} The title of the HTML document. Defaults to "Authentication".
 * @param open {(loginUrl: string) => Promise<void>} Function to open the login URL in the user's browser. Defaults to `jsr:@rdsq/open`.
 * @return {URL} The full URL the user was redirected back to.
 */
export function captureAuthUrl(
  loginUrl: string | URL,
  port?: number,
  totalTimeoutMillis?: number,
  returnInstructions?: string | Response,
  htmlLang?: string,
  htmlTitle?: string,
  open?: (loginUrl: string) => Promise<void>,
): Promise<URL>;
export function captureAuthUrl(
  loginUrl: string | URL,
  options: CaptureAuthUrlOptions,
): Promise<URL>;
export async function captureAuthUrl(
  loginUrl: string | URL,
  portOrOptions: number | CaptureAuthUrlOptions = extractRedirectPort(loginUrl),
  totalTimeoutMillis: number = 10 * 60_000,
  returnInstructions: string | Response =
    "<h1>Done.</h1><h2>Please close this tab/window and return to the program.</h2>",
  htmlLang: string = "en",
  htmlTitle: string = "Authentication",
  open: (loginUrl: string) => Promise<void> = defaultOpen,
): Promise<URL> {
  const options: CaptureAuthUrlOptions = typeof portOrOptions === "number"
    ? {
      port: portOrOptions,
      totalTimeoutMillis,
      returnInstructions,
      htmlLang,
      htmlTitle,
      open,
    }
    : portOrOptions;
  const { server, urlPromise } = startServer({
    port: options.port ?? extractRedirectPort(loginUrl),
    hostname: options.hostname,
    callbackPath: options.callbackPath,
    capturePath: options.capturePath,
    cors: options.cors,
    totalTimeoutMillis: options.totalTimeoutMillis ?? 10 * 60_000,
    returnInstructions: options.returnInstructions ??
      "<h1>Done.</h1><h2>Please close this tab/window and return to the program.</h2>",
    htmlLang: options.htmlLang ?? "en",
    htmlTitle: options.htmlTitle ?? "Authentication",
  });
  await (options.open ?? defaultOpen)(`${loginUrl}`);
  const url = await urlPromise;
  await server.shutdown();
  return url;
}
