# capture-auth-url

A Deno module to open a login URL in the user's browser, wait for the user to
authenticate, capture the resulting URL (including the hash), and return it to
the program.

[![JSR Version](https://jsr.io/badges/@hugojosefson/capture-auth-url)](https://jsr.io/@hugojosefson/capture-auth-url)
[![JSR Score](https://jsr.io/badges/@hugojosefson/capture-auth-url/score)](https://jsr.io/@hugojosefson/capture-auth-url)

## Usage

```typescript
import { captureAuthUrl } from "jsr:@hugojosefson/capture-auth-url";

const loginUrl =
  "https://example.com/login?redirect_uri=http://localhost:1234/callback";
const url = await captureAuthUrl(loginUrl);
console.log(url.toString());
```

### Options

Use an options object to configure the listener:

```typescript
const url = await captureAuthUrl(loginUrl, {
  hostname: "127.0.0.1",
  callbackPath: "/callback",
  capturePath: "/capture-url",
  cors: "https://login.example.com",
});
```

| Option               | Description                                                                                                                                     |
| :------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------- |
| `port`               | Listener port. Defaults to the port in `redirect_uri`.                                                                                          |
| `hostname`           | Listener hostname. Omitted uses Deno's all-interface bind.                                                                                      |
| `callbackPath`       | Exact callback GET pathname. Omitted accepts GET requests on any pathname.                                                                      |
| `capturePath`        | Browser POST pathname. Defaults to `/capture-url`.                                                                                              |
| `cors`               | `false` disables CORS headers; a string sets that exact allowed origin. Omitted preserves legacy wildcard headers for `OPTIONS` responses only. |
| `totalTimeoutMillis` | Authentication timeout. Defaults to 10 minutes.                                                                                                 |
| `returnInstructions` | String or `Response` displayed after capture.                                                                                                   |
| `htmlLang`           | Callback page language. Defaults to `en`.                                                                                                       |
| `htmlTitle`          | Callback page title. Defaults to `Authentication`.                                                                                              |
| `open`               | Function that opens the login URL.                                                                                                              |

The positional signature remains supported. Omitted options intentionally retain
the prior defaults, including Deno's all-interface bind and legacy CORS
behavior.

For a loopback-only listener with a fixed callback and no CORS headers:

```typescript
const url = await captureAuthUrl(loginUrl, {
  hostname: "127.0.0.1",
  callbackPath: "/callback",
  cors: false,
});
```

## CLI Usage

The CLI allows you to run the module directly from the command line, opening the
login URL in your default browser, and capturing the resulting URL after
authentication.

It prints the resulting URL to standard output.

```
deno run --allow-net --allow-run --allow-env --allow-read jsr:@hugojosefson/capture-auth-url/cli <loginUrl> [port]
```

Example:

```
deno run --allow-net --allow-run --allow-env --allow-read jsr:@hugojosefson/capture-auth-url/cli "https://example.com/login?redirect_uri=http://localhost:1234/callback"
```

## License

MIT
