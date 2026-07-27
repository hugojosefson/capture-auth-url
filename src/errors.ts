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

export type CaptureSpaOAuthTokenErrorCode =
  | "INVALID_CONFIGURATION"
  | "REDIRECT_MISMATCH"
  | "TIMEOUT"
  | "BROWSER_OPEN_FAILED"
  | "STATE_MISMATCH"
  | "OAUTH_CALLBACK_ERROR"
  | "TOKEN_EXCHANGE_FAILED"
  | "BROWSER_ERROR"
  | "TOKEN_VALIDATION_FAILED"
  | "INTERNAL";

/** Error raised when a browser SPA OAuth flow cannot finish. */
export class CaptureSpaOAuthTokenError extends Error {
  constructor(
    public readonly code: CaptureSpaOAuthTokenErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "CaptureSpaOAuthTokenError";
  }
}
