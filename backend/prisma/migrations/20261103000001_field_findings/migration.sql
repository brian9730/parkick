ALTER TABLE "admins" DROP CONSTRAINT "admins_role_tenant_check";
ALTER TABLE "admins" ADD CONSTRAINT "admins_role_tenant_check" CHECK (
  ("role" = 'PLATFORM_ADMIN' AND "tenant_id" IS NULL)
  OR ("role" IN ('TENANT_ADMIN', 'COLLECTOR') AND "tenant_id" IS NOT NULL)
);

CREATE TYPE "FieldFindingType" AS ENUM ('DEVICE_NOT_FOUND');
CREATE TYPE "FieldFindingStatus" AS ENUM ('PENDING_REVIEW', 'REVIEWED');

CREATE TABLE "report_field_findings" (
  "id" UUID NOT NULL,
  "report_id" UUID NOT NULL,
  "collector_id" UUID NOT NULL,
  "type" "FieldFindingType" NOT NULL,
  "note" VARCHAR(1000) NOT NULL,
  "status" "FieldFindingStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewed_at" TIMESTAMPTZ(3),
  "reviewed_by_admin_id" UUID,
  CONSTRAINT "report_field_findings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "report_field_findings_note_check" CHECK (length(btrim("note")) > 0),
  CONSTRAINT "report_field_findings_review_check" CHECK (
    ("status" = 'PENDING_REVIEW' AND "reviewed_at" IS NULL AND "reviewed_by_admin_id" IS NULL)
    OR ("status" = 'REVIEWED' AND "reviewed_at" IS NOT NULL AND "reviewed_by_admin_id" IS NOT NULL)
  )
);

CREATE INDEX "report_field_findings_report_id_created_at_idx" ON "report_field_findings"("report_id", "created_at");
CREATE INDEX "report_field_findings_status_created_at_idx" ON "report_field_findings"("status", "created_at");
CREATE UNIQUE INDEX "report_field_findings_one_pending_per_report" ON "report_field_findings"("report_id") WHERE "status" = 'PENDING_REVIEW';

ALTER TABLE "report_field_findings" ADD CONSTRAINT "report_field_findings_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "report_field_findings" ADD CONSTRAINT "report_field_findings_collector_id_fkey" FOREIGN KEY ("collector_id") REFERENCES "admins"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "report_field_findings" ADD CONSTRAINT "report_field_findings_reviewed_by_admin_id_fkey" FOREIGN KEY ("reviewed_by_admin_id") REFERENCES "admins"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
