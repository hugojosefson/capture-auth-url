import { assertEquals } from "@std/assert";
import { handleFirstRequest } from "../src/handle-first-request.ts";

Deno.test("callback HTML escapes attributes and serializes script values", async () => {
  const response = handleFirstRequest(
    "/</script>",
    "session",
    "nonce",
    'en"><script>',
    "<title>",
  );
  const html = await response.text();
  assertEquals(html.includes("</script>"), true); // The closing tag is the template's own tag only.
  assertEquals(html.includes('lang="en&quot;&gt;&lt;script&gt;"'), true);
  assertEquals(html.includes("<title>&lt;title&gt;</title>"), true);
  assertEquals(html.includes("\\u003c/script\\u003e"), true);
  assertEquals(html.includes('nonce="nonce"'), true);
  assertEquals(
    response.headers.get("Content-Security-Policy")?.includes(
      "'unsafe-inline'",
    ),
    false,
  );
  assertEquals(response.headers.get("Cache-Control"), "no-store");
  assertEquals(response.headers.get("Referrer-Policy"), "no-referrer");
});
