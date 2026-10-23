const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createDatabase } = require("../database");
const { createApp } = require("../server");

async function startServer(databaseFile) {
  const database = createDatabase(databaseFile);
  const server = createApp(database).listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });

  return {
    baseUrl: `http://127.0.0.1:${server.address().port}`,
    async close() {
      await new Promise((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
      database.close();
    },
  };
}

function validTask(overrides = {}) {
  return {
    title: "Read chapter three",
    description: "Take notes for biology.",
    priority: "Medium",
    dueDate: "2026-11-05",
    ...overrides,
  };
}

async function jsonRequest(baseUrl, endpoint, options = {}) {
  const response = await fetch(`${baseUrl}${endpoint}`, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });
  const body = response.status === 204 ? null : await response.json();
  return { response, body };
}

async function withServer(t, callback) {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "student-tasks-"));
  const databaseFile = path.join(temporaryDirectory, "tasks.sqlite");
  let instance = await startServer(databaseFile);
  t.after(async () => {
    if (instance) {
      await instance.close();
    }
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  });
  await callback({
    get baseUrl() {
      return instance.baseUrl;
    },
    async restart() {
      await instance.close();
      instance = await startServer(databaseFile);
    },
  });
}

test("health, task creation, task retrieval, and listing work", async (t) => {
  await withServer(t, async ({ baseUrl }) => {
    const health = await jsonRequest(baseUrl, "/api/health");
    assert.equal(health.response.status, 200);
    assert.deepEqual(health.body, { status: "ok" });

    const emptyList = await jsonRequest(baseUrl, "/api/tasks");
    assert.deepEqual(emptyList.body, []);

    const created = await jsonRequest(baseUrl, "/api/tasks", {
      method: "POST",
      body: JSON.stringify(validTask()),
    });
    assert.equal(created.response.status, 201);
    assert.equal(created.body.title, "Read chapter three");
    assert.equal(created.body.status, "pending");
    assert.ok(created.body.id > 0);
    assert.ok(created.body.createdAt);
    assert.ok(created.body.updatedAt);

    const listed = await jsonRequest(baseUrl, "/api/tasks");
    assert.equal(listed.body.length, 1);
    assert.equal(listed.body[0].id, created.body.id);

    const fetched = await jsonRequest(baseUrl, `/api/tasks/${created.body.id}`);
    assert.equal(fetched.response.status, 200);
    assert.equal(fetched.body.description, "Take notes for biology.");
  });
});

test("tasks can be edited, marked completed or pending, and deleted", async (t) => {
  await withServer(t, async ({ baseUrl }) => {
    const created = await jsonRequest(baseUrl, "/api/tasks", {
      method: "POST",
      body: JSON.stringify(validTask()),
    });
    const id = created.body.id;

    const updated = await jsonRequest(baseUrl, `/api/tasks/${id}`, {
      method: "PUT",
      body: JSON.stringify(validTask({
        title: "Submit lab report",
        priority: "High",
        status: "completed",
      })),
    });
    assert.equal(updated.response.status, 200);
    assert.equal(updated.body.title, "Submit lab report");
    assert.equal(updated.body.priority, "High");
    assert.equal(updated.body.status, "completed");

    const pending = await jsonRequest(baseUrl, `/api/tasks/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status: "pending" }),
    });
    assert.equal(pending.response.status, 200);
    assert.equal(pending.body.status, "pending");

    const completed = await jsonRequest(baseUrl, `/api/tasks/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status: "completed" }),
    });
    assert.equal(completed.body.status, "completed");

    const removed = await jsonRequest(baseUrl, `/api/tasks/${id}`, { method: "DELETE" });
    assert.equal(removed.response.status, 204);
    assert.equal(removed.body, null);
    assert.equal((await jsonRequest(baseUrl, `/api/tasks/${id}`)).response.status, 404);
  });
});

test("server validation rejects invalid task fields and status", async (t) => {
  await withServer(t, async ({ baseUrl }) => {
    const invalidTasks = [
      validTask({ title: "   " }),
      validTask({ title: "x".repeat(121) }),
      validTask({ dueDate: "2026-02-30" }),
      validTask({ dueDate: "not-a-date" }),
      validTask({ priority: "Urgent" }),
      validTask({ description: "x".repeat(1001) }),
    ];

    for (const task of invalidTasks) {
      const result = await jsonRequest(baseUrl, "/api/tasks", {
        method: "POST",
        body: JSON.stringify(task),
      });
      assert.equal(result.response.status, 400);
      assert.equal(typeof result.body.error, "string");
    }

    const invalidStatus = await jsonRequest(baseUrl, "/api/tasks", {
      method: "POST",
      body: JSON.stringify(validTask({ status: "overdue" })),
    });
    assert.equal(invalidStatus.response.status, 400);
    assert.match(invalidStatus.body.error, /Status/);

    const missingTitle = await jsonRequest(baseUrl, "/api/tasks", {
      method: "POST",
      body: JSON.stringify({ dueDate: "2026-11-05", priority: "Low" }),
    });
    assert.equal(missingTitle.response.status, 400);
    assert.equal(missingTitle.body.field, "title");
    assert.deepEqual((await jsonRequest(baseUrl, "/api/tasks")).body, []);
  });
});

test("API reports malformed JSON, oversized requests, missing tasks, and unknown routes", async (t) => {
  await withServer(t, async ({ baseUrl }) => {
    const malformed = await fetch(`${baseUrl}/api/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });
    assert.equal(malformed.status, 400);
    assert.match((await malformed.json()).error, /valid JSON/);

    const oversized = await fetch(`${baseUrl}/api/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validTask({ description: "x".repeat(40_000) })),
    });
    assert.equal(oversized.status, 413);

    assert.equal((await jsonRequest(baseUrl, "/api/tasks/999999")).response.status, 404);
    assert.equal((await jsonRequest(baseUrl, "/api/tasks/not-an-id")).response.status, 400);
    const unknown = await jsonRequest(baseUrl, "/api/no-such-route");
    assert.equal(unknown.response.status, 404);
    assert.match(unknown.body.error, /endpoint not found/i);
  });
});

test("task data persists after closing and restarting the server", async (t) => {
  await withServer(t, async (server) => {
    const created = await jsonRequest(server.baseUrl, "/api/tasks", {
      method: "POST",
      body: JSON.stringify(validTask({ title: "Persistent task" })),
    });
    assert.equal(created.response.status, 201);

    await server.restart();
    const afterRestart = await jsonRequest(server.baseUrl, "/api/tasks");
    assert.equal(afterRestart.body.length, 1);
    assert.equal(afterRestart.body[0].title, "Persistent task");
    assert.equal(afterRestart.body[0].id, created.body.id);
  });
});
