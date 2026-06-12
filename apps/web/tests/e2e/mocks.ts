// SPDX-FileCopyrightText: 2026 Kevin Stenzel
//
// SPDX-License-Identifier: GPL-3.0-or-later

import type { Page, Route } from '@playwright/test';

interface JsonOk {
  status?: number;
  body: unknown;
}

function json({ status = 200, body }: JsonOk): Parameters<Route['fulfill']>[0] {
  return {
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  };
}

// Baut Regex, der NUR Origin-gebundene /api/... Pfade matcht (nicht Vite-Source
// wie /src/lib/api/*). Grund: der Glob `**/api/**` ist nicht pfad-anchored und
// verschluckt auch Source-Module, wodurch JS mit JSON-MIME geliefert wird und
// main.ts nicht bootet.
export function api(path: string): RegExp {
  const escaped = path.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^https?://[^/]+/api/${escaped}(\\?.*)?$`);
}

const ADMIN_USER = {
  id: 1,
  username: 'admin',
  is_admin: true,
  created_at: '2025-01-01T00:00:00Z',
  server_ids: [],
};

const TOKENS = {
  access_token: 'test-access-token',
  refresh_token: 'test-refresh-token',
  token_type: 'bearer',
};

const DEMO_SERVERS = [
  {
    id: 'srv-1',
    name: 'demo-server',
    hostname: '10.0.0.10',
    osType: 'linux',
    tags: ['demo'],
    notes: 'Demo-Server fuer Screenshots',
    connections: [],
  },
];

const DEMO_CONNECTIONS = [
  {
    id: 'conn-1',
    name: 'demo-ssh',
    kind: 'ssh',
    host: '10.0.0.10',
    port: 22,
    username: 'root',
    serverId: 'srv-1',
    tags: ['demo'],
  },
];

// snake_case-Body, wie ihn ServerModal sendet (ServerInput).
interface ServerCreateBody {
  name: string;
  hostname: string;
  os_type: string | null;
  tags: string[];
  notes: string;
}

export async function mockApi(page: Page): Promise<void> {
  // Stateful In-Memory-"DB" pro Test: POST/DELETE mutieren den Stand, GET
  // liefert ihn aus — noetig fuer CRUD-Roundtrips (anlegen -> Liste -> loeschen).
  const db = {
    connections: DEMO_CONNECTIONS.map((c) => ({ ...c }) as Record<string, unknown>),
    servers: DEMO_SERVERS.map((s) => ({ ...s }) as Record<string, unknown>),
  };
  let seq = 1;

  // Playwright prueft Routes in LIFO-Reihenfolge (zuletzt registriert zuerst),
  // deshalb wird der generische Fallback ZUERST angelegt und von den spezifischen
  // Handlern unten ueberschrieben.
  await page.route(/^https?:\/\/[^/]+\/api\//, async (route) => {
    const method = route.request().method();
    if (method === 'DELETE') {
      return route.fulfill({ status: 204, body: '' });
    }
    return route.fulfill(json({ body: [] }));
  });

  await page.route(api('auth/login'), async (route) => route.fulfill(json({ body: TOKENS })));
  await page.route(api('auth/refresh'), async (route) => route.fulfill(json({ body: TOKENS })));
  await page.route(api('auth/me'), async (route) => route.fulfill(json({ body: ADMIN_USER })));
  await page.route(api('auth/logout'), async (route) => route.fulfill({ status: 204, body: '' }));

  await page.route(api('connections'), async (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      const created = { ...body, id: `conn-e2e-${seq++}` };
      db.connections.push(created);
      return route.fulfill(json({ status: 201, body: created }));
    }
    return route.fulfill(json({ body: db.connections }));
  });
  await page.route(api('connections/*'), async (route) => {
    if (route.request().method() === 'DELETE') {
      const id = new URL(route.request().url()).pathname.split('/').pop();
      db.connections = db.connections.filter((c) => c.id !== id);
      return route.fulfill({ status: 204, body: '' });
    }
    return route.fallback();
  });
  await page.route(api('servers'), async (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON() as ServerCreateBody;
      const created = {
        id: `srv-e2e-${seq++}`,
        name: body.name,
        hostname: body.hostname,
        osType: body.os_type,
        tags: body.tags,
        notes: body.notes,
        connections: [],
      };
      db.servers.push(created);
      return route.fulfill(json({ status: 201, body: created }));
    }
    return route.fulfill(json({ body: db.servers }));
  });
  await page.route(api('users'), async (route) => route.fulfill(json({ body: [ADMIN_USER] })));
  await page.route(api('apikeys'), async (route) => route.fulfill(json({ body: [] })));
  await page.route(api('hooks'), async (route) => route.fulfill(json({ body: [] })));
  await page.route(api('playbooks'), async (route) => route.fulfill(json({ body: [] })));

  // FRP
  await page.route(api('frp/configs'), async (route) => route.fulfill(json({ body: [] })));
  await page.route(api('frp/tunnels'), async (route) => route.fulfill(json({ body: [] })));
  await page.route(api('frp/status*'), async (route) =>
    route.fulfill(json({ body: { proxies: [], total: 0 } })),
  );

  // Monitoring
  await page.route(api('monitoring/status'), async (route) => route.fulfill(json({ body: [] })));
  await page.route(api('monitoring/alerts'), async (route) => route.fulfill(json({ body: [] })));
  await page.route(api('monitoring/alerts/log*'), async (route) =>
    route.fulfill(json({ body: [] })),
  );
  await page.route(api('monitoring/templates'), async (route) => route.fulfill(json({ body: [] })));
  await page.route(api('monitoring/templates/assignments/*'), async (route) =>
    route.fulfill(json({ body: [] })),
  );
}

export async function seedAuth(page: Page): Promise<void> {
  await page.addInitScript((tokens: typeof TOKENS) => {
    window.localStorage.setItem('adminhelper_token', tokens.access_token);
    window.localStorage.setItem('adminhelper_refresh_token', tokens.refresh_token);
  }, TOKENS);
}
