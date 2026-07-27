import { createHandler } from "./create-handler.ts";
import { CaptureAuthUrlError } from "./errors.ts";
import type { StartServerOptions } from "./options.ts";

export function startServer(
  options: StartServerOptions,
): {
  server: Deno.HttpServer<Deno.NetAddr>;
  urlPromise: Promise<URL>;
  fail: (error: Error) => void;
} {
  let resolve!: (url: URL) => void;
  let reject!: (error: Error) => void;
  let settled = false;
  let server: Deno.HttpServer<Deno.NetAddr> | undefined;
  const controller = new AbortController();
  const urlPromise = new Promise<URL>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  // A rejection can occur before captureAuthUrl awaits it (for example, open fails).
  urlPromise.catch(() => undefined);
  const close = async (graceful: boolean): Promise<void> => {
    if (!server) return;
    if (graceful) {
      await server.shutdown();
      return;
    }
    controller.abort();
    await server.finished.catch(() => undefined);
  };
  const finish = (url: URL) => {
    if (!settled) {
      settled = true;
      clearTimeout(timeout);
      void close(true).then(
        () => resolve(url),
        (error) =>
          reject(
            new CaptureAuthUrlError(
              "INTERNAL",
              "Could not shut down callback server",
              { cause: error },
            ),
          ),
      );
    }
  };
  const fail = (error: Error) => {
    if (!settled) {
      settled = true;
      clearTimeout(timeout);
      void close(false).then(
        () => reject(error),
        () => reject(error),
      );
    }
  };
  const timeout = setTimeout(
    () =>
      fail(
        new CaptureAuthUrlError("TIMEOUT", "Authentication capture timed out"),
      ),
    options.totalTimeoutMillis,
  );
  try {
    const bytes = options.randomBytes(48);
    if (!(bytes instanceof Uint8Array) || bytes.byteLength < 48) {
      throw new TypeError(
        "randomBytes must return at least the requested bytes",
      );
    }
    const hex = Array.from(
      bytes,
      (byte) => byte.toString(16).padStart(2, "0"),
    ).join("");
    const sessionId = hex.slice(0, 64);
    const nonce = hex.slice(64, 96);
    server = options.createServer({
      hostname: options.hostname,
      port: options.port,
      onListen: () => undefined,
      signal: controller.signal,
    }, createHandler(options, sessionId, nonce, finish, fail));
  } catch (error) {
    fail(
      new CaptureAuthUrlError("INTERNAL", "Could not create callback server", {
        cause: error,
      }),
    );
    throw error;
  }
  return { server, urlPromise, fail };
}
