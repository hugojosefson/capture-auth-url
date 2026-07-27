import { createHandler } from "./create-handler.ts";
import type { StartServerOptions } from "./options.ts";

/**
 * Starts a server that listens for HTTP requests on the specified port.
 * Uses https://docs.deno.com/api/deno/~/Deno.serve to handle incoming requests.
 * Uses an `AbortController` to manage timeouts for the server.
 * Handles both the initial request, and the subsequent request that captures the full URL.
 * The first request is expected to be an HTTP GET request that will return an HTML page with client-side JavaScript to capture `window.location`, and to send it back to the server in a second request, whose response will be the `returnInstructions` and will be printed to the page.
 * The second request is expected to be an HTTP POST request that contains the full URL in the body, and will respond with the `returnInstructions` which the client-side JavaScript in the response to the first request will print to the page.
 *
 * @param port {number} The port number to listen on.
 * @param totalTimeoutMillis {number} The maximum time to wait for the server to respond before timing out.
 * @param returnInstructions {string} Instructions to display to the user after the full URL is captured.
 * @param htmlLang {string} The language attribute for the HTML document. Defaults to "en".
 * @param htmlTitle {string} The title of the HTML document. Defaults to "Authentication".
 * @return {Object} An object containing the server instance and a promise that resolves to the full URL captured from the request.
 */
export function startServer(
  port: number,
  totalTimeoutMillis: number,
  returnInstructions: string | Response,
  htmlLang: string,
  htmlTitle: string,
): { server: Deno.HttpServer<Deno.NetAddr>; urlPromise: Promise<URL> };
export function startServer(
  options: StartServerOptions,
): { server: Deno.HttpServer<Deno.NetAddr>; urlPromise: Promise<URL> };
export function startServer(
  portOrOptions: number | StartServerOptions,
  totalTimeoutMillis?: number,
  returnInstructions?: string | Response,
  htmlLang?: string,
  htmlTitle?: string,
): { server: Deno.HttpServer<Deno.NetAddr>; urlPromise: Promise<URL> } {
  const options: StartServerOptions = typeof portOrOptions === "number"
    ? {
      port: portOrOptions,
      totalTimeoutMillis: totalTimeoutMillis!,
      returnInstructions: returnInstructions!,
      htmlLang: htmlLang!,
      htmlTitle: htmlTitle!,
    }
    : portOrOptions;
  validatePath(options.callbackPath, "callbackPath");
  validatePath(options.capturePath, "capturePath");
  const controller = new AbortController();
  const totalTimeoutId = setTimeout(
    controller.abort.bind(controller),
    options.totalTimeoutMillis,
  );

  const { handler, urlPromise } = createHandler(
    options.returnInstructions,
    options.htmlLang,
    options.htmlTitle,
    options.callbackPath,
    options.capturePath,
    options.cors,
  );
  urlPromise.finally(() => clearTimeout(totalTimeoutId));

  const serveOptions = {
    port: options.port,
    ...(options.hostname === undefined ? {} : { hostname: options.hostname }),
    signal: controller.signal,
  };
  const server: Deno.HttpServer<Deno.NetAddr> = Deno.serve(
    serveOptions,
    handler,
  );
  return { server, urlPromise };
}

function validatePath(path: string | undefined, name: string): void {
  if (path === undefined) return;
  const url = new URL(path, "http://localhost");
  if (
    !path.startsWith("/") || url.pathname !== path || url.search || url.hash
  ) {
    throw new TypeError(
      `${name} must be an absolute pathname without a query or fragment`,
    );
  }
}
