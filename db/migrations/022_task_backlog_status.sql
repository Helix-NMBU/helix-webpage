-- Add Backlog to tasks and observed progress without rewriting existing records.
begin;
alter table project_management.tasks drop constraint if exists tasks_status_check;
alter table project_management.tasks add constraint tasks_status_check
  check(status in ('backlog','todo','in_progress','done','blocked','cancelled'));
alter table project_management.task_progress_events drop constraint if exists task_progress_events_status_check;
alter table project_management.task_progress_events add constraint task_progress_events_status_check
  check(status in ('backlog','todo','in_progress','done','blocked','cancelled'));
commit;
