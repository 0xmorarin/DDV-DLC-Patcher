import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../", import.meta.url)));
const host = "127.0.0.1";
const port = Number(process.env.DDV_PREVIEW_PORT ?? 8765);
const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

if (!Number.isInteger(port) || port < 1024 || port > 65535) {
  throw new Error("DDV_PREVIEW_PORT must be a local port between 1024 and 65535.");
}

const server = createServer(async (request, response) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" });
    response.end();
    return;
  }
  let target;
  try {
    const pathname = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
    const relative = decodeURIComponent(pathname).replace(/^[/\\]+/, "") || "index.html";
    target = resolve(root, relative);
  } catch {
    response.writeHead(400);
    response.end();
    return;
  }
  if (!target.startsWith(root + sep) || !Object.hasOwn(mime, extname(target).toLowerCase())) {
    response.writeHead(403);
    response.end();
    return;
  }
  try {
    const bytes = await readFile(target);
    response.writeHead(200, {
      "Content-Type": mime[extname(target).toLowerCase()],
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'none'; form-action 'none'; base-uri 'none'"
    });
    if (request.method !== "HEAD") response.end(bytes);
    else response.end();
  } catch {
    response.writeHead(404);
    response.end();
  }
});

server.listen(port, host, () => {
  process.stdout.write("Local-only DDV DLC Patcher preview: http://" + host + ":" + port + "/\n");
});
