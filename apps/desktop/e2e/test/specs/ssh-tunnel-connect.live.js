// SPDX-FileCopyrightText: 2026 Kevin Stenzel
//
// SPDX-License-Identifier: GPL-3.0-or-later

// Live: open an SSH connection that resolves THROUGH an FRP STCP tunnel. The app
// enrolls a device cert (setup), logs in, AppShell auto-starts the visitor
// tunnel, and opening the linked connection makes the desktop ssh to the tunnel's
// local port — desktop frpc visitor → frps → agent frpc server → sshd. The full
// path is verified at the sshd container by desktop_e2e_connect_tunnel.sh.

import { clickItemByName } from '../lib/live.js';

const SERVER_URL = process.env.AH_SERVER_URL;
const USER = process.env.AH_ADMIN_USER;
const PASS = process.env.AH_ADMIN_PASS;
const ENROLL_TOKEN = process.env.AH_ENROLL_TOKEN;

describe('Open an SSH connection over an FRP tunnel', () => {
  it('enrolls, logs in, the tunnel connects, and ssh goes through it', async () => {
    await $('.login-card').waitForExist({ timeout: 20000 });

    // Device enrollment (setup) via the bridge with explicit self-signed trust.
    const err = await browser.executeAsync(
      (url, token, done) => {
        window.__TAURI__.core
          .invoke('enroll_with_token', { serverUrl: url, token, allowSelfSigned: true })
          .then(() => done(null))
          .catch((e) => done(String((e && e.message) || e)));
      },
      SERVER_URL,
      ENROLL_TOKEN,
    );
    expect(err).toBe(null);

    const inputs = await $$('.login-card input'); // serverUrl, username, password
    await inputs[0].setValue(SERVER_URL);
    await inputs[1].setValue(USER);
    await inputs[2].setValue(PASS);
    await browser.keys('Enter');
    await $('.sidebar-nav').waitForExist({ timeout: 20000 });

    // The seeded tunnel auto-starts; wait until the visitor is connected.
    const indicator = await $('.tunnel-indicator');
    await indicator.waitForExist({ timeout: 15000 });
    await browser.waitUntil(
      async () => (await indicator.getAttribute('data-status')) === 'connected',
      { timeout: 30000, timeoutMsg: 'the tunnel indicator never reached "connected"' },
    );

    // Open the connection linked to the tunnel -> resolves to localhost:<visitor>.
    const nav = await $$('.sidebar-nav .sidebar-item');
    await nav[1].click(); // connections
    await $('.card').waitForExist({ timeout: 15000 });
    await clickItemByName('.card', '.card-title', 'ssh-tunnel');

    await browser.pause(6000); // let ssh traverse the tunnel (verified at sshd)
  });
});
