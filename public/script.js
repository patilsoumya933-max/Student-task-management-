// The browser talks to the Express API; task records live in SQLite on the server.
const PRIORITIES = ["Low", "Medium", "High"];

const taskForm = document.querySelector("#task-form");
const formPanel = document.querySelector("#form-panel");
const taskList = document.querySelector("#task-list");
const announcement = document.querySelector("#announcement");
const formError = document.querySelector("#form-error");
const loadingMessage = document.querySelector("#loading-message");
const titleInput = document.querySelector("#task-title");
const dueDateInput = document.querySelector("#due-date");
const priorityInput = document.querySelector("#priority");
const descriptionInput = document.querySelector("#description");
const saveButton = document.querySelector("#save-button");

let tasks = [];
let editingTaskId = null;
let loading = false;

async function apiRequest(path, options = {}) {
  let response;
  try {
    response = await fetch(path, {
      ...options,
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...options.headers,
      },
    });
  } catch (error) {
    throw new Error("Could not reach the task server. Check that it is running and try again.");
  }

  if (response.status === 204) {
    return null;
  }

  let data;
  try {
    data = await response.json();
  } catch (error) {
    throw new Error("The server returned an unreadable response. Please try again.");
  }

  if (!response.ok) {
    throw new Error(data.error || `The request failed with status ${response.status}.`);
  }
  return data;
}

function showAnnouncement(message, isWarning = false) {
  announcement.textContent = message;
  announcement.classList.toggle("is-warning", isWarning);
}

function showFormError(message = "") {
  formError.textContent = message;
  formError.hidden = !message;
}

function setFormBusy(isBusy) {
  loading = isBusy;
  taskForm.setAttribute("aria-busy", String(isBusy));
  for (const control of taskForm.querySelectorAll("input, select, textarea, button")) {
    control.disabled = isBusy;
  }
  document.querySelector("#close-form-button").disabled = isBusy;
  document.querySelector("#new-task-button").disabled = isBusy;
  if (isBusy) {
    saveButton.textContent = "Saving...";
  } else {
    saveButton.textContent = editingTaskId === null ? "Add task" : "Save changes";
  }
}

function setListLoading(isLoading) {
  loadingMessage.hidden = !isLoading;
  taskList.hidden = isLoading;
  if (isLoading) {
    loadingMessage.textContent = "Loading your tasks...";
  }
}

function localDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getTaskStatus(task) {
  if (task.status === "completed") {
    return "completed";
  }
  return task.dueDate < localDateString() ? "overdue" : "pending";
}

function formatDate(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(year, month - 1, day));
}

function createElement(tagName, className, text) {
  const element = document.createElement(tagName);
  if (className) {
    element.className = className;
  }
  if (text !== undefined) {
    element.textContent = text;
  }
  return element;
}

function updateSummary() {
  const completed = tasks.filter((task) => task.status === "completed").length;
  const overdue = tasks.filter((task) => getTaskStatus(task) === "overdue").length;
  const pending = tasks.filter((task) => task.status === "pending").length;

  document.querySelector("#total-count").textContent = String(tasks.length);
  document.querySelector("#pending-count").textContent = String(pending);
  document.querySelector("#completed-count").textContent = String(completed);
  document.querySelector("#overdue-count").textContent = String(overdue);
  document.querySelector("#list-count").textContent =
    `${tasks.length} ${tasks.length === 1 ? "task" : "tasks"}`;
}

function makeTag(className, label) {
  return createElement("span", `tag ${className}`, label);
}

function makeTaskCard(task) {
  const status = getTaskStatus(task);
  const card = createElement("article", `task-card${task.status === "completed" ? " is-completed" : ""}`);
  const main = createElement("div", "task-main");
  const checkbox = createElement("input", "task-checkbox");
  checkbox.type = "checkbox";
  checkbox.checked = task.status === "completed";
  checkbox.disabled = loading;
  checkbox.setAttribute(
    "aria-label",
    task.status === "completed"
      ? `Mark ${task.title} as pending`
      : `Mark ${task.title} as completed`,
  );
  checkbox.addEventListener("change", () => toggleTaskStatus(task.id));

  const copy = createElement("div", "task-copy");
  copy.append(createElement("h3", "task-title", task.title));
  if (task.description) {
    copy.append(createElement("p", "task-description", task.description));
  }
  main.append(checkbox, copy);

  const actions = createElement("div", "task-actions");
  const editButton = createElement("button", "action-button", "Edit");
  editButton.type = "button";
  editButton.disabled = loading;
  editButton.setAttribute("aria-label", `Edit task: ${task.title}`);
  editButton.addEventListener("click", () => openEditForm(task.id));

  const deleteButton = createElement("button", "action-button delete-button", "Delete");
  deleteButton.type = "button";
  deleteButton.disabled = loading;
  deleteButton.setAttribute("aria-label", `Delete task: ${task.title}`);
  deleteButton.addEventListener("click", () => deleteTask(task.id));
  actions.append(editButton, deleteButton);

  const details = createElement("div", "task-details");
  const dueDate = createElement("time", "task-date", `Due ${formatDate(task.dueDate)}`);
  dueDate.dateTime = task.dueDate;
  const priority = makeTag(`priority-${task.priority.toLowerCase()}`, `${task.priority} priority`);
  const statusLabel = status === "completed"
    ? "Completed"
    : status === "overdue" ? "Overdue" : "Pending";
  const statusTag = makeTag(`status-${status}`, statusLabel);
  details.append(dueDate, priority, statusTag);

  card.append(main, actions, details);
  return card;
}

function renderTasks() {
  updateSummary();
  taskList.replaceChildren();

  if (tasks.length === 0) {
    const emptyState = createElement("div", "empty-state");
    emptyState.append(
      createElement("span", "empty-icon", "✓"),
      createElement("h3", "", "Your task list is clear"),
      createElement("p", "", "Add your first task and make a little progress today."),
    );
    taskList.append(emptyState);
    return;
  }

  const sortedTasks = [...tasks].sort((first, second) => {
    const statusOrder = { overdue: 0, pending: 1, completed: 2 };
    return statusOrder[getTaskStatus(first)] - statusOrder[getTaskStatus(second)]
      || first.dueDate.localeCompare(second.dueDate)
      || first.title.localeCompare(second.title);
  });

  const fragment = document.createDocumentFragment();
  for (const task of sortedTasks) {
    fragment.append(makeTaskCard(task));
  }
  taskList.append(fragment);
}

async function loadTasks({ showLoading = false } = {}) {
  if (showLoading) {
    setListLoading(true);
  }

  try {
    tasks = await apiRequest("/api/tasks");
    renderTasks();
    showAnnouncement("");
    return true;
  } catch (error) {
    showAnnouncement(error.message, true);
    taskList.replaceChildren();
    const errorState = createElement("div", "empty-state");
    errorState.append(
      createElement("span", "empty-icon", "!"),
      createElement("h3", "", "Could not load your tasks"),
      createElement("p", "", "Check the server connection, then try again."),
    );
    const retryButton = createElement("button", "button button-secondary", "Try again");
    retryButton.type = "button";
    retryButton.addEventListener("click", () => loadTasks({ showLoading: true }));
    errorState.append(retryButton);
    taskList.append(errorState);
    return false;
  } finally {
    setListLoading(false);
  }
}

function clearValidation() {
  titleInput.removeAttribute("aria-invalid");
  dueDateInput.removeAttribute("aria-invalid");
  document.querySelector("#title-error").textContent = "";
  document.querySelector("#date-error").textContent = "";
  showFormError();
}

function validateForm() {
  clearValidation();
  let valid = true;

  if (!titleInput.value.trim()) {
    titleInput.setAttribute("aria-invalid", "true");
    document.querySelector("#title-error").textContent = "Enter a task title.";
    valid = false;
  }

  if (!dueDateInput.value) {
    dueDateInput.setAttribute("aria-invalid", "true");
    document.querySelector("#date-error").textContent = "Choose a due date.";
    valid = false;
  }

  if (!valid) {
    showFormError("Please fix the highlighted fields.");
    (titleInput.getAttribute("aria-invalid") ? titleInput : dueDateInput).focus();
  }
  return valid;
}

function resetForm() {
  taskForm.reset();
  priorityInput.value = "Medium";
  editingTaskId = null;
  clearValidation();
  document.querySelector("#form-title").textContent = "Add a task";
  saveButton.textContent = "Add task";
}

function openCreateForm() {
  resetForm();
  formPanel.hidden = false;
  showAnnouncement("");
  titleInput.focus();
}

async function openEditForm(taskId) {
  showAnnouncement("");
  setFormBusy(true);
  try {
    const task = await apiRequest(`/api/tasks/${taskId}`);
    editingTaskId = task.id;
    titleInput.value = task.title;
    descriptionInput.value = task.description;
    dueDateInput.value = task.dueDate;
    priorityInput.value = task.priority;
    document.querySelector("#form-title").textContent = "Edit task";
    formPanel.hidden = false;
    showFormError();
    setFormBusy(false);
    saveButton.textContent = "Save changes";
    titleInput.focus();
  } catch (error) {
    editingTaskId = null;
    setFormBusy(false);
    showAnnouncement(error.message, true);
  }
}

function closeForm() {
  formPanel.hidden = true;
  setFormBusy(false);
  resetForm();
  document.querySelector("#new-task-button").focus();
}

async function saveTask(event) {
  event.preventDefault();
  if (loading || !validateForm()) {
    return;
  }

  const taskData = {
    title: titleInput.value.trim(),
    description: descriptionInput.value.trim(),
    dueDate: dueDateInput.value,
    priority: priorityInput.value,
  };
  const wasEditing = editingTaskId !== null;
  const path = wasEditing ? `/api/tasks/${editingTaskId}` : "/api/tasks";

  setFormBusy(true);
  showAnnouncement("");
  try {
    await apiRequest(path, {
      method: wasEditing ? "PUT" : "POST",
      body: JSON.stringify(taskData),
    });
    formPanel.hidden = true;
    resetForm();
    setFormBusy(false);
    showAnnouncement(wasEditing ? "Task updated." : "Task added.");
    if (!await loadTasks()) {
      showAnnouncement("Task was saved, but the updated list could not be loaded. Refresh to try again.", true);
    }
    document.querySelector("#new-task-button").focus();
  } catch (error) {
    setFormBusy(false);
    showAnnouncement(error.message, true);
  }
}

async function toggleTaskStatus(taskId) {
  if (loading) {
    return;
  }
  const task = tasks.find((savedTask) => savedTask.id === taskId);
  if (!task) {
    showAnnouncement("That task could not be found. Refresh the list and try again.", true);
    return;
  }

  showAnnouncement("");
  loading = true;
  renderTasks();
  try {
    await apiRequest(`/api/tasks/${taskId}/status`, {
      method: "PATCH",
      body: JSON.stringify({
        status: task.status === "completed" ? "pending" : "completed",
      }),
    });
    loading = false;
    if (!await loadTasks()) {
      showAnnouncement("Status was updated, but the task list could not be refreshed.", true);
    }
  } catch (error) {
    loading = false;
    await loadTasks();
    showAnnouncement(error.message, true);
  }
}

async function deleteTask(taskId) {
  if (loading) {
    return;
  }
  const task = tasks.find((savedTask) => savedTask.id === taskId);
  if (!task || !window.confirm(`Delete "${task.title}"? This cannot be undone.`)) {
    return;
  }

  showAnnouncement("");
  loading = true;
  renderTasks();
  try {
    await apiRequest(`/api/tasks/${taskId}`, { method: "DELETE" });
    loading = false;
    if (!await loadTasks()) {
      showAnnouncement("Task was deleted, but the task list could not be refreshed.", true);
      return;
    }
    showAnnouncement("Task deleted.");
  } catch (error) {
    loading = false;
    await loadTasks();
    showAnnouncement(error.message, true);
  }
}

document.querySelector("#new-task-button").addEventListener("click", openCreateForm);
document.querySelector("#close-form-button").addEventListener("click", closeForm);
document.querySelector("#cancel-button").addEventListener("click", closeForm);
taskForm.addEventListener("submit", saveTask);

loadTasks({ showLoading: true });
