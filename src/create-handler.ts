import { handleFirstRequest } from "./handle-first-request.ts";
import { handleUrlSubmission } from "./handle-url-submission.ts";

export function createHandler(
  htmlLang: string,
  htmlTitle: string,
  returnInstructions: string | Response,
): { handler: (req: Request) => Promise<Response>; urlPromise: Promise<URL> } {
  let resolve: (value: PromiseLike<URL> | URL) => void;
  const urlPromise = new Promise<URL>((res) => {
    resolve = res;
  });

  async function handler(req: Request): Promise<Response> {
    if (req.method === "GET") {
      // Handle the initial request
      return handleFirstRequest(htmlLang, htmlTitle);
    } else if (new URL(req.url).pathname === "/capture-url") {
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
      return await handleUrlSubmission(
        req,
        resolve,
        returnInstructions,
      );
    } else if (req.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    } else {
      return new Response(`Not Found`, { status: 404 });
    }
  }

  return { handler, urlPromise };
}
