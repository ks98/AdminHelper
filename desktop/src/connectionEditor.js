import {
  normalizeConnection,
  parseTags,
  validateConnection,
} from "./connectionModel.js";

export function initEditor(state, t, callbacks, apiFactory, passwordApiFactory) {
  const editorEl = document.getElementById("editor");
  const formTitle = document.getElementById("formTitle");
  const saveBtn = document.getElementById("saveBtn");
  const deleteBtn = document.getElementById("deleteBtn");
  const connectBtn = document.getElementById("connectBtn");
  const closeBtn = document.getElementById("closeBtn");
  const fieldName = document.getElementById("fieldName");
  const fieldKind = document.getElementById("fieldKind");
  const fieldHost = document.getElementById("fieldHost");
  const fieldPort = document.getElementById("fieldPort");
  const fieldUsername = document.getElementById("fieldUsername");
  const fieldDomain = document.getElementById("fieldDomain");
  const fieldTrustCert = document.getElementById("fieldTrustCert");
  const fieldKeyPath = document.getElementById("fieldKeyPath");
  const fieldUrl = document.getElementById("fieldUrl");
  const fieldNotes = document.getElementById("fieldNotes");
  const fieldTags = document.getElementById("fieldTags");
  const fieldLastUsed = document.getElementById("fieldLastUsed");
  const fieldWrappers = Array.from(document.querySelectorAll(".field"));

  let api = null;
  let passwordApi = null;

  function ensureApi() {
    if (!api) api = apiFactory();
    if (!passwordApi) passwordApi = passwordApiFactory();
  }

  // ── Form helpers ────────────────────────────────────────────────────

  function toggleFields(kind) {
    fieldWrappers.forEach((wrapper) => {
      const only = wrapper.dataset.only;
      if (!only) {
        wrapper.classList.remove("hidden");
        return;
      }
      if (only === kind) {
        wrapper.classList.remove("hidden");
      } else {
        wrapper.classList.add("hidden");
      }
    });
  }

  function setForm(connection) {
    const normalized = normalizeConnection(connection || {});
    fieldName.value = normalized.name || "";
    fieldKind.value = normalized.kind || "ssh";
    fieldHost.value = normalized.host || "";
    fieldPort.value = normalized.port || "";
    fieldUsername.value = normalized.username || "";
    fieldDomain.value = normalized.domain || "";
    fieldTrustCert.checked = Boolean(normalized.trustCert);
    fieldKeyPath.value = normalized.keyPath || "";
    fieldUrl.value = normalized.url || "";
    fieldNotes.value = normalized.notes || "";
    fieldTags.value = normalized.tags ? normalized.tags.join(", ") : "";
    fieldLastUsed.textContent = normalized.lastUsed ? new Date(normalized.lastUsed).toLocaleString() : "-";
    toggleFields(normalized.kind);
  }

  function collectForm() {
    return normalizeConnection({
      id: state.selectedId || crypto.randomUUID(),
      name: fieldName.value,
      kind: fieldKind.value,
      host: fieldHost.value,
      port: fieldPort.value,
      username: fieldUsername.value,
      domain: fieldDomain.value,
      trustCert: fieldTrustCert.checked,
      keyPath: fieldKeyPath.value,
      url: fieldUrl.value,
      notes: fieldNotes.value,
      tags: parseTags(fieldTags.value),
      lastUsed: callbacks.getSelectedConnection()?.lastUsed || null
    });
  }

  // ── Editor lifecycle ────────────────────────────────────────────────

  function openEditor(connection) {
    const nextConnection = connection || { kind: "ssh" };
    state.selectedId = connection?.id || null;
    formTitle.textContent = connection?.name || t("editor.new");
    deleteBtn.disabled = !connection;
    setForm(nextConnection);
    editorEl.classList.remove("hidden");
    editorEl.setAttribute("aria-hidden", "false");
    callbacks.renderConnections();
    callbacks.clearStatus();
  }

  function closeEditor(options = {}) {
    const { preserveStatus = false } = options;
    editorEl.classList.add("hidden");
    editorEl.setAttribute("aria-hidden", "true");
    state.selectedId = null;
    callbacks.renderConnections();
    if (!preserveStatus) {
      callbacks.clearStatus();
    }
  }

  // ── CRUD handlers ───────────────────────────────────────────────────

  async function handleSave() {
    ensureApi();
    if (callbacks.isSyncLocked()) {
      callbacks.reportSyncLocked();
      return;
    }
    const connection = collectForm();
    const validation = validateConnection(connection, t);
    if (!validation.ok) {
      callbacks.showStatus(validation.message, true);
      return;
    }

    const existingIndex = state.connections.findIndex((item) => item.id === connection.id);
    if (existingIndex >= 0) {
      state.connections[existingIndex] = connection;
    } else {
      state.connections.push(connection);
    }

    await api.save(state.connections);
    callbacks.showStatus(t("status.saved"));
    state.selectedId = connection.id;
    formTitle.textContent = connection.name || t("editor.connection");
    callbacks.renderConnections();
  }

  async function handleDelete() {
    ensureApi();
    if (callbacks.isSyncLocked()) {
      callbacks.reportSyncLocked();
      return;
    }
    const selected = callbacks.getSelectedConnection();
    if (!selected) {
      return;
    }
    state.connections = state.connections.filter((item) => item.id !== selected.id);
    await api.save(state.connections);
    if (selected.kind === "rdp") {
      try {
        await passwordApi.delete(selected);
      } catch (error) {
        callbacks.reportError(t("error.passwordStore", { message: error.message || error }));
      }
    }
    callbacks.showStatus(t("status.deleted"));
    closeEditor();
  }

  async function handleConnect() {
    const connection = collectForm();
    await callbacks.initiateConnect(connection, true);
  }

  // ── Event listeners ─────────────────────────────────────────────────

  fieldKind.addEventListener("change", () => {
    toggleFields(fieldKind.value);
  });

  saveBtn.addEventListener("click", (event) => {
    event.preventDefault();
    handleSave();
  });

  deleteBtn.addEventListener("click", (event) => {
    event.preventDefault();
    handleDelete();
  });

  connectBtn.addEventListener("click", (event) => {
    event.preventDefault();
    handleConnect();
  });

  closeBtn.addEventListener("click", (event) => {
    event.preventDefault();
    closeEditor();
  });

  editorEl.addEventListener("click", (event) => {
    const target = event.target;
    if (target instanceof HTMLElement && target.dataset.action === "close") {
      closeEditor();
    }
  });

  return { openEditor, closeEditor, setForm };
}
