import { assertEquals, assertThrows } from "@std/assert";
import { getPort } from "@openjs/port-free";
import { startServer } from "../src/start-server.ts";
import { captureAuthUrl } from "../src/capture-auth-url.ts";

function getRandomPort(): Promise<number> {
  return getPort({ port: undefined, random: true });
}

Deno.test("startServer integration", async () => {
  const port = await getRandomPort();
  const { server, urlPromise } = startServer(
    port,
    5000,
    "Done",
    "en",
    "Test",
  );

  // Wait for server to be ready
  await new Promise((resolve) => setTimeout(resolve, 100));

  try {
    // Simulate browser initial request
    const response1 = await fetch(`http://localhost:${port}`);
    assertEquals(response1.status, 200);
    assertEquals(response1.headers.get("Content-Type"), "text/html");
    await response1.text(); // Consume the response body

    // Simulate browser sending back URL with hash
    const testUrl = `http://localhost:${port}/callback#token=abc123`;
    const response2 = await fetch(`http://localhost:${port}/capture-url`, {
      method: "POST",
      body: testUrl,
    });
    assertEquals(response2.status, 200);
    const text = await response2.text();
    assertEquals(text, "Done");

    const capturedUrl = await urlPromise;
    assertEquals(capturedUrl.toString(), testUrl);
  } finally {
    await server.shutdown();
  }
});

Deno.test("captureAuthUrl integration", async () => {
  const port = await getRandomPort();
  let openedUrl: string | undefined;

  // Mock open function that simulates browser behavior
  const mockOpen = async (url: string) => {
    openedUrl = url;
    await new Promise((resolve) => setTimeout(resolve, 100)); // Wait for server
    const response1 = await fetch(`http://localhost:${port}`);
    await response1.text();

    const response2 = await fetch(`http://localhost:${port}/capture-url`, {
      method: "POST",
      body: `http://localhost:${port}/callback#token=xyz789`,
    });
    await response2.text();
  };

  const loginUrl =
    `https://auth.example.com/login?redirect_uri=http://localhost:${port}/callback`;
  const url = await captureAuthUrl(
    loginUrl,
    port,
    5000,
    "Done",
    "en",
    "Test",
    mockOpen,
  );

  assertEquals(openedUrl, loginUrl);
  assertEquals(url.hash, "#token=xyz789");
});

Deno.test("startServer options bind hostname, restrict callback, and use custom paths", async () => {
  const port = await getRandomPort();
  const { server, urlPromise } = startServer({
    port,
    hostname: "127.0.0.1",
    callbackPath: "/callback",
    capturePath: "/capture",
    cors: "https://login.example.com",
    totalTimeoutMillis: 5000,
    returnInstructions: "Done",
    htmlLang: "en",
    htmlTitle: "Test",
  });
  try {
    const wrongCallback = await fetch(`http://127.0.0.1:${port}/other`);
    assertEquals(wrongCallback.status, 404);

    const callback = await fetch(`http://127.0.0.1:${port}/callback`);
    assertEquals((await callback.text()).includes('fetch("/capture"'), true);

    const preflight = await fetch(`http://127.0.0.1:${port}/capture`, {
      method: "OPTIONS",
    });
    assertEquals(
      preflight.headers.get("Access-Control-Allow-Origin"),
      "https://login.example.com",
    );

    const captured = `http://127.0.0.1:${port}/callback#token=custom`;
    const response = await fetch(`http://127.0.0.1:${port}/capture`, {
      method: "POST",
      body: captured,
    });
    assertEquals(
      response.headers.get("Access-Control-Allow-Origin"),
      "https://login.example.com",
    );
    assertEquals((await urlPromise).toString(), captured);
  } finally {
    await server.shutdown();
  }
});

Deno.test("legacy defaults and disabled CORS headers", async () => {
  const port = await getRandomPort();
  const legacy = startServer(port, 5000, "Done", "en", "Test");
  try {
    const callback = await fetch(`http://localhost:${port}/any-callback`);
    assertEquals(callback.status, 200);
    assertEquals(
      (await callback.text()).includes("fetch('/capture-url'"),
      true,
    );
    const preflight = await fetch(`http://localhost:${port}/capture-url`, {
      method: "OPTIONS",
    });
    assertEquals(preflight.headers.get("Access-Control-Allow-Origin"), "*");
    const response = await fetch(`http://localhost:${port}/capture-url`, {
      method: "POST",
      body: `http://localhost:${port}/any-callback#legacy`,
    });
    assertEquals(response.headers.get("Access-Control-Allow-Origin"), null);
    await legacy.urlPromise;
  } finally {
    await legacy.server.shutdown();
  }

  const disabledPort = await getRandomPort();
  const disabled = startServer({
    port: disabledPort,
    cors: false,
    totalTimeoutMillis: 5000,
    returnInstructions: "Done",
    htmlLang: "en",
    htmlTitle: "Test",
  });
  try {
    const preflight = await fetch(
      `http://localhost:${disabledPort}/capture-url`,
      {
        method: "OPTIONS",
      },
    );
    assertEquals(preflight.headers.get("Access-Control-Allow-Origin"), null);
    const response = await fetch(
      `http://localhost:${disabledPort}/capture-url`,
      {
        method: "POST",
        body: `http://localhost:${disabledPort}/callback#disabled`,
      },
    );
    assertEquals(response.headers.get("Access-Control-Allow-Origin"), null);
    await disabled.urlPromise;
  } finally {
    await disabled.server.shutdown();
  }
});

Deno.test("captureAuthUrl options object", async () => {
  const port = await getRandomPort();
  const loginUrl = "https://auth.example.com/login";
  const url = await captureAuthUrl(loginUrl, {
    port,
    hostname: "127.0.0.1",
    callbackPath: "/callback",
    capturePath: "/capture",
    totalTimeoutMillis: 5000,
    open: async () => {
      const callback = await fetch(`http://127.0.0.1:${port}/callback`);
      await callback.text();
      await fetch(`http://127.0.0.1:${port}/capture`, {
        method: "POST",
        body: `http://127.0.0.1:${port}/callback#options`,
      });
    },
  });
  assertEquals(url.hash, "#options");
});

Deno.test("startServer rejects unsafe configured paths", () => {
  assertThrows(() =>
    startServer({
      port: 1,
      callbackPath: "/callback?query",
      totalTimeoutMillis: 1,
      returnInstructions: "Done",
      htmlLang: "en",
      htmlTitle: "Test",
    })
  );
});
