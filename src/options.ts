/** Options for {@link captureAuthUrl}. */
export interface CaptureAuthUrlOptions {
  port?: number;
  hostname?: string;
  callbackPath?: string;
  capturePath?: string;
  cors?: false | string;
  totalTimeoutMillis?: number;
  returnInstructions?: string | Response;
  htmlLang?: string;
  htmlTitle?: string;
  open?: (loginUrl: string) => Promise<void>;
}

/** Options for {@link startServer}. */
export interface StartServerOptions {
  port: number;
  hostname?: string;
  callbackPath?: string;
  capturePath?: string;
  cors?: false | string;
  totalTimeoutMillis: number;
  returnInstructions: string | Response;
  htmlLang: string;
  htmlTitle: string;
}
