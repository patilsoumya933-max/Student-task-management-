# Student Task Management System

A beginner-friendly full-stack coursework organizer. The responsive interface uses plain HTML, CSS, and JavaScript; an Express REST API validates and stores tasks in SQLite so they remain available after a server restart.

## Technology

- HTML5, CSS3, and vanilla JavaScript
- Node.js and Express 5
- SQLite using `better-sqlite3`
- Node's built-in test runner

## Project structure

```text
student_task_manager/
├── public/
│   ├── index.html       # Accessible dashboard and task form
│   ├── style.css        # Responsive styling
│   └── script.js        # Fetch-based browser interface
├── database/
│   └── tasks.sqlite     # Created automatically; ignored by Git
├── tests/
│   └── tasks.test.js    # REST API and persistence tests
├── database.js          # SQLite schema and database setup
├── server.js            # Express app, validation, and REST routes
├── package.json
├── package-lock.json
├── .gitignore
└── README.md
```

## Prerequisites

- Node.js 20.19 or later (an active LTS release is recommended)
- npm (included with Node.js)

`better-sqlite3` includes a native module. On the supported Windows, macOS, and Linux Node releases, npm normally downloads a prebuilt binary. If npm instead tries to compile it from source, install the platform's C/C++ build tools and Python required by `node-gyp`.

## Setup and run

Open a terminal in this project directory:

```powershell
npm.cmd install
npm.cmd start
```

Open <http://127.0.0.1:3000>. Press `Ctrl+C` in the server terminal to stop it. To choose another port, set `PORT` before starting the server, for example:

```powershell
$env:PORT = "3001"
npm.cmd start
```

For development, `npm.cmd run dev` uses Node's watch mode to restart the server when backend files change.

## Features

- Create, view, edit, complete, reopen, and delete tasks.
- Required title and due date with friendly browser validation and server-side validation.
- Low, Medium, or High priority.
- Summary counts for total, pending, completed, and overdue tasks.
- Overdue is calculated from the due date only for pending tasks; completed tasks never count as overdue.
- Loading states, live success/error messages, an empty state, and a responsive accessible layout.
- Parameterized SQLite statements, request size limits, and safe text rendering.

## REST API

All task endpoints return JSON except successful `DELETE`, which returns `204 No Content`.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Confirm the server is running |
| `GET` | `/api/tasks` | List tasks, ordered by due date |
| `GET` | `/api/tasks/:id` | Get one task |
| `POST` | `/api/tasks` | Create a pending task |
| `PUT` | `/api/tasks/:id` | Update task details (and optionally status) |
| `PATCH` | `/api/tasks/:id/status` | Change status to `pending` or `completed` |
| `DELETE` | `/api/tasks/:id` | Delete a task |

Task data uses JSON with camelCase API fields:

```json
{
  "title": "Submit biology lab report",
  "description": "Include observations from the microscope exercise.",
  "priority": "High",
  "dueDate": "2026-11-05"
}
```

Create request:

```http
POST /api/tasks
Content-Type: application/json
```

Successful response (`201 Created`):

```json
{
  "id": 1,
  "title": "Submit biology lab report",
  "description": "Include observations from the microscope exercise.",
  "priority": "High",
  "dueDate": "2026-11-05",
  "status": "pending",
  "createdAt": "2026-10-23T08:00:00.000Z",
  "updatedAt": "2026-10-23T08:00:00.000Z"
}
```

Update status:

```http
PATCH /api/tasks/1/status
Content-Type: application/json

{"status":"completed"}
```

Validation errors use an appropriate status and a readable JSON message, for example:

```json
{"error":"Choose a valid due date.","field":"dueDate"}
```

Invalid input returns `400`, missing task IDs return `404`, oversized JSON bodies return `413`, and unexpected server failures return `500` without exposing internal details.

## Database and persistence

On first startup, the server creates `database/tasks.sqlite` and the `tasks` table. SQLite stores an integer ID, title, description, priority, due date, status, and UTC creation/update timestamps. The database uses prepared statements and checks for valid priorities and statuses. The database file and its SQLite journal files are ignored by Git.

Task records live on the server, not in browser LocalStorage. Keep the `database/` folder when backing up or moving the app if you want to keep its tasks.

## Tests and verification

Run the API tests with:

```powershell
npm.cmd test
```

The automated tests cover health/list/create/read, edit, pending/completed status changes, delete, invalid input, malformed and oversized requests, unknown and missing routes, and persistence after closing and reopening the server/database.

Verification results for this implementation:

- `npm test`: 5 tests passed, 0 failed.
- A live browser session verified required-field validation, task creation/editing/deletion, completion status changes, overdue counts, completed-task overdue exclusion, the empty state, and a 375px-wide layout.
- The live API returned `400` with a field-specific JSON error for an intentionally invalid task request.
- The persistence test closed and restarted the server against the same SQLite file and confirmed the created record remained.
- `npm audit --omit=dev`: 0 production dependency vulnerabilities reported.

## Common errors and troubleshooting

- **`node` or `npm` is not recognized:** install Node.js LTS, then open a new terminal so it refreshes `PATH`.
- **PowerShell says `npm.ps1` cannot be loaded:** use `npm.cmd` in the commands above to avoid the PowerShell script execution policy.
- **Port 3000 is already in use:** set `PORT` to an available port and open that port in your browser.
- **`Cannot find module` after downloading the project:** run `npm install`.
- **Native `better-sqlite3` install failure:** use a supported Node.js LTS version; if npm is compiling from source, install the required C/C++ build tools and Python for `node-gyp`.
- **Tasks do not appear:** check that `npm start` is still running, then visit `/api/health`. The browser displays server/network errors in the dashboard.
- **Database is locked or cannot be opened:** stop other app instances using the same database and check write permissions on the `database/` folder.

## Known limitations

- This is a local, single-user app with no authentication, user accounts, sharing, or cloud synchronization.
- The development server binds to `127.0.0.1`; it is not configured for public hosting.
- Tasks are stored on the server machine. A different browser does not access the data unless it connects to that same running server.
- Due dates have calendar-day precision and no time or reminder notifications.
