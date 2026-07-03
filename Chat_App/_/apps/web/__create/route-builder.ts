import { Hono } from 'hono';
import type { Handler } from 'hono/types';
import updatedFetch from '../src/__create/fetch';

const API_BASENAME = '/api';
const api = new Hono();
const routeModules = import.meta.glob('../src/app/api/**/route.js');

if (globalThis.fetch) {
  globalThis.fetch = updatedFetch;
}

function getRouteEntries() {
  return Object.entries(routeModules)
    .map(([filePath, loader]) => ({ filePath, loader }))
    .sort((a, b) => b.filePath.length - a.filePath.length);
}

function getHonoPath(routeFile: string): { name: string; pattern: string }[] {
  const relativePath = routeFile.replace('../src/app/api/', '').replace(/\\/g, '/');
  const parts = relativePath.split('/').filter(Boolean);
  const routeParts = parts.slice(0, -1);

  if (routeParts.length === 0) {
    return [{ name: 'root', pattern: '' }];
  }

  return routeParts.map((segment) => {
    const match = segment.match(/^\[(\.{3})?([^\]]+)\]$/);
    if (match) {
      const [, dots, param] = match;
      return dots === '...'
        ? { name: param, pattern: `:${param}{.+}` }
        : { name: param, pattern: `:${param}` };
    }
    return { name: segment, pattern: segment };
  });
}

async function registerRoutes() {
  api.routes = [];
  const entries = getRouteEntries();

  for (const entry of entries) {
    try {
      const route = await entry.loader();
      const methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] as const;

      for (const method of methods) {
        if (!route[method]) continue;

        const parts = getHonoPath(entry.filePath);
        const honoPath = `/${parts.map(({ pattern }) => pattern).join('/')}`;
        const handler: Handler = async (c) => {
          const params = c.req.param();
          const freshRoute = import.meta.env.DEV ? await entry.loader() : route;
          return await freshRoute[method](c.req.raw, { params });
        };

        switch (method.toLowerCase()) {
          case 'get':
            api.get(honoPath, handler);
            break;
          case 'post':
            api.post(honoPath, handler);
            break;
          case 'put':
            api.put(honoPath, handler);
            break;
          case 'delete':
            api.delete(honoPath, handler);
            break;
          case 'patch':
            api.patch(honoPath, handler);
            break;
          default:
            break;
        }
      }
    } catch (error) {
      console.error(`Error registering route ${entry.filePath}:`, error);
    }
  }
}

await registerRoutes();

if (import.meta.env.DEV && import.meta.hot) {
  import.meta.hot.accept((newSelf) => {
    registerRoutes().catch((error) => {
      console.error('Error reloading routes:', error);
    });
  });
}

export { api, API_BASENAME };
