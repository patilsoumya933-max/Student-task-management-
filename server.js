const path = require("node:path");
const express = require("express");
const { createDatabase } = require("./database");

const PORT = Number.parseInt(process.env.PORT || "3000", 10);
const PUBLIC_DIRECTORY = path.join(__dirname, "public");
const PRIORITIES = new Set(["Low", "Medium", "High"]);
const STATUSES = new Set(["pending", "completed"]);
const TASK_SELECT = `
  SELECT
    id,
    title,
    description,
    priority,
    due_date AS dueDate,
    status,
    created_at AS createdAt,
    updated_at AS updatedAt
  FROM tasks
`;

function isValidDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);
  if (year < 1 || month < 1 || month > 12) {
    return false;
  }

  const isLeapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, isLeapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= daysInMonth[month - 1];
}

function validateTask(body, currentStatus = "pending") {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return { error: "Request body must be a JSON object." };
  }

  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (title.length === 0) {
    return { error: "Enter a task title.", field: "title" };
  }
  if (title.length > 120) {
    return { error: "Task title must be 120 characters or fewer.", field: "title" };
  }

  const description = body.description === undefined ? "" : body.description;
  if (typeof description !== "string") {
    return { error: "Description must be text.", field: "description" };
  }
  if (description.length > 1000) {
    return { error: "Description must be 1,000 characters or fewer.", field: "description" };
  }

  if (!PRIORITIES.has(body.priority)) {
    return { error: "Choose Low, Medium, or High priority.", field: "priority" };
  }
  if (!isValidDate(body.dueDate)) {
    return { error: "Choose a valid due date.", field: "dueDate" };
  }

  const status = body.status === undefined ? currentStatus : body.status;
  if (!STATUSES.has(status)) {
    return { error: "Status must be pending or completed.", field: "status" };
  }

  return {
    value: {
      title,
      description: description.trim(),
      priority: body.priority,
      dueDate: body.dueDate,
      status,
    },
  };
}

function parseTaskId(value) {
  if (!/^[1-9]\d*$/.test(value)) {
    return null;
  }
  const id = Number(value);
  return Number.isSafeInteger(id) ? id : null;
}

function createApp(database = createDatabase()) {
  const app = express();

  app.disable("x-powered-by");
  app.use(express.json({ limit: "32kb" }));
  app.use(express.static(PUBLIC_DIRECTORY));

  app.get("/api/health", (_request, response) => {
    response.json({ status: "ok" });
  });

  app.get("/api/tasks", (_request, response) => {
    const tasks = database.prepare(`${TASK_SELECT} ORDER BY due_date ASC, id ASC`).all();
    response.json(tasks);
  });

  app.get("/api/tasks/:id", (request, response) => {
    const id = parseTaskId(request.params.id);
    if (id === null) {
      return response.status(400).json({ error: "Task ID must be a positive integer." });
    }

    const task = database.prepare(`${TASK_SELECT} WHERE id = ?`).get(id);
    if (!task) {
      return response.status(404).json({ error: "Task not found." });
    }
    return response.json(task);
  });

  app.post("/api/tasks", (request, response) => {
    const validation = validateTask(request.body);
    if (validation.error) {
      return response.status(400).json(validation);
    }

    const task = validation.value;
    const result = database.prepare(`
      INSERT INTO tasks (title, description, priority, due_date, status)
      VALUES (@title, @description, @priority, @dueDate, @status)
    `).run(task);
    const created = database.prepare(`${TASK_SELECT} WHERE id = ?`).get(result.lastInsertRowid);
    return response.status(201).json(created);
  });

  app.put("/api/tasks/:id", (request, response) => {
    const id = parseTaskId(request.params.id);
    if (id === null) {
      return response.status(400).json({ error: "Task ID must be a positive integer." });
    }

    const current = database.prepare(`${TASK_SELECT} WHERE id = ?`).get(id);
    if (!current) {
      return response.status(404).json({ error: "Task not found." });
    }

    const validation = validateTask(request.body, current.status);
    if (validation.error) {
      return response.status(400).json(validation);
    }

    database.prepare(`
      UPDATE tasks
      SET title = @title,
          description = @description,
          priority = @priority,
          due_date = @dueDate,
          status = @status,
          updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE id = @id
    `).run({ ...validation.value, id });
    return response.json(database.prepare(`${TASK_SELECT} WHERE id = ?`).get(id));
  });

  app.patch("/api/tasks/:id/status", (request, response) => {
    const id = parseTaskId(request.params.id);
    if (id === null) {
      return response.status(400).json({ error: "Task ID must be a positive integer." });
    }
    if (request.body === null || typeof request.body !== "object" || Array.isArray(request.body)) {
      return response.status(400).json({ error: "Request body must be a JSON object." });
    }
    if (!STATUSES.has(request.body.status)) {
      return response.status(400).json({
        error: "Status must be pending or completed.",
        field: "status",
      });
    }

    const result = database.prepare(`
      UPDATE tasks
      SET status = @status,
          updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE id = @id
    `).run({ id, status: request.body.status });
    if (result.changes === 0) {
      return response.status(404).json({ error: "Task not found." });
    }
    return response.json(database.prepare(`${TASK_SELECT} WHERE id = ?`).get(id));
  });

  app.delete("/api/tasks/:id", (request, response) => {
    const id = parseTaskId(request.params.id);
    if (id === null) {
      return response.status(400).json({ error: "Task ID must be a positive integer." });
    }

    const result = database.prepare("DELETE FROM tasks WHERE id = ?").run(id);
    if (result.changes === 0) {
      return response.status(404).json({ error: "Task not found." });
    }
    return response.status(204).end();
  });

  app.use("/api", (_request, response) => {
    response.status(404).json({ error: "API endpoint not found." });
  });

  app.use((error, _request, response, _next) => {
    if (error instanceof SyntaxError && error.status === 400 && "body" in error) {
      return response.status(400).json({ error: "Request body must contain valid JSON." });
    }
    if (error.type === "entity.too.large") {
      return response.status(413).json({ error: "Request body must be 32 KB or smaller." });
    }

    console.error("Request failed:", error);
    return response.status(500).json({ error: "An unexpected server error occurred." });
  });

  return app;
}

if (require.main === module) {
  const database = createDatabase();
  const app = createApp(database);
  const server = app.listen(PORT, "127.0.0.1", () => {
    console.log(`Student Task Manager is running at http://127.0.0.1:${PORT}`);
    console.log("SQLite database:", path.join(__dirname, "database", "tasks.sqlite"));
  });

  function shutDown() {
    server.close(() => {
      database.close();
      console.log("Server stopped.");
    });
  }

  process.on("SIGINT", shutDown);
  process.on("SIGTERM", shutDown);
}

module.exports = { createApp, isValidDate, parseTaskId, validateTask };
