import { CaptureAuthUrlError } from "./errors.ts";
export async function readBoundedBody(
  request: Request,
  maximum: number,
): Promise<string> {
  const length = request.headers.get("content-length");
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > maximum)) {
    throw new CaptureAuthUrlError(
      "BODY_TOO_LARGE",
      "Request body exceeds the configured limit",
    );
  }
  const reader = request.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximum) {
        await reader.cancel();
        throw new CaptureAuthUrlError(
          "BODY_TOO_LARGE",
          "Request body exceeds the configured limit",
        );
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof CaptureAuthUrlError) throw error;
    throw new CaptureAuthUrlError(
      "INVALID_BODY",
      "Could not read request body",
      { cause: error },
    );
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    throw new CaptureAuthUrlError("INVALID_BODY", "Request body is not UTF-8", {
      cause: error,
    });
  }
}
