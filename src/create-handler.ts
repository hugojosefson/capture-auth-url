import { handleFirstRequest } from "./handle-first-request.ts";
import { handleUrlSubmission } from "./handle-url-submission.ts";

/**
 * Creates a handler for the authentication flow.
 * @param returnInstructions Instructions to return after capturing the URL, or a Response object.
 * @param htmlLang The language attribute for the HTML document.
 * @param htmlTitle The title of the HTML document.
 */
export function createHandler(
  returnInstructions: string | Response,
  htmlLang: string,
  htmlTitle: string,
): {
  handler: (req: Request) => Promise<Response>;
  urlPromise: Promise<URL>;
} {
  let resolve: (value: PromiseLike<URL> | URL) => void;
  const urlPromise = new Promise<URL>((res) => {
    resolve = res;
  });

  const capturePath = "/capture-url";
  /**
   * Handles the initial request and subsequent URL submission.
   * @param req The incoming HTTP request.
   * @returns A Response object.
   */
  async function handler(req: Request): Promise<Response> {
    if (req.method === "GET") {
      // Handle the initial request
      return handleFirstRequest(capturePath, htmlLang, htmlTitle);
    }
    if (new URL(req.url).pathname === capturePath) {
      if (req.method === "OPTIONS") {
        return new Response(null, {
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
          },
        });
      }
      if (req.method !== "POST") {
        return new Response("Method Not Allowed", { status: 405 });
      }
      // Handle the url submission
      const { response, url } = await handleUrlSubmission(
        req,
        returnInstructions,
      );
      resolve(url);
      return response;
    }

    if (req.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    return new Response(`Not Found`, { status: 404 });
  }

  return { handler, urlPromise };
}
