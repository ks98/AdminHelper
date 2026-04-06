export function getTauriBridge(win = window) {
  const tauriInvoke =
    win.__TAURI__?.core?.invoke || win.__TAURI__?.tauri?.invoke || win.__TAURI__?.invoke;
  return {
    tauriInvoke,
    isTauri: typeof tauriInvoke === "function",
    tauriEvent: win.__TAURI__?.event
  };
}

function createStorageFallback(storage, key, defaultRaw) {
  return {
    load() {
      try {
        return JSON.parse(storage.getItem(key) || defaultRaw);
      } catch (_error) {
        return JSON.parse(defaultRaw);
      }
    },
    save(value) {
      storage.setItem(key, JSON.stringify(value));
    }
  };
}

export function createConnectionsApi(bridge, t, clientInfoProvider, storage = localStorage) {
  const fallback = createStorageFallback(storage, "rg-connections", "[]");

  return {
    async load() {
      if (bridge.isTauri) {
        return await bridge.tauriInvoke("load_connections");
      }
      return fallback.load();
    },
    async save(connections) {
      if (bridge.isTauri) {
        await bridge.tauriInvoke("save_connections", { connections });
        return;
      }
      fallback.save(connections);
    },
    async connect(connection, password) {
      if (bridge.isTauri) {
        const payload = { connection, client: clientInfoProvider() };
        if (password) {
          payload.password = password;
        }
        await bridge.tauriInvoke("open_connection", payload);
        return;
      }
      alert(t("error.tauriOnly"));
    },
    async connectStored(connection) {
      if (bridge.isTauri) {
        await bridge.tauriInvoke("open_connection_stored", {
          connection,
          client: clientInfoProvider()
        });
        return;
      }
      alert(t("error.tauriOnly"));
    }
  };
}

export function createSettingsApi(bridge, t, storage = localStorage) {
  const fallback = createStorageFallback(storage, "rg-settings", "{}");

  return {
    async load() {
      if (bridge.isTauri) {
        return await bridge.tauriInvoke("load_settings");
      }
      return fallback.load();
    },
    async save(settings) {
      if (bridge.isTauri) {
        await bridge.tauriInvoke("save_settings", { settings });
        return;
      }
      fallback.save(settings);
    },
    async sync(url) {
      if (bridge.isTauri) {
        return await bridge.tauriInvoke("sync_connections", { url });
      }
      throw new Error(t("error.syncOnly"));
    }
  };
}

export function createPasswordApi(bridge) {
  return {
    async state(connection) {
      if (bridge.isTauri) {
        return await bridge.tauriInvoke("password_state", { connection });
      }
      return { stored: false, password: null, canStore: false };
    },
    async save(connection, password) {
      if (bridge.isTauri) {
        await bridge.tauriInvoke("save_password", { connection, password });
      }
    },
    async delete(connection) {
      if (bridge.isTauri) {
        await bridge.tauriInvoke("delete_password", { connection });
      }
    }
  };
}

export function createAuthApi(bridge) {
  return {
    async login(serverUrl, username, password, allowSelfSigned) {
      if (bridge.isTauri) {
        return await bridge.tauriInvoke("login", {
          serverUrl, username, password,
          allowSelfSigned: allowSelfSigned || undefined,
        });
      }
      throw new Error("Nur in Tauri verfügbar");
    },
    async logout() {
      if (bridge.isTauri) {
        await bridge.tauriInvoke("logout");
      }
    },
    async checkSession() {
      if (bridge.isTauri) {
        return await bridge.tauriInvoke("check_session");
      }
      return null;
    },
    async fetchConnections(serverUrl, token) {
      if (bridge.isTauri) {
        return await bridge.tauriInvoke("fetch_connections_jwt", { serverUrl, token });
      }
      throw new Error("Nur in Tauri verfügbar");
    },
    async checkServerCert(serverUrl) {
      if (bridge.isTauri) {
        return await bridge.tauriInvoke("check_server_cert", { serverUrl });
      }
      return true;
    }
  };
}

export function createTunnelApi(bridge) {
  return {
    async start(serverUrl, token, username) {
      if (bridge.isTauri) {
        return await bridge.tauriInvoke("start_tunnel", { serverUrl, token, username });
      }
      throw new Error("Nur in Tauri verfügbar");
    },
    async stop() {
      if (bridge.isTauri) {
        await bridge.tauriInvoke("stop_tunnel");
      }
    },
    async status() {
      if (bridge.isTauri) {
        return await bridge.tauriInvoke("tunnel_status");
      }
      return { running: false, visitorName: null, connectedSince: null };
    },
    async fetchTunnels(serverUrl, token) {
      if (bridge.isTauri) {
        return await bridge.tauriInvoke("fetch_tunnels", { serverUrl, token });
      }
      return [];
    },
    async resolveConnection(connection, tunnels) {
      if (bridge.isTauri) {
        return await bridge.tauriInvoke("resolve_connection", { connection, tunnels });
      }
      return { connection, viaTunnel: false, tunnelName: null, tunnelType: null };
    }
  };
}

export function getClientInfo(win = window) {
  const scaleFactor = win.devicePixelRatio || 1;
  return {
    screenWidth: win.screen.width,
    screenHeight: win.screen.height,
    scaleFactor
  };
}
