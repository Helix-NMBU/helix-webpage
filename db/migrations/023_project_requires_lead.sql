-- New and updated projects must have at least one assigned Lead.
-- Existing projects remain readable; editing an unassigned project requires
-- assigning a Lead in the same save.
begin;

alter table project_management.projects
  add constraint projects_require_lead
  check (cardinality(lead_ids) >= 1)
  not valid;

commit;
