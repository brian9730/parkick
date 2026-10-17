BEGIN;

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('RECEIVED', 'PROCESSING', 'COMPLETED');

-- CreateEnum
CREATE TYPE "ReportCompletionMethod" AS ENUM ('COLLECTED', 'TOWED');

-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('PLATFORM_ADMIN', 'TENANT_ADMIN');

-- CreateTable
CREATE TABLE "tenants" (
    "id" UUID NOT NULL,
    "code" VARCHAR(80) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "regions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "code" VARCHAR(80) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "regions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admins" (
    "id" UUID NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "role" "AdminRole" NOT NULL,
    "tenant_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_sessions" (
    "id" UUID NOT NULL,
    "admin_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operators" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "qr_rule_metadata" JSONB,

    CONSTRAINT "operators_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" UUID NOT NULL,
    "public_id" VARCHAR(64) NOT NULL,
    "submission_id" UUID NOT NULL,
    "submission_hash" CHAR(64) NOT NULL,
    "tenant_id" UUID NOT NULL,
    "region_id" UUID NOT NULL,
    "operator_id" UUID,
    "operator_name" VARCHAR(80),
    "device_id" VARCHAR(120),
    "qr_raw_data" TEXT,
    "latitude" DECIMAL(9,6) NOT NULL,
    "longitude" DECIMAL(10,6) NOT NULL,
    "address" VARCHAR(500),
    "user_description" TEXT,
    "ai_generated_text" TEXT,
    "final_report_text" TEXT NOT NULL,
    "contact_phone_cipher" BYTEA,
    "phone_encryption_key_version" VARCHAR(80),
    "phone_identifier" CHAR(64),
    "phone_hmac_key_version" VARCHAR(80),
    "contact_phone_masked" VARCHAR(24),
    "consent_version" VARCHAR(80),
    "consented_at" TIMESTAMPTZ(3),
    "status" "ReportStatus" NOT NULL DEFAULT 'RECEIVED',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "completed_at" TIMESTAMPTZ(3),
    "completion_method" "ReportCompletionMethod",
    "completed_by_admin_id" UUID,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_images" (
    "id" UUID NOT NULL,
    "report_id" UUID NOT NULL,
    "object_key" VARCHAR(1024) NOT NULL,
    "mime_type" VARCHAR(32) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "sha256" CHAR(64),
    "exif_removed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_categories" (
    "id" UUID NOT NULL,
    "code" VARCHAR(80) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "report_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_category_relations" (
    "report_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,

    CONSTRAINT "report_category_relations_pkey" PRIMARY KEY ("report_id","category_id")
);

-- CreateTable
CREATE TABLE "report_status_history" (
    "id" UUID NOT NULL,
    "report_id" UUID NOT NULL,
    "previous_status" "ReportStatus",
    "new_status" "ReportStatus" NOT NULL,
    "completion_method" "ReportCompletionMethod",
    "admin_id" UUID,
    "internal_note" TEXT,
    "public_note" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_ai_generations" (
    "id" UUID NOT NULL,
    "report_id" UUID,
    "draft_token_hash" CHAR(64),
    "model_id" VARCHAR(2048) NOT NULL,
    "prompt_version" VARCHAR(80) NOT NULL,
    "generated_text" TEXT NOT NULL,
    "final_user_text" TEXT,
    "was_edited" BOOLEAN,
    "latency_ms" INTEGER,
    "input_tokens" INTEGER,
    "output_tokens" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3),

    CONSTRAINT "report_ai_generations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_code_key" ON "tenants"("code");

-- CreateIndex
CREATE UNIQUE INDEX "regions_code_key" ON "regions"("code");

-- CreateIndex
CREATE INDEX "regions_tenant_id_idx" ON "regions"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "regions_id_tenant_id_key" ON "regions"("id", "tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "admins_email_key" ON "admins"("email");

-- CreateIndex
CREATE INDEX "admins_tenant_id_idx" ON "admins"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "admin_sessions_token_hash_key" ON "admin_sessions"("token_hash");

-- CreateIndex
CREATE INDEX "admin_sessions_expires_at_idx" ON "admin_sessions"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "operators_name_key" ON "operators"("name");

-- CreateIndex
CREATE UNIQUE INDEX "reports_public_id_key" ON "reports"("public_id");

-- CreateIndex
CREATE UNIQUE INDEX "reports_submission_id_key" ON "reports"("submission_id");

-- CreateIndex
CREATE INDEX "reports_phone_identifier_phone_hmac_key_version_created_at_idx" ON "reports"("phone_identifier", "phone_hmac_key_version", "created_at");

-- CreateIndex
CREATE INDEX "reports_status_created_at_idx" ON "reports"("status", "created_at");

-- CreateIndex
CREATE INDEX "reports_operator_id_created_at_idx" ON "reports"("operator_id", "created_at");

-- CreateIndex
CREATE INDEX "reports_tenant_id_status_created_at_idx" ON "reports"("tenant_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "reports_region_id_tenant_id_created_at_idx" ON "reports"("region_id", "tenant_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "report_images_object_key_key" ON "report_images"("object_key");

-- CreateIndex
CREATE INDEX "report_images_report_id_idx" ON "report_images"("report_id");

-- CreateIndex
CREATE UNIQUE INDEX "report_categories_code_key" ON "report_categories"("code");

-- CreateIndex
CREATE UNIQUE INDEX "report_categories_name_key" ON "report_categories"("name");

-- CreateIndex
CREATE INDEX "report_category_relations_category_id_idx" ON "report_category_relations"("category_id");

-- CreateIndex
CREATE INDEX "report_status_history_report_id_created_at_idx" ON "report_status_history"("report_id", "created_at");

-- CreateIndex
CREATE INDEX "report_ai_generations_report_id_created_at_idx" ON "report_ai_generations"("report_id", "created_at");

-- CreateIndex
CREATE INDEX "report_ai_generations_draft_token_hash_idx" ON "report_ai_generations"("draft_token_hash");

-- AddForeignKey
ALTER TABLE "regions" ADD CONSTRAINT "regions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admins" ADD CONSTRAINT "admins_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_sessions" ADD CONSTRAINT "admin_sessions_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "admins"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_completed_by_admin_id_fkey" FOREIGN KEY ("completed_by_admin_id") REFERENCES "admins"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_region_id_tenant_id_fkey" FOREIGN KEY ("region_id", "tenant_id") REFERENCES "regions"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "operators"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_images" ADD CONSTRAINT "report_images_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_category_relations" ADD CONSTRAINT "report_category_relations_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_category_relations" ADD CONSTRAINT "report_category_relations_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "report_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_status_history" ADD CONSTRAINT "report_status_history_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_status_history" ADD CONSTRAINT "report_status_history_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "admins"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_ai_generations" ADD CONSTRAINT "report_ai_generations_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Domain invariants intentionally live in SQL because Prisma schema has no CHECK syntax.
ALTER TABLE "admins" ADD CONSTRAINT "admins_role_tenant_check" CHECK (
  ("role" = 'PLATFORM_ADMIN' AND "tenant_id" IS NULL)
  OR ("role" = 'TENANT_ADMIN' AND "tenant_id" IS NOT NULL)
);

ALTER TABLE "reports" ADD CONSTRAINT "reports_phone_completeness_check" CHECK (
  num_nonnulls("contact_phone_cipher", "phone_encryption_key_version", "phone_identifier",
    "phone_hmac_key_version", "contact_phone_masked", "consent_version", "consented_at") IN (0, 7)
);

ALTER TABLE "reports" ADD CONSTRAINT "reports_completion_check" CHECK (
  ("status" = 'COMPLETED' AND num_nonnulls("completed_at", "completion_method", "completed_by_admin_id") = 3)
  OR ("status" <> 'COMPLETED' AND num_nonnulls("completed_at", "completion_method", "completed_by_admin_id") = 0)
);

ALTER TABLE "reports" ADD CONSTRAINT "reports_coordinates_check" CHECK (
  "latitude" BETWEEN -90 AND 90 AND "longitude" BETWEEN -180 AND 180
);

ALTER TABLE "reports" ADD CONSTRAINT "reports_submission_hash_check" CHECK (
  "submission_hash" ~ '^[0-9a-f]{64}$'
);

ALTER TABLE "report_status_history" ADD CONSTRAINT "report_status_history_actor_check" CHECK (
  ("previous_status" IS NULL AND "new_status" = 'RECEIVED' AND "admin_id" IS NULL)
  OR ("previous_status" IS NOT NULL AND "previous_status" <> "new_status" AND "admin_id" IS NOT NULL)
);

ALTER TABLE "report_status_history" ADD CONSTRAINT "report_status_history_completion_check" CHECK (
  ("new_status" = 'COMPLETED' AND "completion_method" IS NOT NULL)
  OR ("new_status" <> 'COMPLETED' AND "completion_method" IS NULL)
);

-- At most one initial system-received event per report. The service creates it atomically.
CREATE UNIQUE INDEX "report_status_history_initial_unique" ON "report_status_history" ("report_id")
WHERE "previous_status" IS NULL;

ALTER TABLE "report_images" ADD CONSTRAINT "report_images_evidence_check" CHECK (
  "size_bytes" > 0 AND "mime_type" IN ('image/jpeg', 'image/png', 'image/webp')
);

ALTER TABLE "report_ai_generations" ADD CONSTRAINT "report_ai_generations_metrics_check" CHECK (
  ("latency_ms" IS NULL OR "latency_ms" >= 0)
  AND ("input_tokens" IS NULL OR "input_tokens" >= 0)
  AND ("output_tokens" IS NULL OR "output_tokens" >= 0)
);

COMMIT;
