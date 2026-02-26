(() => {
  const state = {
    connections: [],
    selectedId: null,
    filter: "all",
    search: "",
    view: "list"
  };

  const translations = {
    de: {
      "app.title": "Simple Remote Manager",
      "brand.title": "Simple Remote",
      "brand.subtitle": "Manager",
      "search.label": "Suchen",
      "search.placeholder": "Name, Host, URL",
      "settings.label": "Einstellungen",
      "settings.mode.local": "Lokal",
      "settings.mode.sync": "Sync",
      "connections.filter": "Filter",
      "connections.title": "Verbindungen",
      "connections.new": "Neue Verbindung",
      "filters.all": "Alle",
      "filters.ssh": "SSH",
      "filters.rdp": "RDP",
      "filters.web": "Web",
      "view.list": "Liste",
      "view.tree": "Baum",
      "footer.status.ready": "Bereit",
      "editor.eyebrow": "Details",
      "editor.new": "Neue Verbindung",
      "editor.connection": "Verbindung",
      "action.connect": "Verbinden",
      "action.save": "Speichern",
      "action.delete": "Loeschen",
      "action.close": "Schliessen",
      "action.cancel": "Abbrechen",
      "action.edit": "Bearbeiten",
      "field.name": "Name",
      "field.name.placeholder": "z.B. Prod Gateway",
      "field.kind": "Typ",
      "field.kind.web": "Webseite",
      "field.host": "Host",
      "field.host.placeholder": "server.example.com",
      "field.port": "Port",
      "field.port.placeholder": "Standard",
      "field.username": "Benutzer",
      "field.username.placeholder": "user",
      "field.domain": "Domaene",
      "field.domain.placeholder": "z.B. CONTOSO oder contoso.local",
      "field.trustCert": "Zertifikat vertrauen (unsicher)",
      "field.trustCert.help": "Ignoriert Zertifikatswarnungen beim RDP-Client.",
      "field.keyPath": "SSH Key Pfad",
      "field.keyPath.placeholder": "~/.ssh/id_ed25519",
      "field.url": "URL",
      "field.url.placeholder": "https://example.com",
      "field.notes": "Notizen",
      "field.notes.placeholder": "Kurzbeschreibung, Hinweise, Ablauf",
      "field.tags": "Tags",
      "field.tags.placeholder": "z.B. prod, mysql, vpn",
      "field.lastUsed": "Zuletzt genutzt",
      "security.eyebrow": "Sicherheit",
      "security.title": "Private Daten bleiben lokal",
      "security.body":
        "Passwoerter werden standardmaessig nicht gespeichert. Optional kannst du sie lokal im OS-Schluesselbund ablegen. SSH nutzt deine lokalen Keys, RDP laesst dich beim Start authentifizieren. Die Konfiguration wird lokal im Benutzerprofil abgelegt.",
      "security.tag.local": "Lokale Speicherung",
      "security.tag.noPasswordDb": "Keine Passwortdatenbank",
      "security.tag.osClients": "OS Standard Clients",
      "rdp.title": "Passwort eingeben",
      "rdp.hint": "Das Passwort wird nur fuer diese Verbindung verwendet und nicht gespeichert.",
      "rdp.hint.remember":
        "Das Passwort wird fuer diese Verbindung verwendet. Optional kannst du es lokal im OS-Schluesselbund speichern.",
      "rdp.remember": "Auf diesem Geraet speichern",
      "rdp.remember.help": "Nur lokal, niemals im Sync.",
      "prompt.username": "Benutzer",
      "prompt.username.placeholder": "user",
      "prompt.domain": "Domaene",
      "prompt.domain.placeholder": "z.B. CONTOSO",
      "prompt.password": "Passwort",
      "prompt.password.placeholder": "Passwort",
      "settings.title": "Einstellungen",
      "settings.mode.label": "Modus",
      "settings.url.label": "Sync URL (https)",
      "settings.url.placeholder": "https://example.com/connections.json",
      "settings.url.help": "Die JSON-Datei wird beim Start und regelmaessig geladen.",
      "settings.interval.label": "Sync Intervall (Minuten)",
      "settings.interval.help": "Mindestens 1 Minute, maximal 24 Stunden.",
      "settings.passwords.store": "Passwoerter lokal speichern (OS-Schluesselbund)",
      "settings.passwords.help": "Nur auf diesem Geraet, niemals im Sync.",
      "settings.language.label": "Sprache",
      "settings.language.de": "Deutsch",
      "settings.language.en": "Englisch",
      "tree.untagged": "Ohne Tag",
      "list.noName": "Ohne Namen",
      "tree.connections": "{count} Verbindungen",
      "status.saved": "Gespeichert.",
      "status.deleted": "Geloescht.",
      "status.connected": "Verbunden.",
      "status.rdpStarted": "RDP-Client gestartet.",
      "error.generic": "Fehler: {message}",
      "error.tauriOnly": "Connect ist nur in der Tauri-App verfuegbar.",
      "error.syncOnly": "Sync ist nur in der Tauri-App verfuegbar.",
      "error.syncLocked":
        "Im Sync-Modus sind lokale Aenderungen deaktiviert. Bitte auf Lokal umstellen, um Verbindungen zu bearbeiten oder anzulegen.",
      "error.loadConnections": "Konnte Verbindungen nicht laden.",
      "validation.name": "Bitte einen Namen vergeben.",
      "validation.url": "Bitte eine URL angeben.",
      "validation.host": "Bitte einen Host angeben.",
      "sync.success": "Sync erfolgreich.",
      "sync.error": "Sync Fehler: {message}",
      "sync.urlRequired": "Bitte eine Sync URL angeben.",
      "sync.httpsOnly": "Nur https:// URLs sind erlaubt.",
      "sync.intervalInvalid": "Bitte ein gueltiges Sync Intervall angeben.",
      "rdp.authFailed": "RDP Anmeldung fehlgeschlagen.",
      "error.passwordStore": "Passwortspeicher Fehler: {message}"
    },
    en: {
      "app.title": "Simple Remote Manager",
      "brand.title": "Simple Remote",
      "brand.subtitle": "Manager",
      "search.label": "Search",
      "search.placeholder": "Name, host, URL",
      "settings.label": "Settings",
      "settings.mode.local": "Local",
      "settings.mode.sync": "Sync",
      "connections.filter": "Filter",
      "connections.title": "Connections",
      "connections.new": "New Connection",
      "filters.all": "All",
      "filters.ssh": "SSH",
      "filters.rdp": "RDP",
      "filters.web": "Web",
      "view.list": "List",
      "view.tree": "Tree",
      "footer.status.ready": "Ready",
      "editor.eyebrow": "Details",
      "editor.new": "New Connection",
      "editor.connection": "Connection",
      "action.connect": "Connect",
      "action.save": "Save",
      "action.delete": "Delete",
      "action.close": "Close",
      "action.cancel": "Cancel",
      "action.edit": "Edit",
      "field.name": "Name",
      "field.name.placeholder": "e.g. Prod Gateway",
      "field.kind": "Type",
      "field.kind.web": "Website",
      "field.host": "Host",
      "field.host.placeholder": "server.example.com",
      "field.port": "Port",
      "field.port.placeholder": "Default",
      "field.username": "Username",
      "field.username.placeholder": "user",
      "field.domain": "Domain",
      "field.domain.placeholder": "e.g. CONTOSO or contoso.local",
      "field.trustCert": "Trust certificate (unsafe)",
      "field.trustCert.help": "Ignores certificate warnings in the RDP client.",
      "field.keyPath": "SSH key path",
      "field.keyPath.placeholder": "~/.ssh/id_ed25519",
      "field.url": "URL",
      "field.url.placeholder": "https://example.com",
      "field.notes": "Notes",
      "field.notes.placeholder": "Short description, notes, steps",
      "field.tags": "Tags",
      "field.tags.placeholder": "e.g. prod, mysql, vpn",
      "field.lastUsed": "Last used",
      "security.eyebrow": "Security",
      "security.title": "Private data stays local",
      "security.body":
        "Passwords are not stored by default. Optionally you can store them locally in the OS keychain. SSH uses your local keys, RDP asks you to authenticate on launch. The configuration is stored locally in your user profile.",
      "security.tag.local": "Local storage",
      "security.tag.noPasswordDb": "No password database",
      "security.tag.osClients": "Native OS clients",
      "rdp.title": "Enter password",
      "rdp.hint": "The password is only used for this connection and is not stored.",
      "rdp.hint.remember":
        "The password is used for this connection. Optionally you can store it locally in the OS keychain.",
      "rdp.remember": "Save on this device",
      "rdp.remember.help": "Local only, never synced.",
      "prompt.username": "Username",
      "prompt.username.placeholder": "user",
      "prompt.domain": "Domain",
      "prompt.domain.placeholder": "e.g. CONTOSO",
      "prompt.password": "Password",
      "prompt.password.placeholder": "Password",
      "settings.title": "Settings",
      "settings.mode.label": "Mode",
      "settings.url.label": "Sync URL (https)",
      "settings.url.placeholder": "https://example.com/connections.json",
      "settings.url.help": "The JSON file is loaded at startup and on a schedule.",
      "settings.interval.label": "Sync interval (minutes)",
      "settings.interval.help": "Minimum 1 minute, maximum 24 hours.",
      "settings.passwords.store": "Store passwords locally (OS keychain)",
      "settings.passwords.help": "Only on this device, never synced.",
      "settings.language.label": "Language",
      "settings.language.de": "German",
      "settings.language.en": "English",
      "tree.untagged": "Untagged",
      "list.noName": "Untitled",
      "tree.connections": "{count} connections",
      "status.saved": "Saved.",
      "status.deleted": "Deleted.",
      "status.connected": "Connected.",
      "status.rdpStarted": "RDP client launched.",
      "error.generic": "Error: {message}",
      "error.tauriOnly": "Connect is only available in the Tauri app.",
      "error.syncOnly": "Sync is only available in the Tauri app.",
      "error.syncLocked":
        "Local changes are disabled in Sync mode. Switch to Local to add or edit connections.",
      "error.loadConnections": "Could not load connections.",
      "validation.name": "Please provide a name.",
      "validation.url": "Please provide a URL.",
      "validation.host": "Please provide a host.",
      "sync.success": "Sync successful.",
      "sync.error": "Sync error: {message}",
      "sync.urlRequired": "Please provide a sync URL.",
      "sync.httpsOnly": "Only https:// URLs are allowed.",
      "sync.intervalInvalid": "Please provide a valid sync interval.",
      "rdp.authFailed": "RDP authentication failed.",
      "error.passwordStore": "Password store error: {message}"
    }
  };

  let currentLanguage = "de";

  const tauriInvoke =
    window.__TAURI__?.core?.invoke || window.__TAURI__?.tauri?.invoke || window.__TAURI__?.invoke;
  const isTauri = typeof tauriInvoke === "function";
  const tauriEvent = window.__TAURI__?.event;

  const listEl = document.getElementById("list");
  const treeEl = document.getElementById("tree");
  const counterEl = document.getElementById("counter");
  const statusEl = document.getElementById("status");
  const globalStatusEl = document.getElementById("globalStatus");
  const searchInput = document.getElementById("searchInput");
  const newBtn = document.getElementById("newBtn");
  const settingsBtn = document.getElementById("settingsBtn");
  const settingsModeBadge = document.getElementById("settingsModeBadge");
  const connectBtn = document.getElementById("connectBtn");
  const saveBtn = document.getElementById("saveBtn");
  const deleteBtn = document.getElementById("deleteBtn");
  const closeBtn = document.getElementById("closeBtn");
  const formTitle = document.getElementById("formTitle");
  const editorEl = document.getElementById("editor");
  const passwordPromptEl = document.getElementById("passwordPrompt");
  const passwordHint = document.getElementById("passwordHint");
  const passwordInput = document.getElementById("fieldPassword");
  const passwordRememberField = document.getElementById("passwordRememberField");
  const passwordRememberInput = document.getElementById("passwordRememberInput");
  const promptUsernameInput = document.getElementById("fieldPromptUsername");
  const promptDomainInput = document.getElementById("fieldPromptDomain");
  const passwordConfirmBtn = document.getElementById("passwordConfirmBtn");
  const passwordCancelBtn = document.getElementById("passwordCancelBtn");
  const settingsPromptEl = document.getElementById("settingsPrompt");
  const settingsSaveBtn = document.getElementById("settingsSaveBtn");
  const settingsCancelBtn = document.getElementById("settingsCancelBtn");
  const syncUrlField = document.getElementById("syncUrlField");
  const syncUrlInput = document.getElementById("syncUrlInput");
  const syncIntervalField = document.getElementById("syncIntervalField");
  const syncIntervalInput = document.getElementById("syncIntervalInput");
  const storePasswordsInput = document.getElementById("storePasswordsInput");
  const languageSelect = document.getElementById("languageSelect");

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

  const ua = navigator.userAgent.toLowerCase();
  const isLinux = ua.includes("linux");

  let pendingConnect = null;
  let syncTimer = null;
  let rdpStatusTimer = null;
  let rdpConnectId = 0;
  let rdpPendingId = null;
  let rdpErroredId = null;

  const DEFAULT_PORTS = {
    ssh: 22,
    rdp: 3389
  };

  function detectSystemLanguage() {
    const language = navigator.language || "";
    return language.toLowerCase().startsWith("de") ? "de" : "en";
  }

  function t(key, vars = {}) {
    const dict = translations[currentLanguage] || translations.en;
    const fallback = translations.en || {};
    let text = dict[key] || fallback[key] || key;
    text = text.replace(/\{(\w+)\}/g, (_, token) => {
      const value = vars[token];
      return value === undefined || value === null ? "" : String(value);
    });
    return text;
  }

  function applyTranslations() {
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const key = el.dataset.i18n;
      if (key) {
        el.textContent = t(key);
      }
    });
    document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
      const key = el.dataset.i18nPlaceholder;
      if (key) {
        el.setAttribute("placeholder", t(key));
      }
    });
    document.querySelectorAll("[data-i18n-aria]").forEach((el) => {
      const key = el.dataset.i18nAria;
      if (key) {
        el.setAttribute("aria-label", t(key));
      }
    });
    document.title = t("app.title");
  }

  function setLanguage(language) {
    const normalized = translations[language] ? language : "en";
    currentLanguage = normalized;
    document.documentElement.lang = normalized;
    if (state.settings) {
      state.settings.language = normalized;
    }
    applyTranslations();
    updateSettingsBadge((state.settings || getSettingsDefaults()).mode);
    if (!editorEl.classList.contains("hidden")) {
      const selected = getSelectedConnection();
      formTitle.textContent = selected?.name || (selected ? t("editor.connection") : t("editor.new"));
    }
    renderConnections();
  }

  const storageFallback = {
    load() {
      try {
        return JSON.parse(localStorage.getItem("rg-connections") || "[]");
      } catch (error) {
        return [];
      }
    },
    save(connections) {
      localStorage.setItem("rg-connections", JSON.stringify(connections));
    }
  };

  const settingsFallback = {
    load() {
      try {
        return JSON.parse(localStorage.getItem("rg-settings") || "{}");
      } catch (error) {
        return {};
      }
    },
    save(settings) {
      localStorage.setItem("rg-settings", JSON.stringify(settings));
    }
  };

  const api = {
    async load() {
      if (isTauri) {
        return await tauriInvoke("load_connections");
      }
      return storageFallback.load();
    },
    async save(connections) {
      if (isTauri) {
        await tauriInvoke("save_connections", { connections });
        return;
      }
      storageFallback.save(connections);
    },
    async connect(connection) {
      if (isTauri) {
        await tauriInvoke("open_connection", { connection, client: getClientInfo() });
        return;
      }
      alert(t("error.tauriOnly"));
    }
  };

  const settingsApi = {
    async load() {
      if (isTauri) {
        return await tauriInvoke("load_settings");
      }
      return settingsFallback.load();
    },
    async save(settings) {
      if (isTauri) {
        await tauriInvoke("save_settings", { settings });
        return;
      }
      settingsFallback.save(settings);
    },
    async sync(url) {
      if (isTauri) {
        return await tauriInvoke("sync_connections", { url });
      }
      throw new Error(t("error.syncOnly"));
    }
  };

  const passwordApi = {
    async state(connection) {
      if (isTauri) {
        return await tauriInvoke("password_state", { connection });
      }
      return { stored: false, password: null, canStore: false };
    },
    async save(connection, password) {
      if (isTauri) {
        await tauriInvoke("save_password", { connection, password });
      }
    },
    async delete(connection) {
      if (isTauri) {
        await tauriInvoke("delete_password", { connection });
      }
    }
  };
  async function connectWithPassword(connection, password) {
    if (isTauri) {
      await tauriInvoke("open_connection", { connection, password, client: getClientInfo() });
      return;
    }
    alert(t("error.tauriOnly"));
  }

  function getStatusTarget() {
    if (editorEl.classList.contains("hidden") && globalStatusEl) {
      return globalStatusEl;
    }
    return statusEl;
  }

  function showStatus(message, isError = false) {
    const target = getStatusTarget();
    if (!target) {
      return;
    }
    target.textContent = message;
    target.classList.add("show");
    target.style.border = `1px solid ${isError ? "rgba(248, 113, 113, 0.4)" : "rgba(34, 197, 94, 0.35)"}`;
    target.style.color = isError ? "#fca5a5" : "#bbf7d0";
  }

  function reportError(message) {
    if (editorEl.classList.contains("hidden") && !globalStatusEl) {
      alert(message);
    } else {
      showStatus(message, true);
    }
  }

  function getSettingsDefaults() {
    return {
      mode: "local",
      url: "",
      intervalMinutes: 1,
      language: detectSystemLanguage(),
      storePasswords: false
    };
  }

  function getSyncMode() {
    const selected = document.querySelector('input[name="syncMode"]:checked');
    return selected ? selected.value : "local";
  }

  function setSyncMode(mode) {
    document.querySelectorAll('input[name="syncMode"]').forEach((input) => {
      input.checked = input.value === mode;
    });
    syncUrlField.classList.toggle("hidden", mode !== "sync");
    syncIntervalField.classList.toggle("hidden", mode !== "sync");
  }

  function getIntervalMinutes(settings) {
    const raw = Number(settings?.intervalMinutes);
    if (!Number.isFinite(raw)) {
      return 1;
    }
    return Math.max(1, Math.min(1440, Math.round(raw)));
  }

  function updateSettingsBadge(mode) {
    if (settingsModeBadge) {
      settingsModeBadge.textContent = mode === "sync" ? t("settings.mode.sync") : t("settings.mode.local");
    }
    if (settingsBtn) {
      settingsBtn.dataset.mode = mode === "sync" ? "sync" : "local";
    }
  }

  function isSyncLocked() {
    return (state.settings || getSettingsDefaults()).mode === "sync";
  }

  function isPasswordStoreEnabled() {
    return Boolean((state.settings || getSettingsDefaults()).storePasswords);
  }

  function reportSyncLocked() {
    reportError(t("error.syncLocked"));
  }

  function clearRdpStatusTimer() {
    if (rdpStatusTimer) {
      clearTimeout(rdpStatusTimer);
      rdpStatusTimer = null;
    }
  }

  function startRdpStatus() {
    rdpConnectId += 1;
    rdpPendingId = rdpConnectId;
    rdpErroredId = null;
    clearRdpStatusTimer();
    return rdpConnectId;
  }

  function scheduleRdpStatus(connectId) {
    clearRdpStatusTimer();
    rdpStatusTimer = setTimeout(() => {
      if (rdpPendingId !== connectId || rdpErroredId === connectId) {
        return;
      }
      showStatus(t("status.rdpStarted"));
      rdpStatusTimer = null;
    }, 800);
  }

  function openSettingsPrompt() {
    const settings = state.settings || getSettingsDefaults();
    setSyncMode(settings.mode || "local");
    syncUrlInput.value = settings.url || "";
    syncIntervalInput.value = getIntervalMinutes(settings).toString();
    if (languageSelect) {
      languageSelect.value = settings.language || detectSystemLanguage();
    }
    if (storePasswordsInput) {
      storePasswordsInput.checked = Boolean(settings.storePasswords);
    }
    settingsPromptEl.classList.remove("hidden");
    settingsPromptEl.setAttribute("aria-hidden", "false");
  }

  function closeSettingsPrompt() {
    settingsPromptEl.classList.add("hidden");
    settingsPromptEl.setAttribute("aria-hidden", "true");
  }

  function stopSyncTimer() {
    if (syncTimer) {
      clearInterval(syncTimer);
      syncTimer = null;
    }
  }

  function startSyncTimer() {
    stopSyncTimer();
    const intervalMinutes = getIntervalMinutes(state.settings || getSettingsDefaults());
    syncTimer = setInterval(() => {
      syncNow(false);
    }, intervalMinutes * 60_000);
  }

  async function syncNow(showStatusMessage) {
    const settings = state.settings || getSettingsDefaults();
    if (settings.mode !== "sync" || !settings.url) {
      return;
    }
    try {
      const connections = await settingsApi.sync(settings.url);
      state.connections = Array.isArray(connections)
        ? connections.map((connection) => normalizeConnection(connection || {}))
        : [];
      renderConnections();
      if (showStatusMessage) {
        showStatus(t("sync.success"));
      }
    } catch (error) {
      if (showStatusMessage) {
        reportError(t("sync.error", { message: error.message || error }));
      }
    }
  }
  function getClientInfo() {
    const scaleFactor = window.devicePixelRatio || 1;
    return {
      screenWidth: window.screen.width,
      screenHeight: window.screen.height,
      scaleFactor
    };
  }

  function clearStatus() {
    if (statusEl) {
      statusEl.classList.remove("show");
    }
    if (globalStatusEl) {
      globalStatusEl.classList.remove("show");
    }
  }

  function normalizeConnection(connection) {
    const normalized = { ...connection };
    normalized.name = (normalized.name || "").trim();
    normalized.kind = normalized.kind || "ssh";
    normalized.host = (normalized.host || "").trim();
    normalized.username = (normalized.username || "").trim();
    normalized.domain = (normalized.domain || "").trim();
    normalized.keyPath = (normalized.keyPath || "").trim();
    normalized.url = (normalized.url || "").trim();
    normalized.notes = (normalized.notes || "").trim();
    normalized.trustCert = Boolean(normalized.trustCert);
    normalized.tags = Array.isArray(normalized.tags) ? normalized.tags : [];
    normalized.tags = normalized.tags
      .map((tag) => String(tag).trim())
      .filter((tag) => tag.length > 0);
    if (!normalized.port || Number.isNaN(Number(normalized.port))) {
      normalized.port = null;
    } else {
      normalized.port = Number(normalized.port);
    }
    return normalized;
  }

  function getSelectedConnection() {
    return state.connections.find((item) => item.id === state.selectedId) || null;
  }

  function toCardMeta(connection) {
    if (connection.kind === "web") {
      return connection.url || "-";
    }
    const host = connection.host || "-";
    const port = connection.port || DEFAULT_PORTS[connection.kind] || "-";
    const user = connection.username ? `${connection.username}@` : "";
    return `${user}${host}:${port}`;
  }

  function getFilteredConnections() {
    return state.connections
      .filter((connection) => state.filter === "all" || connection.kind === state.filter)
      .filter((connection) => {
        const tagText = (connection.tags || []).join(" ");
        const haystack = `${connection.name} ${connection.host} ${connection.url} ${connection.domain || ""} ${tagText}`.toLowerCase();
        return haystack.includes(state.search.toLowerCase());
      })
      .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
  }

  function buildConnectionCard(connection) {
    const card = document.createElement("div");
    card.className = `card ${connection.id === state.selectedId ? "active" : ""}`;
    card.dataset.id = connection.id;

    const cardMain = document.createElement("div");
    cardMain.className = "card-main";

    const title = document.createElement("div");
    title.className = "card-title";
    title.textContent = connection.name || t("list.noName");

    const meta = document.createElement("div");
    meta.className = "card-meta";
    meta.textContent = toCardMeta(connection);

    const typeTag = document.createElement("div");
    typeTag.className = "card-tag";
    typeTag.textContent = connection.kind.toUpperCase();

    cardMain.append(title, meta, typeTag);

    const tags = connection.tags || [];
    if (tags.length > 0) {
      const tagsBlock = document.createElement("div");
      tagsBlock.className = "card-tags";
      tags.forEach((tag) => {
        const tagEl = document.createElement("span");
        tagEl.className = "tag";
        tagEl.textContent = tag;
        tagsBlock.appendChild(tagEl);
      });
      cardMain.appendChild(tagsBlock);
    }

    const actions = document.createElement("div");
    actions.className = "card-actions";

    const connectBtn = document.createElement("button");
    connectBtn.className = "btn small accent";
    connectBtn.type = "button";
    connectBtn.dataset.action = "connect";
    connectBtn.textContent = t("action.connect");

    const editBtn = document.createElement("button");
    editBtn.className = "btn small ghost";
    editBtn.type = "button";
    editBtn.dataset.action = "edit";
    editBtn.textContent = t("action.edit");

    actions.append(connectBtn, editBtn);
    card.append(cardMain, actions);
    card.addEventListener("click", (event) => {
      if (event.target.closest("button")) {
        return;
      }
      openEditor(connection);
    });
    const connectAction = card.querySelector('[data-action="connect"]');
    const editAction = card.querySelector('[data-action="edit"]');
    connectAction.addEventListener("click", (event) => {
      event.preventDefault();
      initiateConnect(connection);
    });
    editAction.addEventListener("click", (event) => {
      event.preventDefault();
      if (isSyncLocked()) {
        reportSyncLocked();
        return;
      }
      openEditor(connection);
    });
    return card;
  }

  function renderList(filtered) {
    listEl.innerHTML = "";
    filtered.forEach((connection) => {
      listEl.appendChild(buildConnectionCard(connection));
    });
  }

  function renderTree(filtered) {
    const groups = new Map();
    const untaggedLabel = t("tree.untagged");
    filtered.forEach((connection) => {
      const tags = connection.tags && connection.tags.length > 0 ? connection.tags : [untaggedLabel];
      tags.forEach((tag) => {
        const key = tag.trim() || untaggedLabel;
        if (!groups.has(key)) {
          groups.set(key, []);
        }
        groups.get(key).push(connection);
      });
    });

    const sortedTags = Array.from(groups.keys()).sort((a, b) => a.localeCompare(b));
    treeEl.innerHTML = "";
    sortedTags.forEach((tag) => {
      const group = document.createElement("div");
      group.className = "tree-group";
      const countLabel = t("tree.connections", { count: groups.get(tag).length });
      const header = document.createElement("div");
      header.className = "tree-header";

      const tagEl = document.createElement("div");
      tagEl.className = "tree-tag";
      tagEl.textContent = tag;

      const toggle = document.createElement("div");
      toggle.className = "tree-toggle";

      const countEl = document.createElement("span");
      countEl.className = "tree-count";
      countEl.textContent = countLabel;

      toggle.appendChild(countEl);
      header.append(tagEl, toggle);

      const list = document.createElement("div");
      list.className = "tree-list";
      group.append(header, list);

      groups.get(tag).forEach((connection) => {
        const node = document.createElement("div");
        node.className = "tree-node";
        node.appendChild(buildConnectionCard(connection));
        list.appendChild(node);
      });
      header.addEventListener("click", () => {
        group.classList.toggle("open");
      });
      treeEl.appendChild(group);
    });
  }

  function renderConnections() {
    const filtered = getFilteredConnections();
    counterEl.textContent = String(filtered.length);
    listEl.classList.toggle("hidden", state.view !== "list");
    treeEl.classList.toggle("hidden", state.view !== "tree");
    if (state.view === "tree") {
      renderTree(filtered);
    } else {
      renderList(filtered);
    }
  }

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

  function parseTags(raw) {
    return raw
      .split(",")
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0);
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
      lastUsed: getSelectedConnection()?.lastUsed || null
    });
  }

  function openEditor(connection) {
    const nextConnection = connection || { kind: "ssh" };
    state.selectedId = connection?.id || null;
    formTitle.textContent = connection?.name || t("editor.new");
    deleteBtn.disabled = !connection;
    setForm(nextConnection);
    editorEl.classList.remove("hidden");
    editorEl.setAttribute("aria-hidden", "false");
    renderConnections();
    clearStatus();
  }

  function closeEditor(options = {}) {
    const { preserveStatus = false } = options;
    editorEl.classList.add("hidden");
    editorEl.setAttribute("aria-hidden", "true");
    state.selectedId = null;
    renderConnections();
    if (!preserveStatus) {
      clearStatus();
    }
  }

  function openPasswordPrompt(connection, keepEditorOpen, options = {}) {
    const { allowRemember = false } = options;
    pendingConnect = { connection, keepEditorOpen, allowRemember };
    promptUsernameInput.value = connection.username || "";
    promptDomainInput.value = connection.domain || "";
    passwordInput.value = "";
    if (passwordRememberInput) {
      passwordRememberInput.checked = false;
    }
    if (passwordRememberField) {
      passwordRememberField.classList.toggle("hidden", !allowRemember);
    }
    if (passwordHint) {
      const key = allowRemember ? "rdp.hint.remember" : "rdp.hint";
      passwordHint.dataset.i18n = key;
      passwordHint.textContent = t(key);
    }
    passwordPromptEl.classList.remove("hidden");
    passwordPromptEl.setAttribute("aria-hidden", "false");
    if (promptUsernameInput.value) {
      passwordInput.focus();
    } else {
      promptUsernameInput.focus();
    }
  }

  function closePasswordPrompt() {
    passwordPromptEl.classList.add("hidden");
    passwordPromptEl.setAttribute("aria-hidden", "true");
    pendingConnect = null;
    promptUsernameInput.value = "";
    promptDomainInput.value = "";
    passwordInput.value = "";
    if (passwordRememberInput) {
      passwordRememberInput.checked = false;
    }
  }

  async function handleSave() {
    if (isSyncLocked()) {
      reportSyncLocked();
      return;
    }
    const connection = collectForm();
    const validation = validate(connection);
    if (!validation.ok) {
      showStatus(validation.message, true);
      return;
    }

    const existingIndex = state.connections.findIndex((item) => item.id === connection.id);
    if (existingIndex >= 0) {
      state.connections[existingIndex] = connection;
    } else {
      state.connections.push(connection);
    }

    await api.save(state.connections);
    showStatus(t("status.saved"));
    state.selectedId = connection.id;
    formTitle.textContent = connection.name || t("editor.connection");
    renderConnections();
  }

  async function handleDelete() {
    if (isSyncLocked()) {
      reportSyncLocked();
      return;
    }
    const connection = getSelectedConnection();
    if (!connection) {
      return;
    }
    state.connections = state.connections.filter((item) => item.id !== connection.id);
    await api.save(state.connections);
    if (connection.kind === "rdp") {
      try {
        await passwordApi.delete(connection);
      } catch (error) {
        reportError(t("error.passwordStore", { message: error.message || error }));
      }
    }
    showStatus(t("status.deleted"));
    closeEditor();
  }

  async function handleConnect() {
    const connection = collectForm();
    await initiateConnect(connection, true);
  }

  async function connectWithStoredPassword(connection, keepEditorOpen) {
    if (isTauri) {
      await tauriInvoke("open_connection_stored", { connection, client: getClientInfo() });
    }
  }

  async function handleRdpAuth(connection, keepEditorOpen) {
    if (!isTauri) {
      return false;
    }

    if (isPasswordStoreEnabled()) {
      try {
        const pwState = await passwordApi.state(connection);
        if (!pwState.canStore) {
          return false;
        }
        if (pwState.stored) {
          await performConnectStored(connection, keepEditorOpen);
          return true;
        }
        openPasswordPrompt(connection, keepEditorOpen, { allowRemember: true });
        return true;
      } catch (error) {
        reportError(t("error.passwordStore", { message: error.message || error }));
      }
    }

    if (isLinux) {
      openPasswordPrompt(connection, keepEditorOpen, { allowRemember: false });
      return true;
    }

    return false;
  }

  async function initiateConnect(connection, keepEditorOpen = false) {
    const validation = validate(connection);
    if (!validation.ok) {
      showStatus(validation.message, true);
      return;
    }

    if (connection.kind === "rdp") {
      const handled = await handleRdpAuth(connection, keepEditorOpen);
      if (handled) {
        return;
      }
    }

    await performConnect(connection, null, keepEditorOpen);
  }

  async function performConnect(connection, password, keepEditorOpen) {
    try {
      let rdpId = null;
      if (connection.kind === "rdp") {
        rdpId = startRdpStatus();
        const promise = password ? connectWithPassword(connection, password) : api.connect(connection);
        promise.catch((error) => {
          if (rdpId !== null) {
            clearRdpStatusTimer();
            if (rdpPendingId === rdpId) {
              rdpErroredId = rdpId;
              rdpPendingId = null;
            }
          }
          const message = String(error?.message || error || "");
          reportError(t("error.generic", { message }));
        });
      } else {
        await api.connect(connection);
      }
      const index = state.connections.findIndex((item) => item.id === connection.id);
      const updated = { ...connection, lastUsed: new Date().toISOString() };
      if (index >= 0) {
        state.connections[index] = updated;
      } else {
        state.connections.push(updated);
      }
      await api.save(state.connections);
      state.selectedId = updated.id;
      setForm(updated);
      renderConnections();
      if (connection.kind === "rdp") {
        if (rdpId !== null) {
          scheduleRdpStatus(rdpId);
        }
      } else {
        showStatus(t("status.connected"));
      }
      if (!keepEditorOpen) {
        closeEditor({ preserveStatus: connection.kind === "rdp" });
      }
    } catch (error) {
      const message = String(error?.message || error || "");
      reportError(t("error.generic", { message }));
    }
  }

  async function performConnectStored(connection, keepEditorOpen) {
    try {
      let rdpId = null;
      if (connection.kind === "rdp") {
        rdpId = startRdpStatus();
        const promise = connectWithStoredPassword(connection, keepEditorOpen);
        promise.catch((error) => {
          if (rdpId !== null) {
            clearRdpStatusTimer();
            if (rdpPendingId === rdpId) {
              rdpErroredId = rdpId;
              rdpPendingId = null;
            }
          }
          const message = String(error?.message || error || "");
          reportError(t("error.generic", { message }));
        });
      } else {
        await connectWithStoredPassword(connection, keepEditorOpen);
      }
      const index = state.connections.findIndex((item) => item.id === connection.id);
      const updated = { ...connection, lastUsed: new Date().toISOString() };
      if (index >= 0) {
        state.connections[index] = updated;
      } else {
        state.connections.push(updated);
      }
      await api.save(state.connections);
      state.selectedId = updated.id;
      setForm(updated);
      renderConnections();
      if (connection.kind === "rdp") {
        if (rdpId !== null) {
          scheduleRdpStatus(rdpId);
        }
      } else {
        showStatus(t("status.connected"));
      }
      if (!keepEditorOpen) {
        closeEditor({ preserveStatus: connection.kind === "rdp" });
      }
    } catch (error) {
      const message = String(error?.message || error || "");
      reportError(t("error.generic", { message }));
    }
  }

  function validate(connection) {
    if (!connection.name) {
      return { ok: false, message: t("validation.name") };
    }
    if (connection.kind === "web") {
      if (!connection.url) {
        return { ok: false, message: t("validation.url") };
      }
      return { ok: true };
    }
    if (!connection.host) {
      return { ok: false, message: t("validation.host") };
    }
    return { ok: true };
  }

  function setFilter(filter) {
    state.filter = filter;
    document.querySelectorAll("[data-filter]").forEach((chip) => {
      chip.classList.toggle("active", chip.dataset.filter === filter);
    });
    renderConnections();
  }

  async function init() {
    setLanguage(getSettingsDefaults().language);
    try {
      const loadedSettings = await settingsApi.load();
      state.settings = { ...getSettingsDefaults(), ...loadedSettings };
      if (!loadedSettings.language) {
        state.settings.language = detectSystemLanguage();
        await settingsApi.save(state.settings);
      }
      setLanguage(state.settings.language || "de");
      setSyncMode(state.settings.mode || "local");
      updateSettingsBadge(state.settings.mode || "local");
      if (state.settings.mode === "sync") {
        await syncNow(false);
        startSyncTimer();
      }
      state.connections = await api.load();
      state.connections = Array.isArray(state.connections)
        ? state.connections.map((connection) => normalizeConnection(connection || {}))
        : [];
    } catch (error) {
      showStatus(t("error.loadConnections"), true);
      state.connections = [];
    }

    renderConnections();
  }

  if (tauriEvent?.listen) {
    tauriEvent.listen("rdp-error", (event) => {
      clearRdpStatusTimer();
      if (rdpPendingId !== null) {
        rdpErroredId = rdpPendingId;
        rdpPendingId = null;
      }
      const message = event?.payload || t("rdp.authFailed");
      reportError(String(message));
    });
  }

  searchInput.addEventListener("input", (event) => {
    state.search = event.target.value;
    renderConnections();
  });

  document.querySelectorAll("[data-filter]").forEach((chip) => {
    chip.addEventListener("click", () => setFilter(chip.dataset.filter));
  });

  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      state.view = button.dataset.view;
      document.querySelectorAll("[data-view]").forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.view === state.view);
      });
      renderConnections();
    });
  });

  fieldKind.addEventListener("change", () => {
    toggleFields(fieldKind.value);
  });

  newBtn.addEventListener("click", () => {
    if (isSyncLocked()) {
      reportSyncLocked();
      return;
    }
    openEditor();
  });

  settingsBtn.addEventListener("click", () => {
    openSettingsPrompt();
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

  passwordConfirmBtn.addEventListener("click", async (event) => {
    event.preventDefault();
    if (!pendingConnect) {
      closePasswordPrompt();
      return;
    }
    if (!promptUsernameInput.reportValidity() || !passwordInput.reportValidity()) {
      return;
    }
    const { connection, keepEditorOpen } = pendingConnect;
    const password = passwordInput.value || "";
    const updated = {
      ...connection,
      username: promptUsernameInput.value.trim(),
      domain: promptDomainInput.value.trim()
    };
    const remember =
      Boolean(pendingConnect.allowRemember) &&
      Boolean(passwordRememberInput && passwordRememberInput.checked);
    closePasswordPrompt();
    if (remember) {
      try {
        await passwordApi.save(updated, password);
      } catch (error) {
        reportError(t("error.passwordStore", { message: error.message || error }));
      }
    }
    await performConnect(updated, password, keepEditorOpen);
  });

  passwordCancelBtn.addEventListener("click", (event) => {
    event.preventDefault();
    closePasswordPrompt();
  });

  passwordPromptEl.addEventListener("click", (event) => {
    const target = event.target;
    if (target instanceof HTMLElement && target.dataset.action === "close-password") {
      closePasswordPrompt();
    }
  });

  settingsSaveBtn.addEventListener("click", async (event) => {
    event.preventDefault();
    const mode = getSyncMode();
    const url = syncUrlInput.value.trim();
    const intervalMinutes = Number(syncIntervalInput.value);
    const language = languageSelect ? languageSelect.value : "de";
    const storePasswords = storePasswordsInput ? storePasswordsInput.checked : false;
    const settings = {
      mode,
      url,
      intervalMinutes: getIntervalMinutes({ intervalMinutes }),
      language,
      storePasswords
    };
    try {
      if (mode === "sync" && !url) {
        reportError(t("sync.urlRequired"));
        return;
      }
      if (mode === "sync" && !url.startsWith("https://")) {
        reportError(t("sync.httpsOnly"));
        return;
      }
      if (mode === "sync" && !Number.isFinite(intervalMinutes)) {
        reportError(t("sync.intervalInvalid"));
        return;
      }
      state.settings = settings;
      await settingsApi.save(settings);
      setLanguage(settings.language || "de");
      updateSettingsBadge(settings.mode);
      closeSettingsPrompt();
      if (mode === "sync") {
        await syncNow(true);
        startSyncTimer();
      } else {
        stopSyncTimer();
      }
    } catch (error) {
      reportError(t("sync.error", { message: error.message || error }));
    }
  });

  settingsCancelBtn.addEventListener("click", (event) => {
    event.preventDefault();
    closeSettingsPrompt();
  });

  settingsPromptEl.addEventListener("click", (event) => {
    const target = event.target;
    if (target instanceof HTMLElement && target.dataset.action === "close-settings") {
      closeSettingsPrompt();
    }
  });

  document.querySelectorAll('input[name="syncMode"]').forEach((input) => {
    input.addEventListener("change", () => {
      setSyncMode(getSyncMode());
    });
  });

  init();
})();
