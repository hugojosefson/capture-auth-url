/**
 * Handles the submission of a URL from a request.
 * @param req The incoming HTTP request containing the URL in the body.
 * @param returnInstructions Instructions to return to the user after capturing the URL.
 * @returns An object containing the captured URL and a Response object with instructions.
 */
export async function handleUrlSubmission(
  req: Request,
  returnInstructions: string | Response,
): Promise<{ response: Response; url: URL }> {
  const capturedUrlString = await req.text();
  const url = new URL(capturedUrlString);
  const response = getResponse(returnInstructions);
  return { url, response };
}

/**
 * Returns a Response object based on the provided return instructions.
 * @param returnInstructions Instructions to return to the user, either as a string or a Response object.
 * @return A Response object with the provided instructions.
 */
function getResponse(returnInstructions: string | Response): Response {
  if (typeof returnInstructions === "string") {
    return new Response(
      returnInstructions,
      {
        headers: { "Content-Type": "text/html" },
      },
    );
  }
  return returnInstructions;
}
