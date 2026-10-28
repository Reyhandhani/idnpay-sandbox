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

describe("konsistensi dashboard", () => {
  it("setiap elemen yang diambil lewat getElementById ada di HTML", () => {
    const used = matches(script, /getElementById\("([^"]+)"\)/g);
    assert.ok(used.length > 0, "app.js tidak mengambil elemen apa pun");

    const missing = used.filter((id) => !elementIds.has(id));
    assert.deepEqual(missing, [], `id tidak ditemukan di index.html: ${missing.join(", ")}`);
  });

  it("setiap field form yang dibaca app.js punya atribut name di HTML", () => {
    const used = matches(script, /form\.get\("([^"]+)"\)/g);
    assert.ok(used.length > 0, "app.js tidak membaca field form apa pun");

    const missing = used.filter((name) => !fieldNames.has(name));
    assert.deepEqual(missing, [], `name tidak ditemukan di index.html: ${missing.join(", ")}`);
  });

  it("hanya memanggil endpoint yang memang disediakan simulator", () => {
    const known = [
      "/v1/charge",
      "/v1/transactions",
      "/v1/simulate/pay",
      "/v1/simulate/fail",
      "/v1/simulate/expire",
    ];
    const used = matches(script, /"(\/v1\/[^"]*)"/g);

    for (const endpoint of used) {
      // URL dinamis seperti "/v1/simulate/" + action diperiksa di test berikutnya.
      const path = endpoint.split("?")[0] ?? endpoint;
      const dynamic = path.endsWith("/");
      const valid = dynamic || known.includes(path);
      assert.ok(valid, `dashboard memanggil endpoint yang tidak dikenal: ${endpoint}`);
    }
  });

  it("aksi simulasi di dashboard mengarah ke endpoint yang tersedia", () => {
    const known = new Set(["/v1/simulate/pay", "/v1/simulate/fail", "/v1/simulate/expire"]);
    const actions = matches(script, /actionButton\("[^"]+",\s*"([^"]+)"/g);

    assert.ok(actions.length > 0, "tidak ada tombol aksi yang ditemukan");
    for (const action of actions) {
      assert.ok(known.has(`/v1/simulate/${action}`), `aksi simulasi tidak dikenal: ${action}`);
    }
  });
});

describe("penyajian dashboard", () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("menyajikan index.html dan app.js saat DASHBOARD_ENABLED bernilai true", async () => {
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

  it("tidak menyajikan dashboard saat DASHBOARD_ENABLED bernilai false", async () => {
    app = await buildApp(makeConfig({ DASHBOARD_ENABLED: "false" }), {
      queue: new MemoryWebhookQueue(),
      clock: manualClock().now,
      startBackground: false,
    });

    const page = await app.inject({ method: "GET", url: "/" });
    assert.equal(page.statusCode, 404);
  });
});
