-- Phase B, step 3 (CONSTRAIN): now that every row has a tenant_id (0003), make
-- the column NOT NULL and add the FK to the tenants catalog. Splitting this from
-- 0002 is what makes the expand safe: we never had a NOT NULL column with NULL
-- rows.
--
-- ON DELETE RESTRICT: a tenant row may not be deleted while it still owns data.
-- Tenant teardown is a deliberate, separate operation, never a cascade.
--
-- Idempotent: SET NOT NULL is a no-op if already set; the FK is guarded by a
-- DO block that checks pg_constraint first.
--
-- DOWN (manual rollback):
--   ALTER TABLE "<table>" DROP CONSTRAINT IF EXISTS "<table>_tenant_id_fk";
--   ALTER TABLE "<table>" ALTER COLUMN "tenant_id" DROP NOT NULL;

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'employees','salary_changes','employee_documents','activity_log','jobs',
    'candidates','candidate_documents','candidate_stage_history','interviews',
    'offers','onboarding_tasks','training_records','leave_entitlements',
    'leave_requests','sickness_absences','benefits_catalog','employee_benefits'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE %I ALTER COLUMN tenant_id SET NOT NULL', t);
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = t || '_tenant_id_fk'
    ) THEN
      EXECUTE format(
        'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT',
        t, t || '_tenant_id_fk'
      );
    END IF;
  END LOOP;
END $$;
