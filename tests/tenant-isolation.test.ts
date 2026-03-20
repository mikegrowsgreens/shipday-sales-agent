import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

/**
 * Static analysis tests that verify multi-tenancy patterns are followed
 * across all API route files. These catch regressions without needing a DB.
 */

const API_DIR = join(__dirname, '..', 'src', 'app', 'api');

function getRouteFiles(dir: string): string[] {
  const files: string[] = [];
  try {
    for (const entry of readdirSync(dir)) {
      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        files.push(...getRouteFiles(fullPath));
      } else if (entry === 'route.ts') {
        files.push(fullPath);
      }
    }
  } catch {
    // directory may not exist
  }
  return files;
}

// Routes that are explicitly public (no auth required by design)
const PUBLIC_ROUTES = [
  'track/sent',    // webhook-authenticated
  'track/replies', // webhook-authenticated
  'track/o',       // tracking pixel
  'track/c',       // tracking redirect
  'webhooks/',     // webhook endpoints
  'health',        // health check
  'cron/',         // cron jobs
  'bdr/campaigns/process-scheduled', // n8n webhook-key authenticated cron
  'sequences/execute',               // n8n webhook-key authenticated cron
  'twilio/status',                   // Twilio signature-verified webhook
  'calls/sync',                      // internal cron (Fathom API key)
];

// Routes that are allowed to be public
const ALLOWED_PUBLIC_PATTERNS = [
  'chat/prospect', // public chatbot — uses org_slug scoping
];

describe('Tenant Isolation - Static Analysis', () => {
  const routeFiles = getRouteFiles(API_DIR);

  it('finds route files to analyze', () => {
    expect(routeFiles.length).toBeGreaterThan(10);
  });

  describe('authenticated routes must use org_id filtering', () => {
    const authenticatedRoutes = routeFiles.filter(f => {
      const relativePath = f.replace(API_DIR, '');
      return !PUBLIC_ROUTES.some(p => relativePath.includes(p)) &&
             !ALLOWED_PUBLIC_PATTERNS.some(p => relativePath.includes(p));
    });

    for (const routeFile of authenticatedRoutes) {
      const relativePath = routeFile.replace(API_DIR, '').replace('/route.ts', '');

      it(`${relativePath} should reference org_id or tenant session`, () => {
        const content = readFileSync(routeFile, 'utf-8');

        // Route should either:
        // 1. Use requireTenantSession or getTenantFromSession
        // 2. Use requireOrgAdmin or requireSuperAdmin
        // 3. Use withAuth/withAdminAuth/withAuthGet wrapper
        // 4. Reference org_id in queries
        // 5. Be a simple utility route (logout, health)
        const hasTenantAuth = content.includes('requireTenantSession') ||
                              content.includes('getTenantFromSession') ||
                              content.includes('requireOrgAdmin') ||
                              content.includes('requireSuperAdmin') ||
                              content.includes('requireAdminSession') ||
                              content.includes('withAuth') ||
                              content.includes('withAdminAuth');

        const hasOrgFilter = content.includes('org_id');

        // At minimum, route should have tenant auth OR be clearly single-purpose
        const isSimpleUtility = content.includes('cookies.set') && content.length < 500; // e.g., logout

        expect(
          hasTenantAuth || hasOrgFilter || isSimpleUtility,
          `Route ${relativePath} lacks tenant scoping (no requireTenantSession, org_id filter, or auth wrapper)`
        ).toBe(true);
      });
    }
  });

  describe('no unparameterized org_id in SQL', () => {
    for (const routeFile of routeFiles) {
      const relativePath = routeFile.replace(API_DIR, '').replace('/route.ts', '');
      const content = readFileSync(routeFile, 'utf-8');

      // Only test files that contain SQL queries
      if (!content.includes('FROM') && !content.includes('SELECT') && !content.includes('INSERT')) continue;

      it(`${relativePath} should not string-interpolate org_id into SQL`, () => {
        // Check for dangerous patterns like `org_id = ${orgId}` or `org_id = ' + orgId`
        // Allow safe patterns like `org_id = $${paramIndex}` which expand to `$1`, `$2`, etc.
        const dangerousPatterns = [
          /org_id\s*=\s*(?<!\$)\$\{(?!\d)/,  // org_id = ${...} but NOT org_id = $${...} (param index)
          /org_id\s*=\s*['"]?\s*\+/,          // org_id = ' +
          /org_id\s*=\s*'\s*\+/,              // org_id = ' +
          /SET LOCAL.*\$\{/,                   // SET LOCAL ... ${...}
        ];

        for (const pattern of dangerousPatterns) {
          expect(
            pattern.test(content),
            `Route ${relativePath} may have SQL injection via org_id interpolation`
          ).toBe(false);
        }
      });
    }
  });
});
