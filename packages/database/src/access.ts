import type { SqlClient } from "./index.js";
/** Supabase may grant Data API roles default table access. ArcLedger uses backend PostgreSQL only. */
export async function restrictBrowserAccess(db: SqlClient) {
  await db.query(`DO $$ DECLARE role_name text; table_name text; BEGIN
    FOREACH table_name IN ARRAY ARRAY['blocks','transactions','raw_events','transfers','address_entries','indexer_state','webhooks','webhook_deliveries','schema_migrations','validation_runs','retention_state'] LOOP
      EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY',current_schema(),table_name);
      EXECUTE format('REVOKE ALL ON TABLE %I.%I FROM PUBLIC',current_schema(),table_name);
      FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
        IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
          EXECUTE format('REVOKE ALL ON TABLE %I.%I FROM %I',current_schema(),table_name,role_name);
        END IF;
      END LOOP;
    END LOOP;
  END $$`);
}
