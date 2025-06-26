/**
 * Handles the first request by returning an HTML page that
 * contains client-side JavaScript to capture the URL
 * and send it back to the server.
 * @param path The path to which the POST request should be sent.
 * @param htmlLang Language attribute for the HTML document.
 * @param htmlTitle Title of the HTML document.
 * @return {Response} A Response object containing the HTML page.
 */
export function handleFirstRequest(
  path: string,
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
                    fetch('${path}', { method: 'POST', body: url })
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
