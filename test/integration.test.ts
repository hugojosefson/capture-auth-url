import { assertEquals, assertRejects } from "@std/assert";
import { getPort } from "@openjs/port-free";
import { captureAuthUrl, CaptureAuthUrlError } from "../mod.ts";

const port = () => getPort({ port: undefined, random: true });
const sleep = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

async function callback(origin: string, path = "/callback"): Promise<string> {
  const response = await fetch(`${origin}${path}`);
  const html = await response.text();
  assertEquals(response.status, 200);
  return html.match(/X-Capture-Auth-Session":("[^"]+")/)![1].slice(1, -1);
}

Deno.test("defaults bind localhost, require redirect_uri, and capture the exact callback URL", async () => {
  const listenerPort = await port();
  const origin = `http://localhost:${listenerPort}`;
  const login = `https://auth.example/login?redirect_uri=${
    encodeURIComponent(`${origin}/callback`)
  }`;
  const result = await captureAuthUrl(login, {
    open: async () => {
      const session = await callback(origin);
      const response = await fetch(`${origin}/capture-url`, {
        method: "POST",
        headers: {
          Origin: origin,
          "Content-Type": "text/plain",
          "X-Capture-Auth-Session": session,
        },
        body: `${origin}/callback#secret`,
      });
      assertEquals(response.status, 200);
      assertEquals(response.headers.get("Access-Control-Allow-Origin"), null);
    },
  });
  assertEquals(result.toString(), `${origin}/callback#secret`);
});

Deno.test("rejects redirect mismatch and non-loopback redirects before opening", async () => {
  const listenerPort = await port();
  const local = `https://auth.example/?redirect_uri=${
    encodeURIComponent(`http://localhost:${listenerPort}/callback`)
  }`;
  await assertRejects(
    () => captureAuthUrl(local, { hostname: "127.0.0.1" }),
    CaptureAuthUrlError,
    "match",
  );
  await assertRejects(
    () => captureAuthUrl("https://auth.example/"),
    CaptureAuthUrlError,
    "redirect_uri",
  );
  await assertRejects(
    () =>
      captureAuthUrl(
        `https://auth.example/?redirect_uri=${
          encodeURIComponent("http://127.0.0.1:444/callback")
        }`,
      ),
    CaptureAuthUrlError,
  );
});

Deno.test("configured IPv4 loopback host captures an IPv4 redirect", async () => {
  const listenerPort = await port();
  const origin = `http://127.0.0.1:${listenerPort}`;
  const login = `https://auth.example/?redirect_uri=${
    encodeURIComponent(`${origin}/callback`)
  }`;
  const result = await captureAuthUrl(login, {
    hostname: "127.0.0.1",
    open: async () => {
      const session = await callback(origin);
      await fetch(`${origin}/capture-url`, {
        method: "POST",
        headers: {
          Origin: origin,
          "Content-Type": "text/plain",
          "X-Capture-Auth-Session": session,
        },
        body: `${origin}/callback#ipv4`,
      });
    },
  });
  assertEquals(result.hash, "#ipv4");
});

Deno.test("routes, origin, host, method, type, session, and captured target are restricted", async () => {
  const listenerPort = await port();
  const origin = `http://localhost:${listenerPort}`;
  const login = `https://auth.example/?redirect_uri=${
    encodeURIComponent(`${origin}/callback`)
  }`;
  let resolveOpen!: () => void;
  const flow = captureAuthUrl(login, {
    totalTimeoutMillis: 300,
    open: () =>
      new Promise<void>((resolve) => {
        resolveOpen = resolve;
      }),
  });
  await sleep(20);
  assertEquals((await fetch(`${origin}/other`)).status, 404);
  assertEquals(
    (await fetch(`${origin}/callback`, { method: "POST" })).status,
    405,
  );
  const session = await callback(origin);
  const headers = {
    Origin: origin,
    "Content-Type": "text/plain",
    "X-Capture-Auth-Session": session,
  };
  assertEquals(
    (await fetch(`${origin}/capture-url`, { method: "GET" })).status,
    405,
  );
  assertEquals(
    (await fetch(`${origin}/capture-url`, {
      method: "POST",
      headers: { ...headers, Origin: "https://evil.example" },
      body: `${origin}/callback`,
    })).status,
    403,
  );
  assertEquals(
    (await fetch(`${origin}/capture-url`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: `${origin}/callback`,
    })).status,
    415,
  );
  assertEquals(
    (await fetch(`${origin}/capture-url`, {
      method: "POST",
      headers: { ...headers, "X-Capture-Auth-Session": "wrong" },
      body: `${origin}/callback`,
    })).status,
    403,
  );
  assertEquals(
    (await fetch(`${origin}/capture-url`, {
      method: "POST",
      headers,
      body: `${origin}/other`,
    })).status,
    400,
  );
  resolveOpen();
  await assertRejects(() => flow, CaptureAuthUrlError, "timed out");
});

Deno.test("explicit CORS accepts only its configured origin and large bodies do not settle", async () => {
  const listenerPort = await port();
  const origin = `http://localhost:${listenerPort}`;
  const cors = "https://broker.example";
  const login = `https://auth.example/?redirect_uri=${
    encodeURIComponent(`${origin}/callback`)
  }`;
  const result = captureAuthUrl(login, {
    cors,
    maxRequestBodyBytes: 64,
    open: async () => {
      const session = await callback(origin);
      const headers = {
        Origin: cors,
        "Content-Type": "text/plain",
        "X-Capture-Auth-Session": session,
      };
      const preflight = await fetch(`${origin}/capture-url`, {
        method: "OPTIONS",
        headers: { Origin: cors },
      });
      assertEquals(preflight.headers.get("Access-Control-Allow-Origin"), cors);
      const oversized = await fetch(`${origin}/capture-url`, {
        method: "POST",
        headers,
        body: "x".repeat(100),
      });
      assertEquals(oversized.status, 413);
      assertEquals(oversized.headers.get("Access-Control-Allow-Origin"), cors);
      const response = await fetch(`${origin}/capture-url`, {
        method: "POST",
        headers,
        body: `${origin}/callback`,
      });
      assertEquals(response.headers.get("Access-Control-Allow-Origin"), cors);
      assertEquals(response.status, 200);
    },
  });
  assertEquals((await result).pathname, "/callback");
});

Deno.test("timeout and browser opening failures reject with typed errors", async () => {
  const listenerPort = await port();
  const redirect = encodeURIComponent(
    `http://localhost:${listenerPort}/callback`,
  );
  await assertRejects(
    () =>
      captureAuthUrl(`https://auth.example/?redirect_uri=${redirect}`, {
        totalTimeoutMillis: 10,
        open: () => new Promise<void>(() => undefined),
      }),
    CaptureAuthUrlError,
    "timed out",
  );
  await assertRejects(() => fetch(`http://localhost:${listenerPort}`));
  const failedOpenPort = await port();
  const failedOpenRedirect = encodeURIComponent(
    `http://localhost:${failedOpenPort}/callback`,
  );
  await assertRejects(
    () =>
      captureAuthUrl(
        `https://auth.example/?redirect_uri=${failedOpenRedirect}`,
        {
          open: () => Promise.reject(new Error("no browser")),
        },
      ),
    CaptureAuthUrlError,
    "open",
  );
  await assertRejects(() => fetch(`http://localhost:${failedOpenPort}`));
});

Deno.test("timeout aborts a stalled request body", async () => {
  const listenerPort = await port();
  const origin = `http://localhost:${listenerPort}`;
  const redirect = encodeURIComponent(`${origin}/callback`);
  const clientController = new AbortController();
  let request: Promise<Response> | undefined;
  try {
    const flow = captureAuthUrl(
      `https://auth.example/?redirect_uri=${redirect}`,
      {
        totalTimeoutMillis: 100,
        open: async () => {
          const session = await callback(origin);
          const body = new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(
                new TextEncoder().encode(`${origin}/callback#partial`),
              );
            },
          });
          request = fetch(`${origin}/capture-url`, {
            method: "POST",
            headers: {
              Origin: origin,
              "Content-Type": "text/plain",
              "X-Capture-Auth-Session": session,
            },
            body,
            signal: clientController.signal,
          });
          await sleep(20);
        },
      },
    );
    await assertRejects(() => flow, CaptureAuthUrlError, "timed out");
    await assertRejects(() => fetch(origin));
  } finally {
    clientController.abort();
    await request?.catch(() => undefined);
  }
});
