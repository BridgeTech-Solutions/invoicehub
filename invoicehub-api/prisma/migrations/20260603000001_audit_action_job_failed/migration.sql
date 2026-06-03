-- Nouvelle valeur d'enum pour tracer les jobs BullMQ définitivement échoués.
ALTER TYPE "audit_action" ADD VALUE IF NOT EXISTS 'JOB_FAILED';
