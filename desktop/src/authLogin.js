import { normalizeConnection } from "./connectionModel.js";

export function initAuth(state, t, callbacks, authApi, tunnelApi, connectionsApiFactory) {
  const loginScreen = document.getElementById("loginScreen");
  const appMain = document.getElementById("appMain");
  const loginForm = document.getElementById("loginForm");
  const loginServerUrl = document.getElementById("loginServerUrl");
  const loginUsername = document.getElementById("loginUsername");
  const loginPassword = document.getElementById("loginPassword");
  const loginError = document.getElementById("loginError");
  const loginBtn = document.getElementById("loginBtn");
  const loginBackBtn = document.getElementById("loginBackBtn");

  let connectionsApi = null;

  function ensureApi() {
    if (!connectionsApi) connectionsApi = connectionsApiFactory();
  }

  function showLoginScreen(serverUrl) {
    loginScreen.classList.remove("hidden");
    appMain.classList.add("hidden");
    loginError.classList.add("hidden");
    if (serverUrl) loginServerUrl.value = serverUrl;
    loginUsername.focus();
  }

  function hideLoginScreen() {
    loginScreen.classList.add("hidden");
    appMain.classList.remove("hidden");
  }

  async function loadConnectionsForMode() {
    ensureApi();
    const mode = state.settings.mode || "local";
    if (mode === "server" && state.session) {
      const conns = await authApi.fetchConnections(state.session.serverUrl, state.session.token);
      try {
        state.tunnels = await tunnelApi.fetchTunnels(state.session.serverUrl, state.session.token);
      } catch (_) {
        state.tunnels = [];
      }
      return Array.isArray(conns) ? conns.map(c => normalizeConnection(c || {})) : [];
    }
    state.tunnels = [];
    if (mode === "sync") {
      await callbacks.syncNow(false);
      callbacks.startSyncTimer();
    }
    const conns = await connectionsApi.load();
    return Array.isArray(conns) ? conns.map(c => normalizeConnection(c || {})) : [];
  }

  // ── Event listeners ─────────────────────────────────────────────────

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const serverUrl = loginServerUrl.value.trim();
    const username = loginUsername.value.trim();
    const password = loginPassword.value;
    if (!serverUrl) {
      loginError.textContent = t("login.serverUrlRequired");
      loginError.classList.remove("hidden");
      return;
    }
    loginError.classList.add("hidden");
    loginBtn.disabled = true;
    loginBtn.textContent = t("login.connecting");
    try {
      let acceptedSelfSigned = false;
      const certValid = await authApi.checkServerCert(serverUrl);
      if (!certValid) {
        const accepted = confirm(t("cert.warning.message", { url: serverUrl }));
        if (!accepted) {
          loginBtn.disabled = false;
          loginBtn.textContent = t("login.submit");
          return;
        }
        acceptedSelfSigned = true;
      }
      const session = await authApi.login(serverUrl, username, password, acceptedSelfSigned);
      if (acceptedSelfSigned && state.settings) {
        state.settings.allowSelfSignedCerts = true;
        await callbacks.saveSettings(state.settings);
      }
      state.session = session;
      loginPassword.value = "";
      hideLoginScreen();
      state.connections = await loadConnectionsForMode();
      callbacks.renderConnections();
      callbacks.updateNavVisibility();
      callbacks.startTunnelIfServerMode();
    } catch (error) {
      loginError.textContent = t("login.error", { message: error.message || error });
      loginError.classList.remove("hidden");
    } finally {
      loginBtn.disabled = false;
      loginBtn.textContent = t("login.submit");
    }
  });

  loginBackBtn.addEventListener("click", () => {
    hideLoginScreen();
    callbacks.openSettingsPrompt();
  });

  return { showLoginScreen, hideLoginScreen, loadConnectionsForMode };
}
