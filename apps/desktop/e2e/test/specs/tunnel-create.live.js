// SPDX-FileCopyrightText: 2026 Kevin Stenzel
//
// SPDX-License-Identifier: GPL-3.0-or-later

// Live E2E: drive the REAL app against a REAL backend (booted + seeded by
// scripts/tests/desktop_e2e_live.sh) to create a connection tunnel through the
// GUI. Unlike the component tests (which mock the IPC boundary), this exercises
// the full path: GUI → api_proxy → nginx gateway → server → Postgres. The
// orchestrator then independently re-checks the tunnel via the server API.
//
// Selectors are by structure/index (not i18n text) so the spec is language
// independent: nav order is dashboard/connections/infrastructure/...; server
// detail tabs are overview/connections/tunnels/...

const SERVER_URL = process.env.AH_SERVER_URL;
const USER = process.env.AH_ADMIN_USER;
const PASS = process.env.AH_ADMIN_PASS;
const TUNNEL_NAME = 'e2e-ssh';

describe('AdminHelper desktop — create a tunnel against a live server', () => {
  it('logs in through the real gateway (TOFU, self-signed trusted)', async () => {
    // Server mode is preseeded, so the app opens on the login screen.
    await $('.login-card').waitForExist({ timeout: 20000 });
    const inputs = await $$('.login-card input'); // serverUrl, username, password
    await inputs[0].setValue(SERVER_URL);
    await inputs[1].setValue(USER);
    await inputs[2].setValue(PASS);
    await browser.keys('Enter');

    // A successful login swaps the login screen for the app shell.
    await $('.sidebar-nav').waitForExist({ timeout: 20000 });
    await expect($('.content-header .page-title')).toExist();
  });

  it('opens Infrastructure → the seeded server → the Tunnels tab', async () => {
    const nav = await $$('.sidebar-nav .sidebar-item');
    await nav[2].click(); // dashboard(0), connections(1), infrastructure(2)

    // The seeded server auto-selects; wait for its detail tabs to render.
    await $('.srv-tab').waitForExist({ timeout: 15000 });
    const tabs = await $$('.srv-tab');
    await tabs[2].click(); // overview(0), connections(1), tunnels(2)

    // The "add tunnel" button enables only once the seeded FRP config loads.
    await $('.tun-toolbar .btn.primary').waitForEnabled({ timeout: 15000 });
  });

  it('creates a tunnel via the modal and sees it in the list', async () => {
    await $('.tun-toolbar .btn.primary').click();
    await $('.editor-overlay[role="dialog"]').waitForExist({ timeout: 10000 });

    // The lone seeded FRP config is preselected; fill name + local port.
    await $('.editor-panel input[placeholder="k01-lnx1-ssh"]').setValue(TUNNEL_NAME);
    const numbers = await $$('.editor-panel input[type="number"]');
    await numbers[0].setValue('22'); // local port (stcp also has a visitor port)

    // Save → real POST /api/frp/tunnels. Click via JS: the fixed status bar
    // overlaps the modal's bottom action row, so a coordinate click is
    // intercepted.
    const saveBtn = await $('.editor-panel .btn.primary');
    await browser.execute((el) => el.click(), saveBtn);

    // The modal closes and TunnelsTab reloads from the server.
    await browser.waitUntil(
      async () => {
        const names = await $$('.tun-row .tun-name');
        for (const n of names) {
          if ((await n.getText()) === TUNNEL_NAME) return true;
        }
        return false;
      },
      { timeout: 15000, timeoutMsg: 'the created tunnel never appeared in the list' },
    );
  });
});
