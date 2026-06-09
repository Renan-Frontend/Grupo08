const truthy = (value) =>
  ['true', '1', 'yes', 'on'].includes(String(value || '').toLowerCase());

const DEMO_HOSTNAMES = new Set([
  'grupo08-1.onrender.com',
  'renan-frontend.github.io',
]);

const isDemoHost =
  typeof window !== 'undefined' &&
  DEMO_HOSTNAMES.has(window.location.hostname);

export const isDemoMode =
  truthy(import.meta.env.VITE_DEMO_MODE) || isDemoHost;

export const demoUserId = Number(import.meta.env.VITE_DEMO_USER_ID || '1') || 1;

export const demoToken = `fake-token-${demoUserId}`;

export const demoFallbackUser = {
  id: demoUserId,
  nome: 'Visitante Demo',
  email: 'demo@bpcompany.local',
  ativo: true,
  admin: true,
  role: 'admin',
  permissions: [
    'users:read',
    'users:create',
    'users:update',
    'users:delete',
    'opportunities:read',
    'opportunities:create',
    'opportunities:update',
    'opportunities:delete',
    'workflows:read',
    'workflows:manage',
    'tasks:read',
    'tasks:create',
    'tasks:complete',
    'tasks:assign',
    'bpmn:read',
    'bpmn:edit',
    'entities:read',
    'entities:create',
    'entities:update',
    'entities:delete',
    'reports:read',
  ],
};
