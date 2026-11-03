-- PostgreSQL must commit the enum addition before it can be used in constraints.
ALTER TYPE "AdminRole" ADD VALUE 'COLLECTOR';
