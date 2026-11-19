const swagger = require('../../src/config/swagger.json');
const healthRoutes = require('../../src/routes/health.routes');
const authRoutes = require('../../src/routes/auth.routes');
const barRoutes = require('../../src/routes/bar.routes');

function extractRouterEndpoints(router, prefix = '') {
  const endpoints = [];
  for (const layer of router.stack) {
    if (!layer.route) continue;
    const rawPath = `${prefix}${layer.route.path}`;
    const openApiPath = rawPath
      .replace(/\/+$/, '')
      .replace(/:([a-zA-Z0-9_]+)/g, '{$1}') || '/';

    for (const method of Object.keys(layer.route.methods)) {
      if (layer.route.methods[method]) {
        endpoints.push(`${method.toUpperCase()} ${openApiPath}`);
      }
    }
  }
  return endpoints;
}

function collectRefs(obj, refs = []) {
  if (!obj || typeof obj !== 'object') return refs;
  if (typeof obj.$ref === 'string') {
    refs.push(obj.$ref);
  }
  for (const val of Object.values(obj)) {
    collectRefs(val, refs);
  }
  return refs;
}

function resolveRef(doc, ref) {
  const parts = ref.replace(/^#\//, '').split('/');
  return parts.reduce((acc, part) => (acc ? acc[part] : undefined), doc);
}

describe('Contrato OpenAPI 3.0 / Swagger', () => {
  test('possui metadados obrigatórios e servidores relativos compatíveis com VPS', () => {
    expect(swagger.openapi).toMatch(/^3\.0\.\d+$/);
    expect(swagger.info.title).toBeTruthy();
    expect(swagger.info.version).toBe('2.0.0');
    expect(swagger.servers.some((s) => s.url === '/')).toBe(true);
    expect(swagger.components.securitySchemes.bearerAuth).toBeDefined();
  });

  test('todas as referências $ref do contrato apontam para componentes existentes', () => {
    const refs = collectRefs(swagger);
    expect(refs.length).toBeGreaterThan(0);

    for (const ref of refs) {
      expect(resolveRef(swagger, ref)).toBeDefined();
    }
  });

  test('100% das rotas implementadas no Express estão documentadas no contrato OpenAPI (e vice-versa)', () => {
    const expressEndpoints = [
      ...extractRouterEndpoints(healthRoutes, ''),
      ...extractRouterEndpoints(authRoutes, '/auth'),
      ...extractRouterEndpoints(barRoutes, '/bars'),
    ].sort();

    const swaggerEndpoints = [];
    for (const [pathKey, methods] of Object.entries(swagger.paths)) {
      for (const method of Object.keys(methods)) {
        swaggerEndpoints.push(`${method.toUpperCase()} ${pathKey}`);
      }
    }
    swaggerEndpoints.sort();

    expect(swaggerEndpoints).toEqual(expressEndpoints);
  });

  test('toda operação no contrato possui operationId único, tags e respostas definidas', () => {
    const seenOperationIds = new Set();

    for (const [pathKey, methods] of Object.entries(swagger.paths)) {
      for (const [method, operation] of Object.entries(methods)) {
        expect(operation.operationId).toBeTruthy();
        expect(seenOperationIds.has(operation.operationId)).toBe(false);
        seenOperationIds.add(operation.operationId);

        expect(Array.isArray(operation.tags) && operation.tags.length > 0).toBe(true);
        expect(operation.responses && Object.keys(operation.responses).length > 0).toBe(true);
        expect(operation.summary).toBeTruthy();

        // Garante que rotas protegidas declarem segurança bearerAuth
        const requiresAuth =
          (method === 'post' && ['/auth/logout', '/bars', '/bars/{id}/prices', '/bars/{id}/reviews'].includes(pathKey)) ||
          (method === 'get' && pathKey === '/auth/me') ||
          (['put', 'delete'].includes(method) && pathKey === '/bars/{id}');

        if (requiresAuth) {
          expect(operation.security).toEqual([{ bearerAuth: [] }]);
        }
      }
    }
  });
});
