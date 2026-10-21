import test from "node:test";
import assert from "node:assert/strict";
import { parseRoute, routeHref } from "./route.js";

test("empty or unknown hashes fall back to the dashboard", () => {
  assert.deepEqual(parseRoute(""), { view: "dashboard", query: "", statusFilter: "all" });
  assert.equal(parseRoute("#/nope").view, "dashboard");
  assert.equal(parseRoute(undefined).view, "dashboard");
});

test("history filters round-trip through the hash", () => {
  const route = { view: "history", query: "NVDA", statusFilter: "open" };
  const href = routeHref(route);
  assert.equal(href, "#/historial?q=NVDA&estado=abiertas");
  assert.deepEqual(parseRoute(href), route);
});

test("filters are dropped outside the history view and invalid values ignored", () => {
  assert.equal(routeHref({ view: "stats", query: "X", statusFilter: "closed" }), "#/estadisticas");
  assert.equal(parseRoute("#/historial?estado=raro").statusFilter, "all");
  assert.equal(parseRoute("#/historial?q=" + "A".repeat(50)).query.length, 20);
});
