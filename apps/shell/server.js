const { createServer } = require("node:http");
const { parse } = require("node:url");
const next = require("next");
const httpProxy = require("http-proxy");

const dev = process.argv.includes("--dev");
const port = Number(process.env.PORT || 3000);
const app = next({ dev });
const handle = app.getRequestHandler();
const proxy = httpProxy.createProxyServer({ changeOrigin: true });

const zones = [
  {
    prefix: "/catalog",
    name: "Catalog",
    target: process.env.CATALOG_ZONE_URL || "http://localhost:3001"
  },
  {
    prefix: "/orders",
    name: "Orders",
    target: process.env.ORDERS_ZONE_URL || "http://localhost:3002"
  }
];

app.prepare().then(() => {
  createServer((request, response) => {
    const pathname = parse(request.url || "/").pathname || "/";
    const zone = zones.find(({ prefix }) =>
      pathname === prefix || pathname.startsWith(`${prefix}/`)
    );

    if (!zone) {
      return handle(request, response, parse(request.url || "/", true));
    }

    const onError = () => {
      if (response.headersSent) {
        response.destroy();
        return;
      }
      request.url = `/mfe-unavailable?name=${encodeURIComponent(zone.name)}`;
      handle(request, response, parse(request.url, true));
    };

    proxy.web(request, response, { target: zone.target }, onError);
  }).listen(port, "0.0.0.0", () => {
    console.log(JSON.stringify({
      service: "shell-app",
      event: "listening",
      port,
      mode: dev ? "development" : "production"
    }));
  });
}).catch((error) => {
  console.error(JSON.stringify({ service: "shell-app", event: "startup_failed", error: error.message }));
  process.exitCode = 1;
});
