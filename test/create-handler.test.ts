import { assertEquals } from "@std/assert";
import { createHandler } from "../src/create-handler.ts";
import { CaptureAuthUrlError } from "../src/errors.ts";
import type { ServerCreator, StartServerOptions } from "../src/options.ts";

const origin = "http://localhost:4567";
const sessionId = "session";

function options(
  returnInstructions: string | Response = "Done",
): StartServerOptions {
  return {
    hostname: "localhost",
    port: 4567,
    callbackPath: "/callback",
    capturePath: "/capture",
    cors: false,
    maxRequestBodyBytes: 1024,
    totalTimeoutMillis: 1000,
    returnInstructions,
    htmlLang: "en",
    htmlTitle: "Authentication",
    randomBytes: (length) => new Uint8Array(length),
    createServer: (() => {
      throw new Error("not used");
    }) as ServerCreator,
  };
}

function submission(body: BodyInit): Request {
  return new Request(`${origin}/capture`, {
    method: "POST",
    headers: {
      Host: "localhost:4567",
      Origin: origin,
      "Content-Type": "text/plain; charset=utf-8",
      "X-Capture-Auth-Session": sessionId,
    },
    body,
  });
}

Deno.test("capture handler rejects concurrent and duplicate submissions", async () => {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  let settled: URL | undefined;
  const handler = createHandler(
    options(),
    sessionId,
    "nonce",
    (url) => settled = url,
    () => {
      throw new Error("unexpected failure");
    },
  );
  const first = handler(submission(
    new ReadableStream<Uint8Array>({
      start(value) {
        controller = value;
      },
    }),
  ));

  const concurrent = await handler(submission(`${origin}/callback#second`));
  assertEquals(concurrent.status, 409);

  controller.enqueue(new TextEncoder().encode(`${origin}/callback#first`));
  controller.close();
  assertEquals((await first).status, 200);
  assertEquals(settled?.hash, "#first");

  const duplicate = await handler(submission(`${origin}/callback#third`));
  assertEquals(duplicate.status, 409);
  assertEquals(settled?.hash, "#first");
});

Deno.test("capture handler reports terminal internal failures", async () => {
  let settled = false;
  let failed: Error | undefined;
  const handler = createHandler(
    options(Response.error()),
    sessionId,
    "nonce",
    () => settled = true,
    (error) => failed = error,
  );
  const response = await handler(submission(`${origin}/callback`));
  assertEquals(response.status, 500);
  assertEquals(settled, false);
  assertEquals(failed instanceof CaptureAuthUrlError, true);
  assertEquals((failed as CaptureAuthUrlError).code, "INTERNAL");
});

Deno.test("capture handler validates Host and exact content type", async () => {
  const handler = createHandler(
    options(),
    sessionId,
    "nonce",
    () => undefined,
    () => undefined,
  );
  const wrongHost = submission(`${origin}/callback`);
  wrongHost.headers.set("Host", "example.com");
  assertEquals((await handler(wrongHost)).status, 400);

  const uppercaseHost = submission(`${origin}/callback`);
  uppercaseHost.headers.set("Host", "LOCALHOST:4567");
  assertEquals((await handler(uppercaseHost)).status, 200);

  const wrongType = submission(`${origin}/callback`);
  wrongType.headers.set("Content-Type", "text/plain-malformed");
  assertEquals((await handler(wrongType)).status, 415);
});
