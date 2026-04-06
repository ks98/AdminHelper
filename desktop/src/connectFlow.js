import { validateConnection } from "./connectionModel.js";
import { getSettingsDefaults } from "./settingsModel.js";

export function initConnectFlow(state, t, callbacks, apiFactory, tunnelApi, tauriEvent, isTauri) {
  const tunnelIndicator = document.getElementById("tunnelIndicator");
  const tunnelLabel = document.getElementById("tunnelLabel");

  const ua = navigator.userAgent.toLowerCase();
  const isLinux = ua.includes("linux");

  let api = null;
  let rdpStatusTimer = null;
  let rdpConnectId = 0;
  let rdpPendingId = null;
  let rdpErroredId = null;

  function ensureApi() {
    if (!api) api = apiFactory();
  }

  // ── RDP status helpers ──────────────────────────────────────────────

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
      callbacks.showStatus(t("status.rdpStarted"));
      rdpStatusTimer = null;
    }, 800);
  }

  // ── RDP auth ────────────────────────────────────────────────────────

  async function handleRdpAuth(connection, keepEditorOpen) {
    if (!isTauri) {
      return false;
    }

    if (callbacks.isPasswordStoreEnabled()) {
      try {
        const pwState = await callbacks.passwordState(connection);
        if (!pwState.canStore) {
          return false;
        }
        if (pwState.stored) {
          await performConnect(connection, keepEditorOpen, { useStoredPassword: true });
          return true;
        }
        callbacks.openPasswordPrompt(connection, keepEditorOpen, { allowRemember: true });
        return true;
      } catch (error) {
        callbacks.reportError(t("error.passwordStore", { message: error.message || error }));
      }
    }

    if (isLinux) {
      callbacks.openPasswordPrompt(connection, keepEditorOpen, { allowRemember: false });
      return true;
    }

    return false;
  }

  // ── Connect flow ────────────────────────────────────────────────────

  async function initiateConnect(connection, keepEditorOpen = false) {
    const validation = validateConnection(connection, t);
    if (!validation.ok) {
      callbacks.showStatus(validation.message, true);
      return;
    }

    if (connection.kind === "rdp") {
      const handled = await handleRdpAuth(connection, keepEditorOpen);
      if (handled) {
        return;
      }
    }

    await performConnect(connection, keepEditorOpen);
  }

  async function performConnect(connection, keepEditorOpen, options = {}) {
    ensureApi();
    const { password = null, useStoredPassword = false } = options;
    try {
      let resolved = connection;
      if (state.tunnels.length > 0) {
        try {
          const result = await tunnelApi.resolveConnection(connection, state.tunnels);
          resolved = result.connection;
        } catch (_) { /* fallback to original */ }
      }

      let rdpId = null;
      if (resolved.kind === "rdp") {
        rdpId = startRdpStatus();
        const promise = useStoredPassword
          ? api.connectStored(resolved)
          : api.connect(resolved, password || undefined);
        promise.catch((error) => {
          if (rdpId !== null) {
            clearRdpStatusTimer();
            if (rdpPendingId === rdpId) {
              rdpErroredId = rdpId;
              rdpPendingId = null;
            }
          }
          const message = String(error?.message || error || "");
          callbacks.reportError(t("error.generic", { message }));
        });
      } else if (useStoredPassword) {
        await api.connectStored(resolved);
      } else {
        await api.connect(resolved, password || undefined);
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
      callbacks.setForm(updated);
      callbacks.renderConnections();
      if (connection.kind === "rdp") {
        if (rdpId !== null) {
          scheduleRdpStatus(rdpId);
        }
      } else {
        callbacks.showStatus(t("status.connected"));
      }
      if (!keepEditorOpen) {
        callbacks.closeEditor({ preserveStatus: connection.kind === "rdp" });
      }
    } catch (error) {
      const message = String(error?.message || error || "");
      callbacks.reportError(t("error.generic", { message }));
    }
  }

  // ── Tunnel ──────────────────────────────────────────────────────────

  function updateTunnelIndicator(status) {
    if (!tunnelIndicator) return;
    const mode = (state.settings || getSettingsDefaults()).mode;
    if (mode !== "server") {
      tunnelIndicator.classList.add("hidden");
      return;
    }
    tunnelIndicator.classList.remove("hidden");
    if (status === "connecting") {
      tunnelIndicator.dataset.status = "connecting";
      tunnelLabel.textContent = t("tunnel.connecting");
      tunnelIndicator.title = t("tunnel.connecting");
    } else if (status?.running) {
      tunnelIndicator.dataset.status = "connected";
      const label = status.visitorName
        ? `Tunnel: ${status.visitorName}`
        : t("tunnel.connected");
      tunnelLabel.textContent = t("tunnel.connected");
      tunnelIndicator.title = label;
    } else {
      tunnelIndicator.dataset.status = "disconnected";
      tunnelLabel.textContent = t("tunnel.disconnected");
      tunnelIndicator.title = t("tunnel.disconnected");
    }
  }

  async function startTunnelIfServerMode() {
    if (!state.session) return;
    const mode = (state.settings || getSettingsDefaults()).mode;
    if (mode !== "server") {
      updateTunnelIndicator(null);
      return;
    }
    updateTunnelIndicator("connecting");
    try {
      const status = await tunnelApi.start(
        state.session.serverUrl,
        state.session.token,
        state.session.username
      );
      updateTunnelIndicator(status);
    } catch (error) {
      updateTunnelIndicator({ running: false });
      callbacks.reportError(t("tunnel.error", { message: error.message || error }));
    }
  }

  // ── Tauri event listeners ───────────────────────────────────────────

  if (tauriEvent?.listen) {
    tauriEvent.listen("frpc-terminated", () => {
      updateTunnelIndicator({ running: false });
    });
    tauriEvent.listen("frpc-error", (event) => {
      updateTunnelIndicator({ running: false });
      callbacks.reportError(t("tunnel.error", { message: event?.payload || "frpc error" }));
    });
    tauriEvent.listen("rdp-error", (event) => {
      clearRdpStatusTimer();
      if (rdpPendingId !== null) {
        rdpErroredId = rdpPendingId;
        rdpPendingId = null;
      }
      const message = event?.payload || t("rdp.authFailed");
      callbacks.reportError(String(message));
    });
  }

  return { initiateConnect, performConnect, startTunnelIfServerMode, updateTunnelIndicator };
}
