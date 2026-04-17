import type { Component } from 'svelte';
import Placeholder from './pages/Placeholder.svelte';
import Servers from './pages/Servers.svelte';
import Connections from './pages/Connections.svelte';
import Users from './pages/Users.svelte';
import ApiKeys from './pages/ApiKeys.svelte';

export const routes: Record<string, Component> = {
  '/connections': Connections,
  '/servers': Servers,
  '/users': Users,
  '/apikeys': ApiKeys,
  '/hooks': Placeholder,
  '/frp': Placeholder,
  '/ansible': Placeholder,
  '/monitoring': Placeholder,
  '*': Placeholder,
};
