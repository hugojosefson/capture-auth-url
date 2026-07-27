function htmlEscape(value: string): string {
  return value.replace(/[&<>"']/g, (character) =>
    ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    })[character]!);
}

function scriptValue(value: string): string {
  return JSON.stringify(value).replace(
    /[<>&\u2028\u2029]/g,
    (character) =>
      `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
}

export function handleFirstRequest(
  capturePath: string,
  sessionId: string,
  nonce: string,
  htmlLang: string,
  htmlTitle: string,
): Response {
  const html = `<!doctype html><html lang="${
    htmlEscape(htmlLang)
  }"><head><meta charset="utf-8"><title>${
    htmlEscape(htmlTitle)
  }</title></head><body><script nonce="${htmlEscape(nonce)}">
fetch(${
    scriptValue(capturePath)
  }, {method:"POST", headers:{"Content-Type":"text/plain", "X-Capture-Auth-Session":${
    scriptValue(sessionId)
  }}, body:window.location.href}).then(async response => document.body.innerHTML = await response.text());
</script></body></html>`;
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "Content-Security-Policy":
        `default-src 'none'; script-src 'nonce-${nonce}'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'`,
    },
  });
}
