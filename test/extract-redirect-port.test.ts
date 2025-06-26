import { assertEquals, assertThrows } from "@std/assert";
import { extractRedirectPort } from "../src/extract-redirect-port.ts";

Deno.test("extractRedirectPort", async (t) => {
  await t.step("extracts port from redirect_uri", () => {
    const url =
      "https://auth.example.com/login?redirect_uri=http://localhost:8080/callback";
    assertEquals(extractRedirectPort(url), 8080);
  });

  await t.step("defaults to port 80 for http", () => {
    const url =
      "https://auth.example.com/login?redirect_uri=http://localhost/callback";
    assertEquals(extractRedirectPort(url), 80);
  });

  await t.step("defaults to port 443 for https", () => {
    const url =
      "https://auth.example.com/login?redirect_uri=https://localhost/callback";
    assertEquals(extractRedirectPort(url), 443);
  });

  await t.step("throws if no redirect_uri", () => {
    const url = "https://auth.example.com/login";
    assertThrows(() => extractRedirectPort(url));
  });

  await t.step("throws if redirect_uri is not localhost", () => {
    const url =
      "https://auth.example.com/login?redirect_uri=http://example.com:8080/callback";
    assertThrows(() => extractRedirectPort(url));
  });
});
