import { assert, assertEquals, assertRejects } from "@std/assert";
import { getPort } from "@openjs/port-free";
import { captureSpaOAuthToken, CaptureSpaOAuthTokenError } from "../mod.ts";
import {
  runSpaOAuthBrowser,
  type SpaBrowserConfig,
} from "../src/spa-oauth-browser.ts";

const sleep = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

class MemoryStorage {
  values = new Map<string, string>();
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
}

const config = (): SpaBrowserConfig => ({
  sessionId: "session",
  authorizationEndpoint: "https://auth.example/authorize",
  tokenEndpoint: "https://auth.example/token",
  clientId: "client",
  redirectUri: "http://localhost:4567/callback",
  scopes: ["openid", "User.Read"],
  authorizationParameters: { prompt: "select_account" },
  tokenParameters: { resource: "api" },
  callbackPath: "/callback",
  submissionPath: "/submit",
  sessionHeader: "X-Session",
  maxRequestBodyBytes: 1024,
  expiresAt: Date.now() + 10_000,
});

Deno.test("SPA browser creates S256 PKCE, redeems form data, and clears callback state", async () => {
  const storage = new MemoryStorage();
  let href = "http://localhost:4567/start";
  const location = {
    pathname: "/start",
    search: "",
    get href() {
      return href;
    },
    set href(value: string) {
      href = value;
    },
  };
  const document = { body: { innerHTML: "" } };
  const random = [new Uint8Array(32).fill(1), new Uint8Array(32).fill(2)];
  const requests: Array<{ input: string; init: RequestInit }> = [];
  const fetchMock: typeof fetch = (input, init) => {
    requests.push({ input: String(input), init: init! });
    if (String(input) === settings.tokenEndpoint) {
      return Promise.resolve(
        new Response(JSON.stringify({ access_token: "secret" })),
      );
    }
    return Promise.resolve(new Response("<p>Done</p>"));
  };
  const cryptoMock = {
    getRandomValues: (bytes: Uint8Array) => {
      bytes.set(random.shift()!);
      return bytes;
    },
    subtle: crypto.subtle,
  } as Crypto;
  const settings = config();
  await runSpaOAuthBrowser({
    fetch: fetchMock,
    crypto: cryptoMock,
    sessionStorage: storage as unknown as Storage,
    location,
    history: { replaceState: () => undefined },
    document,
  }, settings);
  const authorization = new URL(href);
  assertEquals(authorization.searchParams.get("code_challenge_method"), "S256");
  const verifier = "AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE";
  const expectedChallenge = await (async () => {
    const bytes = new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)),
    );
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(
      /=+$/,
      "",
    );
  })();
  assertEquals(
    authorization.searchParams.get("code_challenge"),
    expectedChallenge,
  );
  assertEquals(authorization.searchParams.get("response_mode"), "query");
  assertEquals(authorization.searchParams.get("prompt"), "select_account");
  const state = authorization.searchParams.get("state")!;
  location.pathname = "/callback";
  location.search = `?code=code-value&state=${state}`;
  let replaced = "";
  await runSpaOAuthBrowser({
    fetch: fetchMock,
    crypto: cryptoMock,
    sessionStorage: storage as unknown as Storage,
    location,
    history: {
      replaceState: (_data, _unused, url) => {
        replaced = String(url);
      },
    },
    document,
  }, settings);
  assertEquals(replaced, "/callback");
  assertEquals(storage.values.size, 0);
  const tokenRequest = requests.find(({ input }) =>
    input === settings.tokenEndpoint
  )!;
  assertEquals(
    new URLSearchParams(String(tokenRequest.init.body)).get("code"),
    "code-value",
  );
  assertEquals(
    new URLSearchParams(String(tokenRequest.init.body)).get("grant_type"),
    "authorization_code",
  );
  assertEquals(
    (tokenRequest.init.headers as Record<string, string>).Origin,
    undefined,
  );
  assert(tokenRequest.init.signal instanceof AbortSignal);
  assertEquals(
    JSON.parse(
      String(requests.find(({ input }) => input === "/submit")!.init.body),
    ).token.access_token,
    "secret",
  );
  assertEquals(document.body.innerHTML, "<p>Done</p>");
});

Deno.test("SPA browser state mismatch submits a sanitized error without token exchange", async () => {
  const storage = new MemoryStorage();
  storage.setItem(
    "capture-spa-oauth:session",
    JSON.stringify({
      verifier: "v",
      state: "expected",
      expiresAt: Date.now() + 1_000,
    }),
  );
  const submissions: string[] = [];
  await runSpaOAuthBrowser({
    fetch: (_input, init) => {
      submissions.push(String(init?.body));
      return Promise.resolve(new Response("ok"));
    },
    crypto,
    sessionStorage: storage as unknown as Storage,
    location: {
      pathname: "/callback",
      search: "?code=very-secret&state=wrong",
      href: "http://localhost/callback?code=very-secret",
    },
    history: { replaceState: () => undefined },
    document: { body: { innerHTML: "" } },
  }, config());
  assertEquals(submissions.length, 1);
  assert(!submissions[0].includes("very-secret"));
  assertEquals(storage.values.size, 0);
});

Deno.test("OAuth callback error skips token exchange and posts its fixed code", async () => {
  const storage = new MemoryStorage();
  storage.setItem(
    "capture-spa-oauth:session",
    JSON.stringify({
      verifier: "v",
      state: "state",
      expiresAt: Date.now() + 1_000,
    }),
  );
  const requests: string[] = [];
  await runSpaOAuthBrowser({
    fetch: (input, init) => {
      requests.push(`${input}:${String(init?.body)}`);
      return Promise.resolve(new Response("<p>local</p>"));
    },
    crypto,
    sessionStorage: storage as unknown as Storage,
    location: {
      pathname: "/callback",
      search: "?error=access_denied&state=state",
      href: "http://localhost/callback?error=access_denied",
    },
    history: { replaceState: () => undefined },
    document: { body: { innerHTML: "" } },
  }, config());
  assertEquals(requests.length, 1);
  assert(requests[0].includes("OAUTH_CALLBACK_ERROR"));
  assert(!requests[0].includes("access_denied"));
  assertEquals(storage.values.size, 0);
});

Deno.test("token exchange failure is sanitized and clears browser state", async () => {
  const storage = new MemoryStorage();
  storage.setItem(
    "capture-spa-oauth:session",
    JSON.stringify({
      verifier: "verifier",
      state: "state",
      expiresAt: Date.now() + 1_000,
    }),
  );
  const requests: Array<{ input: string; body: string }> = [];
  let replaced = "";
  await runSpaOAuthBrowser({
    fetch: (input, init) => {
      requests.push({ input: String(input), body: String(init?.body) });
      return Promise.resolve(
        String(input) === config().tokenEndpoint
          ? new Response("sensitive provider error", { status: 400 })
          : new Response("<p>Failed</p>"),
      );
    },
    crypto,
    sessionStorage: storage as unknown as Storage,
    location: {
      pathname: "/callback",
      search: "?code=sensitive-code&state=state",
      href: "http://localhost/callback?code=sensitive-code",
    },
    history: {
      replaceState: (_data, _unused, url) => replaced = String(url),
    },
    document: { body: { innerHTML: "" } },
  }, config());
  assertEquals(replaced, "/callback");
  assertEquals(requests.length, 2);
  assertEquals(requests[0].input, config().tokenEndpoint);
  assert(requests[1].body.includes("TOKEN_EXCHANGE_FAILED"));
  assert(!requests[1].body.includes("sensitive-code"));
  assert(!requests[1].body.includes("sensitive provider error"));
  assertEquals(storage.values.size, 0);
});

Deno.test("SPA server validates submission and returns typed validated token", async () => {
  const port = await getPort({ port: undefined, random: true });
  const origin = `http://localhost:${port}`;
  const result = captureSpaOAuthToken<{ access_token: string }>({
    authorizationEndpoint: "https://auth.example/authorize",
    tokenEndpoint: "https://auth.example/token",
    clientId: "client",
    redirectUri: `${origin}/callback`,
    scopes: ["openid"],
    maxRequestBodyBytes: 128,
    returnInstructions: "<p>Custom done</p>",
    tokenResponseValidator: (value) => {
      if (
        !value || typeof value !== "object" ||
        typeof (value as { access_token?: unknown }).access_token !== "string"
      ) throw new Error("bad token");
      return value as { access_token: string };
    },
    open: async (startUrl) => {
      const start = await fetch(startUrl);
      const html = await start.text();
      assert(!html.includes("access_token"));
      assert(!html.includes("Custom done"));
      assert(
        start.headers.get("Content-Security-Policy")?.includes(
          "connect-src 'self' https://auth.example",
        ),
      );
      const script =
        html.match(/<script nonce="[^"]+">([\s\S]+)<\/script>/)![1];
      new Function(script);
      const callbackPage = await fetch(`${origin}/callback?code=page-secret`);
      assert(!(await callbackPage.text()).includes("page-secret"));
      const session = html.match(/sessionId":"([0-9a-f]+)"/)![1];
      assertEquals((await fetch(`${origin}/missing`)).status, 404);
      assertEquals((await fetch(`${origin}/oauth-submit`)).status, 405);
      const baseHeaders = {
        Origin: origin,
        "Content-Type": "application/json",
        "X-Capture-Spa-OAuth-Session": session,
      };
      assertEquals(
        (await fetch(`${origin}/oauth-submit`, {
          method: "POST",
          headers: { ...baseHeaders, Origin: "https://evil.example" },
          body: JSON.stringify({ ok: true, token: {} }),
        })).status,
        403,
      );
      assertEquals(
        (await fetch(`${origin}/oauth-submit`, {
          method: "POST",
          headers: { ...baseHeaders, "Content-Type": "text/plain" },
          body: JSON.stringify({ ok: true, token: {} }),
        })).status,
        415,
      );
      assertEquals(
        (await fetch(`${origin}/oauth-submit`, {
          method: "POST",
          headers: {
            ...baseHeaders,
            "X-Capture-Spa-OAuth-Session": "wrong",
          },
          body: JSON.stringify({ ok: true, token: {} }),
        })).status,
        403,
      );
      assertEquals(
        (await fetch(`${origin}/oauth-submit`, {
          method: "POST",
          headers: baseHeaders,
          body: "x".repeat(200),
        })).status,
        413,
      );
      const submission = await fetch(`${origin}/oauth-submit`, {
        method: "POST",
        headers: baseHeaders,
        body: JSON.stringify({ ok: true, token: { access_token: "secret" } }),
      });
      assertEquals(
        submission.status,
        200,
      );
      assertEquals(await submission.text(), "<p>Custom done</p>");
    },
  });
  assertEquals(await result, { access_token: "secret" });
});

Deno.test("SPA server rejects browser failures and validator failures", async () => {
  const failurePort = await getPort({ port: undefined, random: true });
  const failureOrigin = `http://localhost:${failurePort}`;
  const browserFailure = captureSpaOAuthToken({
    authorizationEndpoint: "https://auth.example/authorize",
    tokenEndpoint: "https://auth.example/token",
    clientId: "client",
    redirectUri: `${failureOrigin}/callback`,
    scopes: ["openid"],
    open: async (startUrl) => {
      const html = await (await fetch(startUrl)).text();
      const session = html.match(/sessionId":"([0-9a-f]+)"/)![1];
      const response = await fetch(`${failureOrigin}/oauth-submit`, {
        method: "POST",
        headers: {
          Origin: failureOrigin,
          "Content-Type": "application/json",
          "X-Capture-Spa-OAuth-Session": session,
        },
        body: JSON.stringify({ ok: false, code: "STATE_MISMATCH" }),
      });
      assert(!(await response.text()).includes("Done"));
    },
  });
  const browserError = await assertRejects(
    () => browserFailure,
    CaptureSpaOAuthTokenError,
  );
  assertEquals(browserError.code, "STATE_MISMATCH");

  const validatorPort = await getPort({ port: undefined, random: true });
  const validatorOrigin = `http://localhost:${validatorPort}`;
  const validatorFailure = captureSpaOAuthToken({
    authorizationEndpoint: "https://auth.example/authorize",
    tokenEndpoint: "https://auth.example/token",
    clientId: "client",
    redirectUri: `${validatorOrigin}/callback`,
    scopes: ["openid"],
    tokenResponseValidator: () => {
      throw new Error("validator detail");
    },
    open: async (startUrl) => {
      const html = await (await fetch(startUrl)).text();
      const session = html.match(/sessionId":"([0-9a-f]+)"/)![1];
      const response = await fetch(`${validatorOrigin}/oauth-submit`, {
        method: "POST",
        headers: {
          Origin: validatorOrigin,
          "Content-Type": "application/json",
          "X-Capture-Spa-OAuth-Session": session,
        },
        body: JSON.stringify({ ok: true, token: { access_token: "secret" } }),
      });
      const text = await response.text();
      assert(!text.includes("secret"));
      assert(!text.includes("validator detail"));
    },
  });
  const validatorError = await assertRejects(
    () => validatorFailure,
    CaptureSpaOAuthTokenError,
  );
  assertEquals(validatorError.code, "TOKEN_VALIDATION_FAILED");
});

Deno.test("SPA server rejects concurrent token submissions", async () => {
  const port = await getPort({ port: undefined, random: true });
  const origin = `http://localhost:${port}`;
  let bodyController!: ReadableStreamDefaultController<Uint8Array>;
  const result = captureSpaOAuthToken({
    authorizationEndpoint: "https://auth.example/authorize",
    tokenEndpoint: "https://auth.example/token",
    clientId: "client",
    redirectUri: `${origin}/callback`,
    scopes: ["openid"],
    open: async (startUrl) => {
      const html = await (await fetch(startUrl)).text();
      const session = html.match(/sessionId":"([0-9a-f]+)"/)![1];
      const headers = {
        Origin: origin,
        "Content-Type": "application/json",
        "X-Capture-Spa-OAuth-Session": session,
      };
      const first = fetch(`${origin}/oauth-submit`, {
        method: "POST",
        headers,
        body: new ReadableStream<Uint8Array>({
          start(controller) {
            bodyController = controller;
            controller.enqueue(
              new TextEncoder().encode(
                JSON.stringify({ ok: true, token: { first: true } }),
              ),
            );
          },
        }),
      });
      await sleep(10);
      const concurrent = await fetch(`${origin}/oauth-submit`, {
        method: "POST",
        headers,
        body: JSON.stringify({ ok: true, token: { second: true } }),
      });
      assertEquals(concurrent.status, 409);
      bodyController.close();
      assertEquals((await first).status, 200);
    },
  });
  assertEquals(await result, { first: true });
});

Deno.test("SPA timeout aborts hanging openers and stalled submissions", async () => {
  const hangingPort = await getPort({ port: undefined, random: true });
  const hangingOrigin = `http://localhost:${hangingPort}`;
  await assertRejects(
    () =>
      captureSpaOAuthToken({
        authorizationEndpoint: "https://auth.example/authorize",
        tokenEndpoint: "https://auth.example/token",
        clientId: "client",
        redirectUri: `${hangingOrigin}/callback`,
        scopes: ["openid"],
        totalTimeoutMillis: 30,
        open: () => new Promise<void>(() => undefined),
      }),
    CaptureSpaOAuthTokenError,
    "timed out",
  );
  await assertRejects(() => fetch(hangingOrigin));

  const stalledPort = await getPort({ port: undefined, random: true });
  const stalledOrigin = `http://localhost:${stalledPort}`;
  const clientController = new AbortController();
  let request: Promise<Response> | undefined;
  try {
    const stalled = captureSpaOAuthToken({
      authorizationEndpoint: "https://auth.example/authorize",
      tokenEndpoint: "https://auth.example/token",
      clientId: "client",
      redirectUri: `${stalledOrigin}/callback`,
      scopes: ["openid"],
      totalTimeoutMillis: 100,
      open: async (startUrl) => {
        const html = await (await fetch(startUrl)).text();
        const session = html.match(/sessionId":"([0-9a-f]+)"/)![1];
        request = fetch(`${stalledOrigin}/oauth-submit`, {
          method: "POST",
          headers: {
            Origin: stalledOrigin,
            "Content-Type": "application/json",
            "X-Capture-Spa-OAuth-Session": session,
          },
          body: new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(new TextEncoder().encode('{"ok":true'));
            },
          }),
          signal: clientController.signal,
        });
        await sleep(20);
      },
    });
    await assertRejects(() => stalled, CaptureSpaOAuthTokenError, "timed out");
    await assertRejects(() => fetch(stalledOrigin));
  } finally {
    clientController.abort();
    await request?.catch(() => undefined);
  }
});

Deno.test("SPA OAuth rejects reserved parameters and browser open failures", async () => {
  await assertRejects(
    () =>
      captureSpaOAuthToken({
        authorizationEndpoint: "http://auth.example",
        tokenEndpoint: "https://auth.example/token",
        clientId: "client",
        redirectUri: "http://localhost/callback",
        scopes: ["openid"],
      }),
    CaptureSpaOAuthTokenError,
    "HTTPS",
  );
  await assertRejects(
    () =>
      captureSpaOAuthToken({
        authorizationEndpoint: "https://auth.example",
        tokenEndpoint: "https://auth.example/token",
        clientId: "client",
        redirectUri: "http://localhost/callback",
        scopes: ["openid"],
        tokenParameters: { code: "bad" },
      }),
    CaptureSpaOAuthTokenError,
    "reserved",
  );
  await assertRejects(
    () =>
      captureSpaOAuthToken({
        authorizationEndpoint: "https://auth.example?secret=value",
        tokenEndpoint: "https://auth.example/token",
        clientId: "client",
        redirectUri: "http://localhost/callback",
        scopes: ["openid"],
      }),
    CaptureSpaOAuthTokenError,
    "HTTPS",
  );
  await assertRejects(
    () =>
      captureSpaOAuthToken({
        authorizationEndpoint: "https://auth.example",
        tokenEndpoint: "https://auth.example/token",
        clientId: "client",
        redirectUri: "http://localhost/callback",
        scopes: ["openid"],
        authorizationParameters: { client_secret: "do-not-embed" },
      }),
    CaptureSpaOAuthTokenError,
    "reserved",
  );
  await assertRejects(
    () =>
      captureSpaOAuthToken({
        authorizationEndpoint: "https://auth.example",
        tokenEndpoint: "https://auth.example/token",
        clientId: "client",
        redirectUri: "http://localhost/callback",
        scopes: ["openid"],
        startPath: "//evil.example/start",
      }),
    CaptureSpaOAuthTokenError,
    "local pathnames",
  );
  const port = await getPort({ port: undefined, random: true });
  await assertRejects(
    () =>
      captureSpaOAuthToken({
        authorizationEndpoint: "https://auth.example",
        tokenEndpoint: "https://auth.example/token",
        clientId: "client",
        redirectUri: `http://localhost:${port}/callback`,
        scopes: ["openid"],
        open: () => {
          throw new Error("no browser");
        },
      }),
    CaptureSpaOAuthTokenError,
    "open",
  );
  await assertRejects(() => fetch(`http://localhost:${port}`));
});
