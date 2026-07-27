import { assertEquals } from "@std/assert";
import { handleFirstRequest } from "../src/handle-first-request.ts";

Deno.test("handleFirstRequest", async (t) => {
  await t.step(
    "returns HTML response with correct lang and title",
    async () => {
      const response = handleFirstRequest("/test-path", "sv", "Test Title");
      assertEquals(response.headers.get("Content-Type"), "text/html");
      const html = await response.text();
      assertEquals(html.includes('lang="sv"'), true);
      assertEquals(html.includes("<title>Test Title</title>"), true);
      assertEquals(html.includes(`fetch("/test-path"`), true);
    },
  );

  await t.step("escapes configured paths embedded in scripts", async () => {
    const response = handleFirstRequest(
      "/</script><script>alert(1)</script>",
      "en",
      "Test",
    );
    const html = await response.text();
    assertEquals(html.includes("</script><script>alert(1)</script>"), false);
    assertEquals(
      html.includes(
        'fetch("/\\u003c/script\\u003e\\u003cscript\\u003ealert(1)\\u003c/script\\u003e"',
      ),
      true,
    );
  });
});
