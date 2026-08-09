-- Runtime role: RLS-restricted, used by the API for all normal request traffic.
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_rls') THEN
    CREATE ROLE app_rls LOGIN PASSWORD 'change_me';
  END IF;
END $$;

-- Narrow bypass role: used ONLY by AuthService for the pre-tenant-context
-- email lookup at login and the signup uniqueness check. Nothing else may
-- use this role -- see AuthBypassPrismaService.
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_auth_bypass') THEN
    CREATE ROLE app_auth_bypass LOGIN PASSWORD 'change_me_too' BYPASSRLS;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO app_rls, app_auth_bypass;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_rls, app_auth_bypass;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_rls, app_auth_bypass;

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations FORCE ROW LEVEL SECURITY;
ALTER TABLE users         ENABLE ROW LEVEL SECURITY;
ALTER TABLE users         FORCE ROW LEVEL SECURITY;
ALTER TABLE projects      ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects      FORCE ROW LEVEL SECURITY;
ALTER TABLE tasks         ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks         FORCE ROW LEVEL SECURITY;

-- current_setting(..., true) with missing_ok=true returns NULL instead of
-- erroring when app.tenant_id was never SET LOCAL for this transaction.
-- NULL = anything is NULL (never TRUE) in Postgres, so an unset session
-- variable yields ZERO visible/writable rows, not all rows. Fail closed.

CREATE POLICY tenant_isolation_organizations ON organizations
  USING       (id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK  (id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY tenant_isolation_users ON users
  USING       (organization_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK  (organization_id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY tenant_isolation_projects ON projects
  USING       (organization_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK  (organization_id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY tenant_isolation_tasks ON tasks
  USING       (organization_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK  (organization_id = current_setting('app.tenant_id', true)::uuid);
