export interface SpaBrowserEnvironment {
  fetch: typeof fetch;
  crypto: Crypto;
  sessionStorage: Storage;
  location: Pick<Location, "pathname" | "search" | "href">;
  history: {
    replaceState(
      data: unknown,
      unused: string,
      url?: string | URL | null,
    ): void;
  };
  document: { body: { innerHTML: string } };
}

export interface SpaBrowserConfig {
  sessionId: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  clientId: string;
  redirectUri: string;
  scopes: readonly string[];
  authorizationParameters: Record<string, string>;
  tokenParameters: Record<string, string>;
  callbackPath: string;
  submissionPath: string;
  sessionHeader: string;
  expiresAt: number;
  maxRequestBodyBytes: number;
}

/** Native-browser logic. Its arguments make it testable without production overrides. */
export async function runSpaOAuthBrowser(
  env: SpaBrowserEnvironment,
  config: SpaBrowserConfig,
): Promise<void> {
  const key = `capture-spa-oauth:${config.sessionId}`;
  const callback = env.location.pathname === config.callbackPath;
  const fallback =
    "<p>Authorization could not be completed. Return to the application.</p>";
  const b64url = (bytes: Uint8Array) => {
    let value = "";
    for (const byte of bytes) value += String.fromCharCode(byte);
    return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(
      /=+$/,
      "",
    );
  };
  const show = (html: string) => {
    env.document.body.innerHTML = html;
  };
  const submit = async (body: Record<string, unknown>) => {
    const response = await env.fetch(config.submissionPath, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [config.sessionHeader]: config.sessionId,
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error("local submission failed");
    return await response.text();
  };
  const readJson = async (response: Response) => {
    const reader = response.body?.getReader();
    if (!reader) throw new Error("empty token response");
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > config.maxRequestBodyBytes) {
          await reader.cancel();
          throw new Error("token response too large");
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  };
  const report = async (
    code:
      | "STATE_MISMATCH"
      | "OAUTH_CALLBACK_ERROR"
      | "TOKEN_EXCHANGE_FAILED"
      | "BROWSER_ERROR",
  ) => {
    try {
      show(await submit({ ok: false, code }));
    } catch {
      show(fallback);
    }
  };
  try {
    if (!callback) {
      const verifierBytes = new Uint8Array(32);
      const stateBytes = new Uint8Array(32);
      env.crypto.getRandomValues(verifierBytes);
      env.crypto.getRandomValues(stateBytes);
      const verifier = b64url(verifierBytes);
      const challenge = b64url(
        new Uint8Array(
          await env.crypto.subtle.digest(
            "SHA-256",
            new TextEncoder().encode(verifier),
          ),
        ),
      );
      const state = b64url(stateBytes);
      env.sessionStorage.setItem(
        key,
        JSON.stringify({ verifier, state, expiresAt: config.expiresAt }),
      );
      const authorization = new URL(config.authorizationEndpoint);
      for (
        const [name, value] of Object.entries(config.authorizationParameters)
      ) authorization.searchParams.set(name, value);
      for (
        const [name, value] of Object.entries({
          response_type: "code",
          response_mode: "query",
          client_id: config.clientId,
          redirect_uri: config.redirectUri,
          scope: config.scopes.join(" "),
          code_challenge: challenge,
          code_challenge_method: "S256",
          state,
        })
      ) authorization.searchParams.set(name, value);
      env.location.href = authorization.toString();
      return;
    }
    const query = new URLSearchParams(env.location.search);
    env.history.replaceState(null, "", config.callbackPath);
    let saved: { verifier: string; state: string; expiresAt: number };
    try {
      saved = JSON.parse(env.sessionStorage.getItem(key) ?? "");
    } catch {
      await report("STATE_MISMATCH");
      return;
    }
    if (
      typeof saved.verifier !== "string" || typeof saved.state !== "string" ||
      !Number.isFinite(saved.expiresAt) || Date.now() > saved.expiresAt ||
      query.get("state") !== saved.state
    ) {
      await report("STATE_MISMATCH");
      return;
    }
    if (query.has("error")) {
      await report("OAUTH_CALLBACK_ERROR");
      return;
    }
    const code = query.get("code");
    if (!code) {
      await report("BROWSER_ERROR");
      return;
    }
    let token: unknown;
    try {
      const form = new URLSearchParams(config.tokenParameters);
      for (
        const [name, value] of Object.entries({
          grant_type: "authorization_code",
          client_id: config.clientId,
          redirect_uri: config.redirectUri,
          code,
          code_verifier: saved.verifier,
          scope: config.scopes.join(" "),
        })
      ) form.set(name, value);
      const exchangeController = new AbortController();
      const exchangeTimeout = setTimeout(
        () => exchangeController.abort(),
        Math.max(1, config.expiresAt - Date.now()),
      );
      let response: Response;
      try {
        response = await env.fetch(config.tokenEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: form.toString(),
          signal: exchangeController.signal,
        });
      } finally {
        clearTimeout(exchangeTimeout);
      }
      if (!response.ok) throw new Error("token exchange failed");
      token = await readJson(response);
    } catch {
      await report("TOKEN_EXCHANGE_FAILED");
      return;
    }
    try {
      show(await submit({ ok: true, token }));
    } catch {
      show(fallback);
    }
  } catch {
    await report("BROWSER_ERROR");
    if (!callback) env.sessionStorage.removeItem(key);
  } finally {
    if (callback) env.sessionStorage.removeItem(key);
  }
}
