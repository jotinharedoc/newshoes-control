-- Preserve the existing single-target invariant for historical corrections.
-- New employee/rule events have a typed target instead of a production/session/break FK.
ALTER TABLE "ManagementCorrection"
  DROP CONSTRAINT "ManagementCorrection_exactly_one_target_check",
  ADD CONSTRAINT "ManagementCorrection_exactly_one_target_check" CHECK (
    num_nonnulls("productionId", "workSessionId", "employeeBreakId") = 1
    OR (
      num_nonnulls("productionId", "workSessionId", "employeeBreakId") = 0
      AND "action" IS NOT NULL AND btrim("action") <> ''
      AND "targetType" IS NOT NULL AND "targetType" IN ('EMPLOYEE', 'PROCESS_RULE')
      AND "targetId" IS NOT NULL AND btrim("targetId") <> ''
    )
  );
