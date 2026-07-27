export type CaptureAuthUrlErrorCode =
  | "INVALID_LOGIN_URL"
  | "INVALID_REDIRECT_URI"
  | "REDIRECT_MISMATCH"
  | "TIMEOUT"
  | "BROWSER_OPEN_FAILED"
  | "INTERNAL"
  | "BODY_TOO_LARGE"
  | "INVALID_BODY";

/** Error raised when an authentication capture flow cannot finish. */
export class CaptureAuthUrlError extends Error {
  constructor(
    public readonly code: CaptureAuthUrlErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "CaptureAuthUrlError";
  }
}
