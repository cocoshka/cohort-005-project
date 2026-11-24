# Comments are rendered to HTML on the server

A comment's body is untrusted markdown written by a Person. The server renders it to sanitised HTML with `renderComment` before it reaches the page, and the browser shows that HTML as it is. The browser keeps the raw markdown only to fill the edit box. The sanitising renderer stays on the server, so the browser has no way to render an unsanitised body.

## Considered Options

- **Render markdown in the browser**: rejected, because the sanitiser would ship to the client, and any component that skipped it would render untrusted HTML.
