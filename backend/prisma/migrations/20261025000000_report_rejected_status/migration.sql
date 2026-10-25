-- Rejection closes a report without collection/towing completion metadata.
-- Existing report and history CHECK constraints already require completion
-- fields only for COMPLETED, so the enum extension is sufficient.
ALTER TYPE "ReportStatus" ADD VALUE IF NOT EXISTS 'REJECTED';
