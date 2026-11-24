"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {
    DEFAULT_DURATIONS,
    MAX_VISIBLE_TOASTS,
    normalizeToastOptions,
    applyToastQueueUpdate,
} = require("../public/toast");

test("normalizeToastOptions applies defaults by notification type and validates input", () => {
    const s = normalizeToastOptions({ type: "success", title: "Assets Ready", message: "Found 8 files" });
    assert.equal(s.type, "success");
    assert.equal(s.title, "Assets Ready");
    assert.equal(s.message, "Found 8 files");
    assert.equal(s.durationMs, DEFAULT_DURATIONS.success);
    assert.ok(s.id.startsWith("toast-"));

    const e = normalizeToastOptions({ type: "error", message: "Network timeout" });
    assert.equal(e.type, "error");
    assert.equal(e.title, "Error");
    assert.equal(e.durationMs, DEFAULT_DURATIONS.error);

    const l = normalizeToastOptions({ id: "job-1", type: "loading", title: "Discovering…" });
    assert.equal(l.durationMs, 0);

    const fallback = normalizeToastOptions({ type: "bogus", message: "Plain text" });
    assert.equal(fallback.type, "info");
    assert.equal(fallback.title, "Info");
});

test("applyToastQueueUpdate updates matching task IDs in-place without duplicating", () => {
    let state = applyToastQueueUpdate([], {
        id: "model-discovery",
        type: "loading",
        title: "Discovering Models…",
        message: "Querying providers",
    });
    assert.equal(state.queue.length, 1);
    assert.equal(state.updatedExisting, false);

    state = applyToastQueueUpdate(state.queue, {
        id: "model-discovery",
        type: "success",
        title: "Models Loaded",
        message: "42 models online",
    });
    assert.equal(state.queue.length, 1);
    assert.equal(state.updatedExisting, true);
    assert.equal(state.queue[0].type, "success");
    assert.equal(state.queue[0].title, "Models Loaded");
    assert.equal(state.queue[0].durationMs, DEFAULT_DURATIONS.success);
});

test("applyToastQueueUpdate caps stack size and preserves active loading toasts when evicting", () => {
    let queue = [];
    queue = applyToastQueueUpdate(queue, { id: "l1", type: "loading", title: "Working" }).queue;
    queue = applyToastQueueUpdate(queue, { id: "t1", type: "info", title: "One" }).queue;
    queue = applyToastQueueUpdate(queue, { id: "t2", type: "success", title: "Two" }).queue;
    queue = applyToastQueueUpdate(queue, { id: "t3", type: "warning", title: "Three" }).queue;
    assert.equal(queue.length, MAX_VISIBLE_TOASTS);

    const next = applyToastQueueUpdate(queue, { id: "t4", type: "error", title: "Four" });
    assert.equal(next.queue.length, MAX_VISIBLE_TOASTS);
    assert.deepEqual(next.evictedIds, ["t1"]);
    assert.ok(next.queue.some((t) => t.id === "l1"), "Active loading toast must not be evicted before settled toasts");
    assert.ok(next.queue.some((t) => t.id === "t4"));
});
