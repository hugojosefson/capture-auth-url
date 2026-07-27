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
  callbackPath?: string,
  capturePath = "/capture-url",
  cors?: false | string,
): {
  handler: (req: Request) => Promise<Response>;
  urlPromise: Promise<URL>;
} {
  let resolve: (value: PromiseLike<URL> | URL) => void;
  const urlPromise = new Promise<URL>((res) => {
    resolve = res;
  });

  const corsHeaders = (methods: string): HeadersInit => {
    if (cors === undefined) {
      return {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": methods,
        "Access-Control-Allow-Headers": "Content-Type",
      };
    }
    if (cors === false) return {};
    return {
      "Access-Control-Allow-Origin": cors,
      "Access-Control-Allow-Methods": methods,
      "Access-Control-Allow-Headers": "Content-Type",
    };
  };
  /**
   * Handles the initial request and subsequent URL submission.
   * @param req The incoming HTTP request.
   * @returns A Response object.
   */
  async function handler(req: Request): Promise<Response> {
    const pathname = new URL(req.url).pathname;
    if (
      req.method === "GET" &&
      (callbackPath === undefined || pathname === callbackPath)
    ) {
      // Handle the initial request
      return handleFirstRequest(capturePath, htmlLang, htmlTitle);
    }
    if (pathname === capturePath) {
      if (req.method === "OPTIONS") {
        return new Response(null, {
          headers: corsHeaders("GET, POST, OPTIONS"),
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
      return typeof cors === "string"
        ? withCorsOrigin(response, cors)
        : response;
    }

    if (req.method === "OPTIONS") {
      return new Response(null, {
        headers: corsHeaders("GET, OPTIONS"),
      });
    }

    return new Response(`Not Found`, { status: 404 });
  }

  return { handler, urlPromise };
}

function withCorsOrigin(response: Response, origin: string): Response {
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", origin);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
