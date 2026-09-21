-- Arc's ERC-20 self transfers intentionally have no native system log.
-- Rebuild only affected projections; retain the complete raw audit trail.
UPDATE transactions SET ledger_version=0,projection_error=NULL
WHERE raw_receipt IS NOT NULL AND EXISTS (
  SELECT 1 FROM jsonb_array_elements(explanation->'evidence') e
  WHERE e->>'from'=e->>'to' AND e->>'rawAmount'<>'0'
);
