import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app";
import { MemoryWebhookQueue } from "../src/queues/webhook-queue";
import { makeConfig, manualClock } from "./helpers";

const publicDir = path.join(__dirname, "..", "..", "public");
const html = readFileSync(path.join(publicDir, "index.html"), "utf8");
const script = readFileSync(path.join(publicDir, "app.js"), "utf8");

function matches(source: string, pattern: RegExp): string[] {
  return [...source.matchAll(pattern)].map((match) => match[1] as string);
}

const elementIds = new Set(matches(html, /\bid="([^"]+)"/g));
const fieldNames = new Set(matches(html, /\bname="([^"]+)"/g));

describe("dashboard consistency", () => {
  it("every getElementById target exists in the HTML", () => {
    const used = matches(script, /getElementById\("([^"]+)"\)/g);
    assert.ok(used.length > 0, "app.js does not query any element");

    const missing = used.filter((id) => !elementIds.has(id));
    assert.deepEqual(missing, [], `missing ids in index.html: ${missing.join(", ")}`);
  });

  it("every form field read by app.js has a name attribute", () => {
    const used = matches(script, /form\.get\("([^"]+)"\)/g);
    assert.ok(used.length > 0, "app.js reads no form field");

    const missing = used.filter((name) => !fieldNames.has(name));
    assert.deepEqual(missing, [], `missing name attributes in index.html: ${missing.join(", ")}`);
  });

  it("only calls endpoints the simulator provides", () => {
    const known = [
      "/v1/charge",
      "/v1/transactions",
      "/v1/simulate/pay",
      "/v1/simulate/fail",
      "/v1/simulate/expire",
    ];
    const used = matches(script, /"(\/v1\/[^"]*)"/g);

    for (const endpoint of used) {
      // Dynamic URLs like "/v1/simulate/" + action are checked in the next test.
      const path = endpoint.split("?")[0] ?? endpoint;
      const dynamic = path.endsWith("/");
      const valid = dynamic || known.includes(path);
      assert.ok(valid, `dashboard calls an unknown endpoint: ${endpoint}`);
    }
  });

  it("dashboard action buttons point at real endpoints", () => {
    const known = new Set(["/v1/simulate/pay", "/v1/simulate/fail", "/v1/simulate/expire"]);
    const actions = matches(script, /actionButton\("[^"]+",\s*"([^"]+)"/g);

    assert.ok(actions.length > 0, "no action buttons found");
    for (const action of actions) {
      assert.ok(known.has(`/v1/simulate/${action}`), `unknown simulation action: ${action}`);
    }
  });
});

describe("dashboard serving", () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("serves index.html and app.js when DASHBOARD_ENABLED is true", async () => {
    app = await buildApp(makeConfig({ DASHBOARD_ENABLED: "true" }), {
      queue: new MemoryWebhookQueue(),
      clock: manualClock().now,
      startBackground: false,
    });

    const page = await app.inject({ method: "GET", url: "/" });
    assert.equal(page.statusCode, 200);
    assert.match(page.headers["content-type"] as string, /text\/html/);
    assert.ok(page.body.includes("/app.js"));

    const asset = await app.inject({ method: "GET", url: "/app.js" });
    assert.equal(asset.statusCode, 200);
    assert.match(asset.headers["content-type"] as string, /javascript/);
  });

  it("does not serve the dashboard when DASHBOARD_ENABLED is false", async () => {
    app = await buildApp(makeConfig({ DASHBOARD_ENABLED: "false" }), {
      queue: new MemoryWebhookQueue(),
      clock: manualClock().now,
      startBackground: false,
    });

    const page = await app.inject({ method: "GET", url: "/" });
    assert.equal(page.statusCode, 404);
  });
});
