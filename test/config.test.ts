import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ConfigError, loadConfig } from "../src/config/env";

describe("loadConfig", () => {
  it("uses defaults when environment variables are empty", () => {
    const config = loadConfig({});
    assert.equal(config.port, 9000);
    assert.equal(config.webhook.retryLimit, 5);
    assert.equal(config.webhook.timeoutMs, 5000);
    assert.equal(config.chargeExpiryMinutes, 60);
    assert.equal(config.redisUrl, undefined);
    assert.equal(config.usingDefaultKeys, true);
  });

  it("flags default keys only while they are unchanged", () => {
    const config = loadConfig({ CLIENT_KEY: "secret-client", SECRET_KEY: "secret-server" });
    assert.equal(config.usingDefaultKeys, false);
  });

  it("rejects a non-integer port", () => {
    assert.throws(
      () => loadConfig({ PORT: "sembilan" }),
      (error: unknown) => {
        assert.ok(error instanceof ConfigError);
        assert.match(error.message, /PORT/);
        return true;
      },
    );
  });

  it("rejects a failure rate outside 0 to 1", () => {
    assert.throws(() => loadConfig({ SIMULATED_FAILURE_RATE: "1.5" }), ConfigError);
  });

  it("reads the simulated failure rate and latency", () => {
    const config = loadConfig({ SIMULATED_FAILURE_RATE: "0.25", SIMULATED_LATENCY_MS: "300" });
    assert.equal(config.simulation.failureRate, 0.25);
    assert.equal(config.simulation.latencyMs, 300);
  });

  it("disables the dashboard only when DASHBOARD_ENABLED is false", () => {
    assert.equal(loadConfig({ DASHBOARD_ENABLED: "false" }).dashboardEnabled, false);
    assert.equal(loadConfig({}).dashboardEnabled, true);
  });
});
