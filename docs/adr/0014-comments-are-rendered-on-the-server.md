# Comments are rendered to HTML on the server

A comment is untrusted markdown, so it is turned into HTML on the server by `renderComment` in `app/lib/comment-markdown.server.ts`, which sanitises what it produces. The browser receives a `RenderedComment` with the finished `bodyHtml` beside the raw `body`, which it uses only to fill the edit box. The sanitising renderer is server-only, so the browser never renders a comment's markdown itself.

## Considered Options

- **Render markdown in the browser.** Rejected: the sanitiser would have to ship to every page, and any component could render a comment without it.

## Consequences

Every loader that returns comments must render them first. An edit is shown only after the server has rendered it again.
