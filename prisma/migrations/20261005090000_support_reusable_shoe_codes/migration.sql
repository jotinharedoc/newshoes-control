-- Expand-only rollout. Legacy application inserts remain supported by the trigger.
-- Fail promptly rather than holding production traffic behind a long DDL lock.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
CREATE TABLE "ShoeOccurrence" (
  "id" TEXT PRIMARY KEY,
  "shoeId" TEXT NOT NULL REFERENCES "Shoe"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "sequence" INTEGER NOT NULL CHECK ("sequence" > 0),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "ShoeOccurrence_shoeId_sequence_key" ON "ShoeOccurrence"("shoeId", "sequence");
ALTER TABLE "Production" ADD COLUMN "occurrenceId" TEXT,
  ADD COLUMN "cancelledFromStatus" "ProductionStatus",
  ADD COLUMN "cancelledAt" TIMESTAMP(3);
-- Exactly one initial occurrence per existing code. Preserve every original ID,
-- status, timestamp, session, return relationship and commission entry.
INSERT INTO "ShoeOccurrence" ("id", "shoeId", "sequence", "createdAt")
SELECT 'legacy-' || "id", "id", 1, "createdAt" FROM "Shoe";
UPDATE "Production" SET "occurrenceId" = 'legacy-' || "shoeId";
ALTER TABLE "Production" ADD CONSTRAINT "Production_occurrenceId_fkey"
  FOREIGN KEY ("occurrenceId") REFERENCES "ShoeOccurrence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "Production_occurrenceId_idx" ON "Production"("occurrenceId");
CREATE FUNCTION "ensure_production_occurrence"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE occurrence_shoe TEXT;
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW."shoeId" IS DISTINCT FROM OLD."shoeId"
    OR NEW."occurrenceId" IS DISTINCT FROM OLD."occurrenceId") THEN
    RAISE EXCEPTION 'A production cannot change its code or occurrence';
  END IF;
  IF NEW."occurrenceId" IS NULL THEN
    IF NEW."sourceProductionId" IS NOT NULL THEN
      SELECT "occurrenceId" INTO NEW."occurrenceId" FROM "Production" WHERE "id" = NEW."sourceProductionId";
    ELSE
      INSERT INTO "ShoeOccurrence" ("id", "shoeId", "sequence")
      VALUES ('legacy-' || NEW."shoeId", NEW."shoeId", 1) ON CONFLICT DO NOTHING;
      SELECT "id" INTO NEW."occurrenceId" FROM "ShoeOccurrence"
        WHERE "shoeId" = NEW."shoeId" ORDER BY "sequence" DESC LIMIT 1;
    END IF;
  END IF;
  SELECT "shoeId" INTO occurrence_shoe FROM "ShoeOccurrence" WHERE "id" = NEW."occurrenceId";
  IF occurrence_shoe IS DISTINCT FROM NEW."shoeId" THEN
    RAISE EXCEPTION 'Occurrence must belong to the production code';
  END IF;
  IF NEW."sourceProductionId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "Production" WHERE "id" = NEW."sourceProductionId"
      AND "occurrenceId" = NEW."occurrenceId"
  ) THEN RAISE EXCEPTION 'Return must keep the original occurrence'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "Production_ensure_occurrence" BEFORE INSERT OR UPDATE ON "Production"
  FOR EACH ROW EXECUTE FUNCTION "ensure_production_occurrence"();
-- Replace lifetime uniqueness with occurrence-scoped coverage. No historical deletion.
DROP INDEX "Production_standard_left_coverage_key";
DROP INDEX "Production_standard_right_coverage_key";
CREATE UNIQUE INDEX "Production_standard_left_coverage_key"
  ON "Production"("occurrenceId", "processTypeId")
  WHERE "kind" = 'STANDARD' AND "status" <> 'CANCELLED' AND "unit" IN ('PAIR', 'LEFT_FOOT');
CREATE UNIQUE INDEX "Production_standard_right_coverage_key"
  ON "Production"("occurrenceId", "processTypeId")
  WHERE "kind" = 'STANDARD' AND "status" <> 'CANCELLED' AND "unit" IN ('PAIR', 'RIGHT_FOOT');
COMMIT;
