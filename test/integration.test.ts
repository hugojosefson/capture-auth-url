import { assertEquals } from "@std/assert";
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
