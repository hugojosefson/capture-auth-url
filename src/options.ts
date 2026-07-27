/** A function which opens the authorization URL in a browser. */
export type BrowserOpener = (loginUrl: string) => Promise<void>;

/** Creates the local HTTP server. */
export type ServerCreator = (
  options: Deno.ServeTcpOptions,
  handler: (request: Request) => Response | Promise<Response>,
) => Deno.HttpServer<Deno.NetAddr>;

/** Options for {@link captureAuthUrl}. */
export interface CaptureAuthUrlOptions {
  /** Must match the hostname in `redirect_uri`; defaults to `localhost`. */
  hostname?: string;
  /** Must match the port in `redirect_uri`; defaults to that port. */
  port?: number;
  /** Must match the pathname in `redirect_uri`; defaults to that pathname. */
  callbackPath?: string;
  /** Local endpoint used by the callback page. Defaults to `/capture-url`. */
  capturePath?: string;
  /** An additional allowed browser origin, for an intentional cross-origin flow. */
  cors?: false | string;
  /** Maximum request body size in bytes. Defaults to 16 KiB. */
  maxRequestBodyBytes?: number;
  /** Maximum duration of the flow in milliseconds. Defaults to ten minutes. */
  totalTimeoutMillis?: number;
  returnInstructions?: string | Response;
  htmlLang?: string;
  htmlTitle?: string;
  open?: BrowserOpener;
  /** Dependency injection for tests and embedders. */
  randomBytes?: (length: number) => Uint8Array;
  /** Dependency injection for tests and alternate local servers. */
  createServer?: ServerCreator;
}

export interface StartServerOptions {
  hostname: string;
  port: number;
  callbackPath: string;
  capturePath: string;
  cors: false | string;
  maxRequestBodyBytes: number;
  totalTimeoutMillis: number;
  returnInstructions: string | Response;
  htmlLang: string;
  htmlTitle: string;
  randomBytes: (length: number) => Uint8Array;
  createServer: ServerCreator;
}
