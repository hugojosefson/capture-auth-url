import { assertEquals } from "@std/assert";
import { handleFirstRequest } from "../src/handle-first-request.ts";

Deno.test("handleFirstRequest", async (t) => {
  await t.step(
    "returns HTML response with correct lang and title",
    async () => {
      const response = handleFirstRequest("sv", "Test Title");
      assertEquals(response.headers.get("Content-Type"), "text/html");
      const html = await response.text();
      assertEquals(html.includes('lang="sv"'), true);
      assertEquals(html.includes("<title>Test Title</title>"), true);
    },
  );
});
