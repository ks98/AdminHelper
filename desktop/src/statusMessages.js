export function initStatus() {
  const editorEl = document.getElementById("editor");
  const statusEl = document.getElementById("status");
  const globalStatusEl = document.getElementById("globalStatus");

  function getStatusTarget() {
    if (editorEl && !editorEl.classList.contains("hidden")) {
      return statusEl;
    }
    return globalStatusEl;
  }

  function showStatus(message, isError = false) {
    const target = getStatusTarget();
    if (!target) return;
    target.textContent = message;
    target.classList.add("show");
    target.style.border = `1px solid ${isError ? "rgba(248, 113, 113, 0.4)" : "rgba(34, 197, 94, 0.35)"}`;
    target.style.color = isError ? "#fca5a5" : "#bbf7d0";
  }

  function reportError(message) {
    const editorHidden = editorEl && editorEl.classList.contains("hidden");
    if (editorHidden && !globalStatusEl) {
      alert(message);
    } else {
      showStatus(message, true);
    }
  }

  function clearStatus() {
    if (statusEl) {
      statusEl.classList.remove("show");
    }
    if (globalStatusEl) {
      globalStatusEl.classList.remove("show");
    }
  }

  return { showStatus, reportError, clearStatus };
}
