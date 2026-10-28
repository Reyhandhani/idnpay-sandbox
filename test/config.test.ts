import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ConfigError, loadConfig } from "../src/config/env";

describe("loadConfig", () => {
  it("memakai nilai bawaan saat variabel lingkungan kosong", () => {
    const config = loadConfig({});
    assert.equal(config.port, 9000);
    assert.equal(config.webhook.retryLimit, 5);
    assert.equal(config.webhook.timeoutMs, 5000);
    assert.equal(config.chargeExpiryMinutes, 60);
    assert.equal(config.redisUrl, undefined);
    assert.equal(config.usingDefaultKeys, true);
  });

  it("menandai kunci bawaan hanya jika belum diganti", () => {
    const config = loadConfig({ CLIENT_KEY: "klien-rahasia", SECRET_KEY: "rahasia-server" });
    assert.equal(config.usingDefaultKeys, false);
  });

  it("menolak port yang bukan bilangan bulat", () => {
    assert.throws(
      () => loadConfig({ PORT: "sembilan" }),
      (error: unknown) => {
        assert.ok(error instanceof ConfigError);
        assert.match(error.message, /PORT/);
        return true;
      },
    );
  });

  it("menolak tingkat kegagalan di luar rentang 0 sampai 1", () => {
    assert.throws(() => loadConfig({ SIMULATED_FAILURE_RATE: "1.5" }), ConfigError);
  });

  it("membaca tingkat kegagalan dan latensi simulasi", () => {
    const config = loadConfig({ SIMULATED_FAILURE_RATE: "0.25", SIMULATED_LATENCY_MS: "300" });
    assert.equal(config.simulation.failureRate, 0.25);
    assert.equal(config.simulation.latencyMs, 300);
  });

  it("menonaktifkan dashboard hanya saat DASHBOARD_ENABLED bernilai false", () => {
    assert.equal(loadConfig({ DASHBOARD_ENABLED: "false" }).dashboardEnabled, false);
    assert.equal(loadConfig({}).dashboardEnabled, true);
  });
});
