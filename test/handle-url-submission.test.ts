import { assertEquals, assertRejects } from "@std/assert";
import { CaptureAuthUrlError } from "../src/errors.ts";
import { readBoundedBody } from "../src/handle-url-submission.ts";

Deno.test("bounded body rejects declared and streamed excess bytes", async () => {
  const declared = new Request("http://localhost/capture", {
    method: "POST",
    headers: { "Content-Length": "5" },
    body: "x",
  });
  const declaredError = await assertRejects(
    () => readBoundedBody(declared, 4),
    CaptureAuthUrlError,
  );
  assertEquals(declaredError.code, "BODY_TOO_LARGE");

  const streamed = new Request("http://localhost/capture", {
    method: "POST",
    headers: { "Content-Length": "1" },
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3]));
        controller.enqueue(new Uint8Array([4, 5, 6]));
        controller.close();
      },
    }),
  });
  const streamedError = await assertRejects(
    () => readBoundedBody(streamed, 4),
    CaptureAuthUrlError,
  );
  assertEquals(streamedError.code, "BODY_TOO_LARGE");
});

Deno.test("bounded body rejects malformed UTF-8 separately", async () => {
  const request = new Request("http://localhost/capture", {
    method: "POST",
    body: new Uint8Array([0xc3, 0x28]),
  });
  const error = await assertRejects(
    () => readBoundedBody(request, 16),
    CaptureAuthUrlError,
  );
  assertEquals(error.code, "INVALID_BODY");
});
