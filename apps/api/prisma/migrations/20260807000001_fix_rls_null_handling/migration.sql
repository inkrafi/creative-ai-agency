-- Bug found by tenant-isolation.e2e-spec.ts ("fails closed with zero rows
-- when no tenant context is set at all"):
--
-- current_setting('app.tenant_id', true) only returns NULL the very first
-- time a custom GUC is read in a session, before it has ever been SET. Once
-- *any* transaction on that pooled physical connection has done
-- `SET LOCAL app.tenant_id = '...'` (even if it committed and "reverted"),
-- Postgres registers the placeholder GUC for the rest of the session with a
-- reset value of '' (empty string), not NULL. A later query on that same
-- connection with no active SET LOCAL then hits `''::uuid`, which is not a
-- silent zero-row result -- it's a hard `invalid input syntax for type
-- uuid` error. In a pooled app server, this is the common case after the
-- first request, not an edge case.
--
-- NULLIF(..., '') collapses that empty string back to NULL before the cast,
-- restoring the intended fail-closed (zero rows, no error) behavior
-- regardless of what this physical connection did earlier in its life.

CREATE OR REPLACE FUNCTION current_tenant_id() RETURNS uuid AS $$
  SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid;
$$ LANGUAGE sql STABLE;

DROP POLICY tenant_isolation_organizations ON organizations;
CREATE POLICY tenant_isolation_organizations ON organizations
  USING       (id = current_tenant_id())
  WITH CHECK  (id = current_tenant_id());

DROP POLICY tenant_isolation_users ON users;
CREATE POLICY tenant_isolation_users ON users
  USING       (organization_id = current_tenant_id())
  WITH CHECK  (organization_id = current_tenant_id());

DROP POLICY tenant_isolation_projects ON projects;
CREATE POLICY tenant_isolation_projects ON projects
  USING       (organization_id = current_tenant_id())
  WITH CHECK  (organization_id = current_tenant_id());

DROP POLICY tenant_isolation_tasks ON tasks;
CREATE POLICY tenant_isolation_tasks ON tasks
  USING       (organization_id = current_tenant_id())
  WITH CHECK  (organization_id = current_tenant_id());
