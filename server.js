const express = require("express");
const Database = require("better-sqlite3");
const cors = require("cors");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ──────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ── Database Setup ──────────────────────────────────────────────────────────
const db = new Database(path.join(__dirname, "tasks.db"));

db.exec(`
  CREATE TABLE IF NOT EXISTS tasks (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    name      TEXT    NOT NULL,
    deadline  TEXT    NOT NULL,
    priority  TEXT    NOT NULL CHECK(priority IN ('high','medium','low')),
    done      INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

// ── Helpers ─────────────────────────────────────────────────────────────────
function rowToTask(row) {
  return {
    id:        row.id,
    name:      row.name,
    deadline:  row.deadline,
    priority:  row.priority,
    done:      row.done === 1,
    createdAt: row.created_at,
  };
}

function validate({ name, deadline, priority }) {
  const errors = [];
  if (!name || name.trim() === "")           errors.push("name is required");
  if (!deadline)                             errors.push("deadline is required");
  if (!["high","medium","low"].includes(priority)) errors.push("priority must be high | medium | low");
  return errors;
}

// ── Routes ───────────────────────────────────────────────────────────────────

/**
 * GET /api/tasks
 * Returns all tasks sorted by deadline (earliest first).
 */
app.get("/api/tasks", (req, res) => {
  try {
    const rows = db.prepare(
      "SELECT * FROM tasks ORDER BY deadline ASC, id ASC"
    ).all();
    res.json({ success: true, tasks: rows.map(rowToTask) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: "Failed to fetch tasks" });
  }
});

/**
 * GET /api/tasks/:id
 * Returns a single task.
 */
app.get("/api/tasks/:id", (req, res) => {
  try {
    const row = db.prepare("SELECT * FROM tasks WHERE id = ?").get(req.params.id);
    if (!row) return res.status(404).json({ success: false, error: "Task not found" });
    res.json({ success: true, task: rowToTask(row) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: "Failed to fetch task" });
  }
});

/**
 * POST /api/tasks
 * Body: { name, deadline, priority }
 * Creates a new task.
 */
app.post("/api/tasks", (req, res) => {
  try {
    const { name, deadline, priority } = req.body;
    const errors = validate({ name, deadline, priority });
    if (errors.length) return res.status(400).json({ success: false, errors });

    const info = db.prepare(
      "INSERT INTO tasks (name, deadline, priority) VALUES (?, ?, ?)"
    ).run(name.trim(), deadline, priority);

    const created = db.prepare("SELECT * FROM tasks WHERE id = ?").get(info.lastInsertRowid);
    res.status(201).json({ success: true, task: rowToTask(created) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: "Failed to create task" });
  }
});

/**
 * PATCH /api/tasks/:id
 * Body: { name?, deadline?, priority?, done? }
 * Partially updates a task.
 */
app.patch("/api/tasks/:id", (req, res) => {
  try {
    const existing = db.prepare("SELECT * FROM tasks WHERE id = ?").get(req.params.id);
    if (!existing) return res.status(404).json({ success: false, error: "Task not found" });

    const name     = req.body.name     !== undefined ? req.body.name.trim() : existing.name;
    const deadline = req.body.deadline !== undefined ? req.body.deadline    : existing.deadline;
    const priority = req.body.priority !== undefined ? req.body.priority    : existing.priority;
    const done     = req.body.done     !== undefined ? (req.body.done ? 1 : 0) : existing.done;

    const errors = validate({ name, deadline, priority });
    if (errors.length) return res.status(400).json({ success: false, errors });

    db.prepare(
      "UPDATE tasks SET name=?, deadline=?, priority=?, done=? WHERE id=?"
    ).run(name, deadline, priority, done, req.params.id);

    const updated = db.prepare("SELECT * FROM tasks WHERE id = ?").get(req.params.id);
    res.json({ success: true, task: rowToTask(updated) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: "Failed to update task" });
  }
});

/**
 * DELETE /api/tasks/:id
 * Deletes a task permanently.
 */
app.delete("/api/tasks/:id", (req, res) => {
  try {
    const existing = db.prepare("SELECT * FROM tasks WHERE id = ?").get(req.params.id);
    if (!existing) return res.status(404).json({ success: false, error: "Task not found" });

    db.prepare("DELETE FROM tasks WHERE id = ?").run(req.params.id);
    res.json({ success: true, message: "Task deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: "Failed to delete task" });
  }
});

/**
 * DELETE /api/tasks
 * Deletes all completed tasks (bulk cleanup).
 */
app.delete("/api/tasks", (req, res) => {
  try {
    const info = db.prepare("DELETE FROM tasks WHERE done = 1").run();
    res.json({ success: true, deleted: info.changes });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: "Failed to clear completed tasks" });
  }
});

// ── Fallback → serve frontend ────────────────────────────────────────────────
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log('✅  Task Manager API running on http://localhost:${PORT}');
  console.log(`   GET    /api/tasks          → list all tasks`);
  console.log(`   POST   /api/tasks          → create task`);
  console.log(`   PATCH  /api/tasks/:id      → update task`);
  console.log(`   DELETE /api/tasks/:id      → delete task`);
  console.log(`   DELETE /api/tasks          → clear completed tasks`);
});

module.exports = app; // for testing