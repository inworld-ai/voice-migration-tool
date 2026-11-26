import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server.js";
import { proxy } from "./proxy.ts";

const call = (headers: Record<string, string>) =>
  proxy(new NextRequest("http://127.0.0.1:3000/api/voices", { method: "POST", headers }))?.status;

const ok = { host: "127.0.0.1:3000", "content-type": "application/json" };

test("allows same-origin JSON from a local host", () => {
  assert.equal(call({ ...ok, "sec-fetch-site": "same-origin" }), undefined);
  assert.equal(call({ ...ok, host: "LOCALHOST:3000", "content-type": "Application/JSON" }), undefined);
  assert.equal(call({ ...ok, host: "[::1]:3000" }), undefined);
});

test("rejects cross-site, non-JSON, and foreign-host requests", () => {
  assert.equal(call({ ...ok, "sec-fetch-site": "cross-site" }), 403);
  assert.equal(call({ ...ok, "sec-fetch-site": "same-site" }), 403);
  assert.equal(call({ ...ok, "content-type": "text/plain" }), 403);
  assert.equal(call({ "content-type": "application/json", host: "evil.example:3000" }), 403);
});
