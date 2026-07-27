import type { BrowserOpener, ServerCreator } from "./options.ts";

/** Additional OAuth parameters. Values must be strings. */
export type OAuthParameterMap = Readonly<Record<string, string>>;

/** Options for {@link captureSpaOAuthToken}. */
export interface CaptureSpaOAuthTokenOptions {
  authorizationEndpoint: string | URL;
  tokenEndpoint: string | URL;
  clientId: string;
  redirectUri: string | URL;
  scopes: readonly string[];
  authorizationParameters?: OAuthParameterMap;
  tokenParameters?: OAuthParameterMap;
  hostname?: string;
  port?: number;
  callbackPath?: string;
  startPath?: string;
  submissionPath?: string;
  totalTimeoutMillis?: number;
  maxRequestBodyBytes?: number;
  returnInstructions?: string;
  open?: BrowserOpener;
  randomBytes?: (length: number) => Uint8Array;
  createServer?: ServerCreator;
}

export interface CaptureSpaOAuthTokenValidatedOptions<T>
  extends CaptureSpaOAuthTokenOptions {
  tokenResponseValidator: (response: unknown) => T | Promise<T>;
}

export interface StartSpaOAuthServerOptions<T> {
  hostname: string;
  port: number;
  callbackPath: string;
  startPath: string;
  submissionPath: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  clientId: string;
  redirectUri: string;
  scopes: readonly string[];
  authorizationParameters: OAuthParameterMap;
  tokenParameters: OAuthParameterMap;
  maxRequestBodyBytes: number;
  totalTimeoutMillis: number;
  returnInstructions: string;
  randomBytes: (length: number) => Uint8Array;
  createServer: ServerCreator;
  tokenResponseValidator: (response: unknown) => T | Promise<T>;
}
