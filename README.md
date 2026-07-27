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
  hostname: "localhost",
  maxRequestBodyBytes: 16 * 1024,
  totalTimeoutMillis: 60_000,
});
```

| Option                                        | Description                                                                                       |
| :-------------------------------------------- | :------------------------------------------------------------------------------------------------ |
| `hostname`, `port`, `callbackPath`            | Must exactly match `redirect_uri`; defaults come from it except hostname defaults to `localhost`. |
| `capturePath`                                 | Exact local POST pathname; defaults to `/capture-url`.                                            |
| `cors`                                        | Disabled by default. A string intentionally permits that POST Origin.                             |
| `maxRequestBodyBytes`                         | Bounded submitted URL size; defaults to 16 KiB.                                                   |
| `totalTimeoutMillis`                          | Flow timeout; defaults to 10 minutes.                                                             |
| `returnInstructions`, `htmlLang`, `htmlTitle` | Callback-page display settings.                                                                   |
| `open`, `randomBytes`, `createServer`         | Browser, entropy, and server dependency injection.                                                |

`captureAuthUrl(loginUrl, options?)` is the only API signature. It requires an
HTTP loopback `redirect_uri` (`localhost`, `127.0.0.0/8`, or `::1`). The port
defaults to HTTP port 80 when omitted. The listener binds only the configured
hostname and validates the configured host, port, and callback path before
opening the browser.

The callback page sends the full URL using a random one-time header value. The
listener accepts only its exact callback and capture paths, validates request
Host, Origin, method, content type, and submitted URL target, and uses bounded
bodies. It does not log callback data. The returned URL and CLI stdout retain
the captured URL because that is this module's purpose.

### Migrating from 0.2

Replace positional arguments with the options object. `redirect_uri` is now
required, wildcard CORS is gone, and callback paths no longer accept every GET.
For a `127.0.0.1` or `::1` redirect, set the matching `hostname`; the default
`localhost` intentionally does not match a numeric redirect host.

```typescript
const ipv4LoginUrl =
  "https://example.com/login?redirect_uri=http://127.0.0.1:1234/callback";
const url = await captureAuthUrl(ipv4LoginUrl, {
  hostname: "127.0.0.1",
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
