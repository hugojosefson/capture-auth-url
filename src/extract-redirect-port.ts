/**
 * Extracts the port number from a login URL's `redirect_uri` query parameter.
 * @param loginUrl {string|URL} The login URL that contains the `redirect_uri` query parameter.
 * @returns {number} The port number specified in the `redirect_uri`, or 80 or 443 if no port is specified.
 * @throws {Error} If the `redirect_uri` is not found, or if it does not point to `localhost`.
 */
export function extractRedirectPort(loginUrl: string | URL): number {
  const url = new URL(loginUrl);
  const redirectUri = url.searchParams.get("redirect_uri");
  if (!redirectUri) {
    throw new Error(
      `No redirect_uri query parameter found in the login URL: ${loginUrl}`,
    );
  }
  const redirectUrl = new URL(redirectUri);
  if (redirectUrl.hostname !== "localhost") {
    throw new Error(
      `To automatically figure out the port to listen on, the redirect_uri must point to localhost, but it points to ${redirectUrl.hostname}. Please specify the port manually.`,
    );
  }
  if (redirectUrl.port) {
    return parseInt(redirectUrl.port, 10);
  }
  return redirectUrl.protocol === "https:" ? 443 : 80;
}
