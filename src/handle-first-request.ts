export function handleFirstRequest(
  htmlLang: string,
  htmlTitle: string,
): Response {
  return new Response(
    `
            <!DOCTYPE html>
            <html lang="${htmlLang}">
            <head>
                <title>${htmlTitle}</title>
                <script>
                window.addEventListener('load', () => {
                    const url = window.location.toString();
                    fetch('/capture-url', { method: 'POST', body: url })
                        .then(response => response.text())
                        .then(instructions => {
                        document.body.innerHTML = instructions;
                        });
                });
                </script>
            </head>
            <body>
                <h1>Waiting for authentication...</h1>
            </body>
            </html>`,
    {
      headers: { "Content-Type": "text/html" },
    },
  );
}
