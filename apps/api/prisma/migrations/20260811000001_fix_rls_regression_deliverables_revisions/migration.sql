-- Regression fix. The `deliverables` and `revision_requests` policies were
-- written with the raw `current_setting('app.tenant_id', true)::uuid`
-- pattern -- the exact pattern the 20260807000001_fix_rls_null_handling
-- migration existed to replace. They were copied from the ORIGINAL
-- 0002_rls_policies migration instead of the fixed one, so they carried the
-- old bug forward while the other eight tables were already correct.
--
-- Symptom (reproduced against this database before writing this migration):
-- on a pooled connection that has previously run `SET LOCAL app.tenant_id`,
-- a later query with no tenant context set hits `''::uuid` and raises
-- `invalid input syntax for type uuid: ""` instead of returning zero rows.
--
--   SELECT count(*) FROM tasks;         -- 0 rows      (fails closed, correct)
--   SELECT count(*) FROM deliverables;  -- ERROR       (fails closed, but loudly)
--
-- No data leak either way -- both refuse to return rows. What broke is the
-- fail-closed-*quietly* contract the rest of the schema relies on, turning
-- a benign empty result into a 500.
--
-- See tenant-isolation.e2e-spec.ts, which now asserts this for every
-- tenant-scoped table rather than a hand-picked few, so a future table
-- copying the wrong pattern fails CI instead of shipping.

DROP POLICY tenant_isolation_deliverables ON deliverables;
CREATE POLICY tenant_isolation_deliverables ON deliverables
  USING       (organization_id = current_tenant_id())
  WITH CHECK  (organization_id = current_tenant_id());

DROP POLICY tenant_isolation_revision_requests ON revision_requests;
CREATE POLICY tenant_isolation_revision_requests ON revision_requests
  USING       (organization_id = current_tenant_id())
  WITH CHECK  (organization_id = current_tenant_id());
