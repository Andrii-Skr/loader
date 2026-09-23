-- Issue numbers are selected for a particular PDF document only. They must not
-- be reused as global rules for a parsed publication/issue pair.
DROP TABLE "pdf_loader"."publication_issue_mappings";
DROP TABLE "pdf_loader"."issue_number_mappings";
