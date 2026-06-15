// SPDX-FileCopyrightText: 2026 Kevin Stenzel
//
// SPDX-License-Identifier: GPL-3.0-or-later

import type { Component } from 'svelte';
import Placeholder from './pages/Placeholder.svelte';
import Users from './pages/Users.svelte';
import ApiKeys from './pages/ApiKeys.svelte';
import Hooks from './pages/Hooks.svelte';
import Frp from './pages/Frp.svelte';
import Audit from './pages/Audit.svelte';

export const routes: Record<string, Component> = {
  '/users': Users,
  '/apikeys': ApiKeys,
  '/hooks': Hooks,
  '/frp': Frp,
  '/audit': Audit,
  '*': Placeholder,
};
