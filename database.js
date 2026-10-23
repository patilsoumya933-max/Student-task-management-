const fs = require("node:fs");
const path = require("node:path");
const Database = require("better-sqlite3");

const DEFAULT_DATABASE_FILE = path.join(__dirname, "database", "tasks.sqlite");

function createDatabase(databaseFile = DEFAULT_DATABASE_FILE) {
  if (databaseFile !== ":memory:") {
    fs.mkdirSync(path.dirname(databaseFile), { recursive: true });
  }

  const database = new Database(databaseFile);
  database.pragma("foreign_keys = ON");
  database.pragma("journal_mode = WAL");

  database.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 120),
      description TEXT NOT NULL DEFAULT '' CHECK (length(description) <= 1000),
      priority TEXT NOT NULL CHECK (priority IN ('Low', 'Medium', 'High')),
      due_date TEXT NOT NULL CHECK (length(due_date) = 10),
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed')),
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE INDEX IF NOT EXISTS tasks_due_date_index ON tasks (due_date);
  `);

  return database;
}

module.exports = { createDatabase, DEFAULT_DATABASE_FILE };
