#!/usr/bin/env -S deno run --allow-net --allow-run --allow-env --allow-read
import { captureAuthUrl } from "./capture-auth-url.ts";

/** Usage instructions for the CLI. */
export const USAGE: string = `
Usage:   deno run --allow-net --allow-run --allow-env --allow-read jsr:@hugojosefson/capture-auth-url/cli <loginUrl> [port]
Example: deno run --allow-net --allow-run --allow-env --allow-read jsr:@hugojosefson/capture-auth-url/cli "https://example.com/login?redirect_uri=http://localhost:1234/callback"
`.trim();

/**
 * Main function for the CLI.
 * @param args {string[]} Command line arguments.
 * @return {Promise<number>} Exit code: 0 for success, 2 for user error (e.g., missing loginUrl), other values for other errors.
 */
export async function main(args: string[]): Promise<number> {
  if (args.some((arg) => arg === "--help" || arg === "-h")) {
    console.log(USAGE);
    return 0;
  }
  const [loginUrl, port] = args;
  if (!loginUrl) {
    console.error(USAGE);
    return 2;
  }
  const url = await captureAuthUrl(
    loginUrl,
    port ? parseInt(port, 10) : undefined,
  );
  console.log(`${url}`);
  return 0;
}

if (import.meta.main) {
  Deno.exit(await main(Deno.args));
}
