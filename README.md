# url-authentication-capture

A Deno module to open a login URL in the user's browser, wait for the user to
authenticate, capture the resulting URL (including the hash), and return it to
the program.

[![JSR Version](https://jsr.io/badges/@hugojosefson/url-authentication-capture)](https://jsr.io/@hugojosefson/url-authentication-capture)
[![JSR Score](https://jsr.io/badges/@hugojosefson/url-authentication-capture/score)](https://jsr.io/@hugojosefson/url-authentication-capture)

## Usage

```typescript
import { authenticateAndCaptureResultingUrl } from "jsr:@hugojosefson/url-authentication-capture";

const loginUrl =
  "https://example.com/login?redirect_uri=http://localhost:1234/callback";
const url = await authenticateAndCaptureResultingUrl(loginUrl);
console.log(url.toString());
```

## CLI Usage

The CLI allows you to run the module directly from the command line, opening the
login URL in your default browser, and capturing the resulting URL after
authentication.

It prints the resulting URL to standard output.

```
deno run --allow-net --allow-run --allow-env --allow-read jsr:@hugojosefson/url-authentication-capture/cli <loginUrl> [port]
```

Example:

```
deno run --allow-net --allow-run --allow-env --allow-read jsr:@hugojosefson/url-authentication-capture/cli "https://example.com/login?redirect_uri=http://localhost:1234/callback"
```

## License

MIT
