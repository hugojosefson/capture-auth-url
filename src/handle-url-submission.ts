export async function handleUrlSubmission(
  req: Request,
  resolve: (value: PromiseLike<URL> | URL) => void,
  returnInstructions: string | Response,
): Promise<Response> {
  const capturedUrlString = await req.text();
  const capturedUrl = new URL(capturedUrlString);
  resolve(capturedUrl);
  if (typeof returnInstructions === "string") {
    return new Response(returnInstructions, {
      headers: { "Content-Type": "text/html" },
    });
  }
  return returnInstructions;
}
