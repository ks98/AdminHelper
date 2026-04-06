export function initPasswordPrompt(state, t, callbacks, passwordApiFactory) {
  const passwordPromptEl = document.getElementById("passwordPrompt");
  const passwordHint = document.getElementById("passwordHint");
  const passwordInput = document.getElementById("fieldPassword");
  const passwordRememberField = document.getElementById("passwordRememberField");
  const passwordRememberInput = document.getElementById("passwordRememberInput");
  const promptUsernameInput = document.getElementById("fieldPromptUsername");
  const promptDomainInput = document.getElementById("fieldPromptDomain");
  const passwordConfirmBtn = document.getElementById("passwordConfirmBtn");
  const passwordCancelBtn = document.getElementById("passwordCancelBtn");

  let passwordApi = null;
  let pendingConnect = null;

  function ensureApi() {
    if (!passwordApi) passwordApi = passwordApiFactory();
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

  // ── Event listeners ─────────────────────────────────────────────────

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
      ensureApi();
      try {
        await passwordApi.save(updated, password);
      } catch (error) {
        callbacks.reportError(t("error.passwordStore", { message: error.message || error }));
      }
    }
    await callbacks.performConnect(updated, keepEditorOpen, { password });
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

  return { openPasswordPrompt, closePasswordPrompt };
}
