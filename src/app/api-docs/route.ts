/** Swagger UI over /api/openapi. Loaded from CDN so it costs no dependency. */
export async function GET() {
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><title>NBA Savant API</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css">
<style>body{margin:0}.topbar{display:none}</style></head>
<body><div id="ui"></div>
<script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
<script>SwaggerUIBundle({url:'/api/openapi',dom_id:'#ui',docExpansion:'list'})</script>
</body></html>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  );
}
