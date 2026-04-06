import {
  filterConnections,
  groupConnectionsByHost,
  toCardMeta,
} from "./connectionModel.js";

export function initRendering(state, t, callbacks) {
  const listEl = document.getElementById("list");
  const treeEl = document.getElementById("tree");
  const counterEl = document.getElementById("counter");
  const searchInput = document.getElementById("searchInput");

  // ── Helpers ──────────────────────────────────────────────────────────

  function getSelectedConnection() {
    return state.connections.find((item) => item.id === state.selectedId) || null;
  }

  function preferredGroupedConnection(group) {
    for (const kind of ["ssh", "rdp", "web"]) {
      if (group.byKind[kind]) {
        return group.byKind[kind];
      }
    }
    return group.connections[0] || null;
  }

  function groupedTagKeys(group, untaggedLabel) {
    const tags = new Map();
    group.connections.forEach((connection) => {
      const rawTags = Array.isArray(connection.tags) ? connection.tags : [];
      rawTags.forEach((tagValue) => {
        const normalized = String(tagValue || "").trim();
        if (!normalized) {
          return;
        }
        const key = normalized.toLowerCase();
        if (!tags.has(key)) {
          tags.set(key, normalized);
        }
      });
    });
    if (tags.size === 0) {
      return [untaggedLabel];
    }
    return Array.from(tags.values());
  }

  // ── Card builders ───────────────────────────────────────────────────

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

    const tunnelMatch = state.tunnels.find(
      (tun) => tun.enabled && tun.connectionId === connection.id
    );
    if (tunnelMatch) {
      const tunnelBadge = document.createElement("div");
      tunnelBadge.className = "card-tag tunnel-badge";
      tunnelBadge.textContent = t("tunnel.badge");
      tunnelBadge.title = tunnelMatch.name;
      cardMain.appendChild(tunnelBadge);
    }

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
      callbacks.openEditor(connection);
    });
    connectBtn.addEventListener("click", (event) => {
      event.preventDefault();
      callbacks.initiateConnect(connection);
    });
    editBtn.addEventListener("click", (event) => {
      event.preventDefault();
      if (callbacks.isSyncLocked()) {
        callbacks.reportSyncLocked();
        return;
      }
      callbacks.openEditor(connection);
    });
    return card;
  }

  function buildGroupedConnectionCard(group) {
    const active = group.connections.some((connection) => connection.id === state.selectedId);
    const card = document.createElement("div");
    card.className = `card ${active ? "active" : ""}`;
    card.dataset.id = group.key;

    const cardMain = document.createElement("div");
    cardMain.className = "card-main";

    const title = document.createElement("div");
    title.className = "card-title";
    title.textContent = group.displayName || t("list.noName");

    const meta = document.createElement("div");
    meta.className = "card-meta";
    meta.textContent = `${group.host} · ${t("grouped.connections", { count: group.connections.length })}`;

    const typeTag = document.createElement("div");
    typeTag.className = "card-tag";
    typeTag.textContent = ["ssh", "rdp", "web"]
      .filter((kind) => Boolean(group.byKind[kind]))
      .map((kind) => kind.toUpperCase())
      .join(" · ");

    cardMain.append(title, meta, typeTag);

    const actions = document.createElement("div");
    actions.className = "card-actions";
    ["ssh", "rdp", "web"].forEach((kind) => {
      const connection = group.byKind[kind];
      if (!connection) {
        return;
      }
      const button = document.createElement("button");
      button.className = "btn small accent";
      button.type = "button";
      button.dataset.action = `connect-${kind}`;
      button.textContent = kind.toUpperCase();
      button.addEventListener("click", (event) => {
        event.preventDefault();
        callbacks.initiateConnect(connection);
      });
      actions.appendChild(button);
    });

    card.append(cardMain, actions);
    card.addEventListener("click", (event) => {
      if (event.target.closest("button")) {
        return;
      }
      const connection = preferredGroupedConnection(group);
      if (connection) {
        callbacks.openEditor(connection);
      }
    });
    return card;
  }

  // ── Render functions ────────────────────────────────────────────────

  function renderList(filtered) {
    listEl.innerHTML = "";
    filtered.forEach((connection) => {
      listEl.appendChild(buildConnectionCard(connection));
    });
  }

  function renderGroupedList(groups) {
    listEl.innerHTML = "";
    groups.forEach((group) => {
      listEl.appendChild(buildGroupedConnectionCard(group));
    });
  }

  function renderGroupedTree(groups) {
    const untaggedLabel = t("tree.untagged");
    const tagGroups = new Map();

    groups.forEach((group) => {
      const tags = groupedTagKeys(group, untaggedLabel);
      tags.forEach((tag) => {
        const key = tag.trim() || untaggedLabel;
        if (!tagGroups.has(key)) {
          tagGroups.set(key, []);
        }
        tagGroups.get(key).push(group);
      });
    });

    const sortedTags = Array.from(tagGroups.keys()).sort((a, b) => a.localeCompare(b));
    treeEl.innerHTML = "";
    sortedTags.forEach((tag) => {
      const treeGroup = document.createElement("div");
      treeGroup.className = "tree-group open";

      const hostsInTag = tagGroups.get(tag) || [];
      const countLabel = t("grouped.connections", { count: hostsInTag.length });
      const header = document.createElement("div");
      header.className = "tree-header";

      const hostEl = document.createElement("div");
      hostEl.className = "tree-tag";
      hostEl.textContent = tag;

      const toggle = document.createElement("div");
      toggle.className = "tree-toggle";

      const countEl = document.createElement("span");
      countEl.className = "tree-count";
      countEl.textContent = countLabel;

      toggle.appendChild(countEl);
      header.append(hostEl, toggle);

      const list = document.createElement("div");
      list.className = "tree-list";

      hostsInTag.forEach((hostGroup) => {
        const node = document.createElement("div");
        node.className = "tree-node";
        node.appendChild(buildGroupedConnectionCard(hostGroup));
        list.appendChild(node);
      });
      treeGroup.append(header, list);

      header.addEventListener("click", () => {
        treeGroup.classList.toggle("open");
      });

      treeEl.appendChild(treeGroup);
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
    if (state.filter === "grouped") {
      const grouped = groupConnectionsByHost(state.connections, state.search);
      counterEl.textContent = String(grouped.length);
      listEl.classList.toggle("hidden", state.view !== "list");
      treeEl.classList.toggle("hidden", state.view !== "tree");
      if (state.view === "tree") {
        renderGroupedTree(grouped);
      } else {
        renderGroupedList(grouped);
      }
      return;
    }

    const filtered = filterConnections(state.connections, state.filter, state.search);
    counterEl.textContent = String(filtered.length);
    listEl.classList.toggle("hidden", state.view !== "list");
    treeEl.classList.toggle("hidden", state.view !== "tree");
    if (state.view === "tree") {
      renderTree(filtered);
    } else {
      renderList(filtered);
    }
  }

  function setFilter(filter) {
    state.filter = filter;
    document.querySelectorAll("[data-filter]").forEach((chip) => {
      chip.classList.toggle("active", chip.dataset.filter === filter);
    });
    renderConnections();
  }

  // ── Event listeners ─────────────────────────────────────────────────

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

  return { renderConnections, setFilter, getSelectedConnection };
}
