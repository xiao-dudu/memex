-- supabase/migrations/202610300002_team_task_rpcs.sql

alter table public.team_operations
  add column if not exists operation_type text,
  add column if not exists result_json jsonb;

create or replace function public.claim_operation(
  p_operation_id uuid,
  p_team_id uuid,
  p_operation_type text
)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  insert into public.team_operations(id, team_id, user_id, operation_type)
  values (p_operation_id, p_team_id, auth.uid(), p_operation_type)
  on conflict (id) do nothing;
  return found;
end;
$$;

create or replace function public.operation_result(
  p_operation_id uuid,
  p_operation_type text
)
returns jsonb language sql stable security definer set search_path = public as $$
  select result_json from public.team_operations
  where id = p_operation_id and user_id = auth.uid() and operation_type = p_operation_type;
$$;

create or replace function public.assert_team_leader(p_team_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_team_leader(p_team_id) then raise exception 'NOT_AUTHORIZED'; end if;
end;
$$;

create or replace function public.assert_task_editor(p_task_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_task_editor(p_task_id) then raise exception 'NOT_AUTHORIZED'; end if;
end;
$$;

create or replace function public.assert_task_open(p_task_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.team_tasks where id = p_task_id and archived_at is not null) then
    raise exception 'TASK_ARCHIVED';
  end if;
end;
$$;

create or replace function public.assert_task_version(p_task_id uuid, p_expected integer)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.team_tasks where id = p_task_id and version = p_expected) then
    raise exception 'VERSION_CONFLICT';
  end if;
end;
$$;

create or replace function public.emit_task_event(
  p_task_id uuid,
  p_event public.team_event_type,
  p_target uuid default null,
  p_from public.team_assignee_status default null,
  p_to public.team_assignee_status default null,
  p_metadata jsonb default '{}'::jsonb
)
returns void language plpgsql security definer set search_path = public as $$
declare v_team_id uuid;
begin
  select team_id into v_team_id from public.team_tasks where id = p_task_id;
  insert into public.team_task_events(task_id, team_id, actor_id, event_type, target_user_id, from_status, to_status, metadata)
  values (p_task_id, v_team_id, auth.uid(), p_event, p_target, p_from, p_to, p_metadata);
end;
$$;

create or replace function public.notify_task_users(
  p_task_id uuid,
  p_type public.team_notification_type,
  p_title text,
  p_body text,
  p_user_ids uuid[]
)
returns void language plpgsql security definer set search_path = public as $$
declare v_team_id uuid;
begin
  select team_id into v_team_id from public.team_tasks where id = p_task_id;
  insert into public.team_notifications(team_id, user_id, type, task_id, title, body)
  select v_team_id, unnest(p_user_ids), p_type, p_task_id, p_title, p_body;
end;
$$;

create or replace function public.validate_task_approvers(
  p_team_id uuid,
  p_creator uuid,
  p_assignee_ids uuid[],
  p_leader_ids uuid[]
)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1
    from (
      select candidate.user_id
      from unnest(p_leader_ids) as candidate(user_id)
      where exists (
        select 1 from public.team_members m
        where m.team_id = p_team_id and m.user_id = candidate.user_id
          and m.role = 'leader' and m.status = 'active'
      )
      union
      select p_creator
      where p_creator is not null
        and exists (
          select 1 from public.team_members m
          where m.team_id = p_team_id and m.user_id = p_creator
            and m.role = 'leader' and m.status = 'active'
        )
    ) as approvers(user_id)
    where not (approvers.user_id = any(p_assignee_ids))
  ) then
    raise exception 'APPROVER_REQUIRED';
  end if;
end;
$$;

create or replace function public.validate_team_users(
  p_team_id uuid,
  p_user_ids uuid[],
  p_role public.team_role default null
)
returns void language plpgsql security definer set search_path = public as $$
begin
  if exists (
    select 1 from unnest(p_user_ids) as candidate(user_id)
    where not exists (
      select 1 from public.team_members m
      where m.team_id = p_team_id and m.user_id = candidate.user_id and m.status = 'active'
        and (p_role is null or m.role = p_role)
    )
  ) then
    raise exception 'NOT_AUTHORIZED';
  end if;
end;
$$;

create or replace function public.team_create_task(
  p_operation_id uuid,
  p_task_id uuid,
  p_team_id uuid,
  p_title text,
  p_description text,
  p_description_json text,
  p_priority text,
  p_due_at bigint,
  p_tags text[],
  p_assignee_ids uuid[],
  p_leader_ids uuid[]
)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_creator uuid := auth.uid();
begin
  perform public.assert_team_leader(p_team_id);
  if not public.claim_operation(p_operation_id, p_team_id, 'team_create_task') then
    return (public.operation_result(p_operation_id, 'team_create_task') #>> '{}')::uuid;
  end if;
  if p_leader_ids is null or cardinality(p_leader_ids) = 0 then raise exception 'APPROVER_REQUIRED'; end if;
  if p_assignee_ids is null or cardinality(p_assignee_ids) = 0 then raise exception 'INVALID_STATUS'; end if;
  perform public.validate_task_approvers(p_team_id, v_creator, p_assignee_ids, p_leader_ids);
  perform public.validate_team_users(p_team_id, p_assignee_ids, null);
  perform public.validate_team_users(p_team_id, p_leader_ids, 'leader');

  insert into public.team_tasks(id, team_id, title, description, description_json, priority, due_at, tags, created_by)
  values (p_task_id, p_team_id, p_title, p_description, p_description_json, coalesce(p_priority, 'medium'), p_due_at, coalesce(p_tags, '{}'), v_creator);

  insert into public.team_task_leaders(task_id, team_id, user_id)
  select p_task_id, p_team_id, unnest(p_leader_ids);

  insert into public.team_task_assignees(task_id, team_id, user_id)
  select p_task_id, p_team_id, unnest(p_assignee_ids);

  perform public.emit_task_event(p_task_id, 'created');
  perform public.notify_task_users(p_task_id, 'assigned', '收到新任务', p_title, p_assignee_ids);
  update public.team_operations
  set result_json = to_jsonb(p_task_id)
  where id = p_operation_id and user_id = auth.uid() and operation_type = 'team_create_task';
  return p_task_id;
end;
$$;

create or replace function public.team_update_task(
  p_operation_id uuid,
  p_task_id uuid,
  p_expected_version integer,
  p_title text,
  p_description text,
  p_description_json text,
  p_priority text,
  p_due_at bigint,
  p_tags text[],
  p_assignee_ids uuid[],
  p_leader_ids uuid[]
)
returns integer language plpgsql security definer set search_path = public as $$
declare v_team_id uuid; v_creator uuid; v_version integer; v_next_version integer;
begin
  perform public.assert_task_editor(p_task_id);
  perform public.assert_task_open(p_task_id);
  select team_id, created_by, version into v_team_id, v_creator, v_version
  from public.team_tasks where id = p_task_id for update;
  if not public.claim_operation(p_operation_id, v_team_id, 'team_update_task') then
    return (public.operation_result(p_operation_id, 'team_update_task') #>> '{}')::integer;
  end if;
  if v_version <> p_expected_version then raise exception 'VERSION_CONFLICT'; end if;
  if p_leader_ids is null or cardinality(p_leader_ids) = 0 then raise exception 'APPROVER_REQUIRED'; end if;
  if p_assignee_ids is null or cardinality(p_assignee_ids) = 0 then raise exception 'INVALID_STATUS'; end if;
  perform public.validate_task_approvers(v_team_id, v_creator, p_assignee_ids, p_leader_ids);
  perform public.validate_team_users(v_team_id, p_assignee_ids, null);
  perform public.validate_team_users(v_team_id, p_leader_ids, 'leader');

  if exists (
    select 1 from public.team_task_assignees
    where task_id = p_task_id
      and not (user_id = any(p_assignee_ids))
      and status not in ('approved', 'closed')
  ) then
    raise exception 'UNFINISHED_ASSIGNMENTS';
  end if;

  if not exists (
    select 1 from public.team_task_assignees
    where task_id = p_task_id and status not in ('approved', 'closed')
  ) and exists (
    select 1 from unnest(p_assignee_ids) as candidate(user_id)
    where not exists (
      select 1 from public.team_task_assignees existing
      where existing.task_id = p_task_id and existing.user_id = candidate.user_id
    )
  ) then
    raise exception 'INVALID_STATUS';
  end if;

  v_next_version := v_version + 1;
  update public.team_tasks
  set title = p_title,
      description = p_description,
      description_json = p_description_json,
      priority = p_priority,
      due_at = p_due_at,
      tags = coalesce(p_tags, '{}'),
      version = v_next_version
  where id = p_task_id;

  delete from public.team_task_leaders where task_id = p_task_id;
  insert into public.team_task_leaders(task_id, team_id, user_id)
  select p_task_id, v_team_id, unnest(p_leader_ids);

  insert into public.team_task_assignees(task_id, team_id, user_id)
  select p_task_id, v_team_id, unnest(p_assignee_ids)
  on conflict (task_id, user_id) do nothing;

  delete from public.team_task_assignees
  where task_id = p_task_id and not (user_id = any(p_assignee_ids));

  perform public.emit_task_event(p_task_id, 'assigned');
  update public.team_operations
  set result_json = to_jsonb(v_next_version)
  where id = p_operation_id and user_id = auth.uid() and operation_type = 'team_update_task';
  return v_next_version;
end;
$$;

create or replace function public.team_start_assignee(
  p_task_id uuid,
  p_expected_version integer,
  p_operation_id uuid
)
returns integer language plpgsql security definer set search_path = public as $$
declare v_team_id uuid; v_status public.team_assignee_status; v_version integer; v_next_version integer;
begin
  perform public.assert_task_open(p_task_id);
  select team_id, status, version into v_team_id, v_status, v_version
  from public.team_task_assignees
  where task_id = p_task_id and user_id = auth.uid()
  for update;
  if v_status is null then raise exception 'NOT_AUTHORIZED'; end if;
  if not public.is_team_member(v_team_id) then raise exception 'NOT_AUTHORIZED'; end if;
  if not public.claim_operation(p_operation_id, v_team_id, 'team_start_assignee') then
    return (public.operation_result(p_operation_id, 'team_start_assignee') #>> '{}')::integer;
  end if;
  if v_version <> p_expected_version then raise exception 'VERSION_CONFLICT'; end if;
  if v_status not in ('todo', 'doing') then raise exception 'INVALID_STATUS'; end if;
  v_next_version := v_version + 1;
  update public.team_task_assignees
  set status = 'doing', version = v_next_version
  where task_id = p_task_id and user_id = auth.uid();
  perform public.emit_task_event(p_task_id, 'started', auth.uid(), v_status, 'doing');
  update public.team_operations
  set result_json = to_jsonb(v_next_version)
  where id = p_operation_id and user_id = auth.uid() and operation_type = 'team_start_assignee';
  return v_next_version;
end;
$$;

create or replace function public.team_add_progress_note(
  p_task_id uuid,
  p_body text,
  p_operation_id uuid
)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_team_id uuid; v_note_id uuid := gen_random_uuid();
begin
  perform public.assert_task_open(p_task_id);
  select team_id into v_team_id from public.team_tasks where id = p_task_id;
  if not public.is_team_member(v_team_id) then raise exception 'NOT_AUTHORIZED'; end if;
  if not exists (select 1 from public.team_task_assignees where task_id = p_task_id and user_id = auth.uid()) then
    raise exception 'NOT_AUTHORIZED';
  end if;
  if not public.claim_operation(p_operation_id, v_team_id, 'team_add_progress_note') then
    return (public.operation_result(p_operation_id, 'team_add_progress_note') #>> '{}')::uuid;
  end if;
  insert into public.team_task_progress_notes(id, task_id, team_id, user_id, body)
  values (v_note_id, p_task_id, v_team_id, auth.uid(), p_body);
  update public.team_operations
  set result_json = to_jsonb(v_note_id)
  where id = p_operation_id and user_id = auth.uid() and operation_type = 'team_add_progress_note';
  return v_note_id;
end;
$$;

create or replace function public.team_submit_assignee(
  p_task_id uuid,
  p_note text,
  p_expected_version integer,
  p_operation_id uuid
)
returns integer language plpgsql security definer set search_path = public as $$
declare v_team_id uuid; v_status public.team_assignee_status; v_version integer; v_next_version integer;
begin
  perform public.assert_task_open(p_task_id);
  select team_id, status, version into v_team_id, v_status, v_version
  from public.team_task_assignees
  where task_id = p_task_id and user_id = auth.uid()
  for update;
  if v_status is null then raise exception 'NOT_AUTHORIZED'; end if;
  if not public.is_team_member(v_team_id) then raise exception 'NOT_AUTHORIZED'; end if;
  if not public.claim_operation(p_operation_id, v_team_id, 'team_submit_assignee') then
    return (public.operation_result(p_operation_id, 'team_submit_assignee') #>> '{}')::integer;
  end if;
  if v_version <> p_expected_version then raise exception 'VERSION_CONFLICT'; end if;
  if v_status <> 'doing' then raise exception 'INVALID_STATUS'; end if;
  if p_note is null or char_length(trim(p_note)) = 0 then raise exception 'INVALID_STATUS'; end if;
  v_next_version := v_version + 1;
  insert into public.team_task_progress_notes(task_id, team_id, user_id, body)
  values (p_task_id, v_team_id, auth.uid(), trim(p_note));
  update public.team_task_assignees set status = 'submitted', version = v_next_version
  where task_id = p_task_id and user_id = auth.uid();
  perform public.emit_task_event(p_task_id, 'submitted', auth.uid(), v_status, 'submitted');
  perform public.notify_task_users(
    p_task_id, 'assigned', '有新的待验收任务',
    (select title from public.team_tasks where id = p_task_id),
    array(select user_id from public.team_task_leaders where task_id = p_task_id
          union select created_by from public.team_tasks where id = p_task_id)
  );
  update public.team_operations
  set result_json = to_jsonb(v_next_version)
  where id = p_operation_id and user_id = auth.uid() and operation_type = 'team_submit_assignee';
  return v_next_version;
end;
$$;

create or replace function public.team_review_assignee(
  p_task_id uuid,
  p_assignee_id uuid,
  p_expected_version integer,
  p_decision text,
  p_note text,
  p_operation_id uuid
)
returns integer language plpgsql security definer set search_path = public as $$
declare v_team_id uuid; v_status public.team_assignee_status; v_version integer; v_next public.team_assignee_status; v_next_version integer;
begin
  perform public.assert_task_open(p_task_id);
  if not public.is_task_approver(p_task_id) then raise exception 'NOT_AUTHORIZED'; end if;
  if p_assignee_id = auth.uid() then raise exception 'SELF_APPROVAL_FORBIDDEN'; end if;
  select team_id, status, version into v_team_id, v_status, v_version
  from public.team_task_assignees
  where task_id = p_task_id and user_id = p_assignee_id
  for update;
  if v_status is null then raise exception 'NOT_AUTHORIZED'; end if;
  if not public.claim_operation(p_operation_id, v_team_id, 'team_review_assignee') then
    return (public.operation_result(p_operation_id, 'team_review_assignee') #>> '{}')::integer;
  end if;
  if v_version <> p_expected_version then raise exception 'VERSION_CONFLICT'; end if;
  if v_status <> 'submitted' then raise exception 'INVALID_STATUS'; end if;
  if p_decision not in ('approve', 'return') then raise exception 'INVALID_STATUS'; end if;
  v_next := case when p_decision = 'approve' then 'approved'::public.team_assignee_status else 'doing'::public.team_assignee_status end;
  v_next_version := v_version + 1;

  if p_note is not null and char_length(trim(p_note)) > 0 then
    insert into public.team_task_progress_notes(task_id, team_id, user_id, body)
    values (p_task_id, v_team_id, auth.uid(), trim(p_note));
  end if;

  update public.team_task_assignees
  set status = v_next,
      approved_by = case when v_next = 'approved' then auth.uid() else null end,
      approved_at = case when v_next = 'approved' then public.epoch_ms() else null end,
      version = v_next_version
  where task_id = p_task_id and user_id = p_assignee_id;

  perform public.emit_task_event(p_task_id, case when v_next = 'approved' then 'approved'::public.team_event_type else 'returned'::public.team_event_type end, p_assignee_id, v_status, v_next);
  perform public.notify_task_users(
    p_task_id,
    case when v_next = 'approved' then 'approved'::public.team_notification_type else 'returned'::public.team_notification_type end,
    case when v_next = 'approved' then '分项已通过' else '分项被退回' end,
    (select title from public.team_tasks where id = p_task_id),
    array[p_assignee_id]
  );

  if not exists (select 1 from public.team_task_assignees where task_id = p_task_id and status not in ('approved', 'closed')) then
    perform public.notify_task_users(
      p_task_id, 'task_completed', '团队任务已完成',
      (select title from public.team_tasks where id = p_task_id),
      array(select user_id from public.team_task_leaders where task_id = p_task_id union select created_by from public.team_tasks where id = p_task_id)
    );
  end if;
  update public.team_operations
  set result_json = to_jsonb(v_next_version)
  where id = p_operation_id and user_id = auth.uid() and operation_type = 'team_review_assignee';
  return v_next_version;
end;
$$;

create or replace function public.team_reopen_task(
  p_task_id uuid,
  p_expected_version integer,
  p_operation_id uuid
)
returns integer language plpgsql security definer set search_path = public as $$
declare v_team_id uuid; v_version integer; v_next_version integer;
begin
  perform public.assert_task_editor(p_task_id);
  select team_id, version into v_team_id, v_version
  from public.team_tasks where id = p_task_id for update;
  if not public.claim_operation(p_operation_id, v_team_id, 'team_reopen_task') then
    return (public.operation_result(p_operation_id, 'team_reopen_task') #>> '{}')::integer;
  end if;
  if v_version <> p_expected_version then raise exception 'VERSION_CONFLICT'; end if;
  if exists (select 1 from public.team_task_assignees where task_id = p_task_id and status not in ('approved', 'closed')) then
    raise exception 'INVALID_STATUS';
  end if;
  v_next_version := v_version + 1;
  update public.team_task_assignees set status = 'doing', version = version + 1
  where task_id = p_task_id and status = 'approved';
  update public.team_tasks set archived_at = null, version = v_next_version where id = p_task_id;
  perform public.emit_task_event(p_task_id, 'reopened');
  perform public.notify_task_users(
    p_task_id, 'assigned', '任务已重新打开',
    (select title from public.team_tasks where id = p_task_id),
    array(select user_id from public.team_task_assignees where task_id = p_task_id)
  );
  update public.team_operations
  set result_json = to_jsonb(v_next_version)
  where id = p_operation_id and user_id = auth.uid() and operation_type = 'team_reopen_task';
  return v_next_version;
end;
$$;

create or replace function public.team_archive_task(
  p_task_id uuid,
  p_expected_version integer,
  p_operation_id uuid
)
returns integer language plpgsql security definer set search_path = public as $$
declare v_team_id uuid; v_version integer; v_next_version integer;
begin
  perform public.assert_task_editor(p_task_id);
  select team_id, version into v_team_id, v_version
  from public.team_tasks where id = p_task_id for update;
  if not public.claim_operation(p_operation_id, v_team_id, 'team_archive_task') then
    return (public.operation_result(p_operation_id, 'team_archive_task') #>> '{}')::integer;
  end if;
  if v_version <> p_expected_version then raise exception 'VERSION_CONFLICT'; end if;
  v_next_version := v_version + 1;
  update public.team_tasks set archived_at = public.epoch_ms(), version = v_next_version where id = p_task_id;
  perform public.emit_task_event(p_task_id, 'archived');
  update public.team_operations
  set result_json = to_jsonb(v_next_version)
  where id = p_operation_id and user_id = auth.uid() and operation_type = 'team_archive_task';
  return v_next_version;
end;
$$;

create or replace function public.team_close_assignee(
  p_task_id uuid,
  p_assignee_id uuid,
  p_reason text,
  p_expected_version integer,
  p_operation_id uuid
)
returns integer language plpgsql security definer set search_path = public as $$
declare v_team_id uuid; v_status public.team_assignee_status; v_version integer; v_next_version integer;
begin
  perform public.assert_task_editor(p_task_id);
  perform public.assert_task_open(p_task_id);
  select team_id, status, version into v_team_id, v_status, v_version
  from public.team_task_assignees
  where task_id = p_task_id and user_id = p_assignee_id
  for update;
  if v_status is null then raise exception 'NOT_AUTHORIZED'; end if;
  if not public.claim_operation(p_operation_id, v_team_id, 'team_close_assignee') then
    return (public.operation_result(p_operation_id, 'team_close_assignee') #>> '{}')::integer;
  end if;
  if v_version <> p_expected_version then raise exception 'VERSION_CONFLICT'; end if;
  if v_status = 'approved' then raise exception 'INVALID_STATUS'; end if;
  v_next_version := v_version + 1;
  update public.team_task_assignees
  set status = 'closed', closed_by = auth.uid(), closed_at = public.epoch_ms(), version = v_next_version
  where task_id = p_task_id and user_id = p_assignee_id;
  perform public.emit_task_event(p_task_id, 'closed', p_assignee_id, v_status, 'closed', jsonb_build_object('reason', coalesce(p_reason, '')));
  update public.team_operations
  set result_json = to_jsonb(v_next_version)
  where id = p_operation_id and user_id = auth.uid() and operation_type = 'team_close_assignee';
  return v_next_version;
end;
$$;

create or replace function public.team_mark_notification_read(
  p_notification_id uuid,
  p_operation_id uuid
)
returns void language plpgsql security definer set search_path = public as $$
declare v_team_id uuid;
begin
  select team_id into v_team_id
  from public.team_notifications
  where id = p_notification_id and user_id = auth.uid();
  if v_team_id is null then raise exception 'NOT_AUTHORIZED'; end if;
  if not public.claim_operation(p_operation_id, v_team_id, 'team_mark_notification_read') then return; end if;
  update public.team_notifications set read_at = public.epoch_ms() where id = p_notification_id and user_id = auth.uid();
end;
$$;

grant execute on function public.team_create_task(uuid, uuid, uuid, text, text, text, text, bigint, text[], uuid[], uuid[]) to authenticated;
grant execute on function public.team_update_task(uuid, uuid, integer, text, text, text, text, bigint, text[], uuid[], uuid[]) to authenticated;
grant execute on function public.team_start_assignee(uuid, integer, uuid) to authenticated;
grant execute on function public.team_add_progress_note(uuid, text, uuid) to authenticated;
grant execute on function public.team_submit_assignee(uuid, text, integer, uuid) to authenticated;
grant execute on function public.team_review_assignee(uuid, uuid, integer, text, text, uuid) to authenticated;
grant execute on function public.team_reopen_task(uuid, integer, uuid) to authenticated;
grant execute on function public.team_archive_task(uuid, integer, uuid) to authenticated;
grant execute on function public.team_close_assignee(uuid, uuid, text, integer, uuid) to authenticated;
grant execute on function public.team_mark_notification_read(uuid, uuid) to authenticated;
revoke execute on function public.claim_operation(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.operation_result(uuid, text) from public, anon, authenticated;
revoke execute on function public.assert_team_leader(uuid) from public, anon, authenticated;
revoke execute on function public.assert_task_editor(uuid) from public, anon, authenticated;
revoke execute on function public.assert_task_open(uuid) from public, anon, authenticated;
revoke execute on function public.assert_task_version(uuid, integer) from public, anon, authenticated;
revoke execute on function public.emit_task_event(uuid, public.team_event_type, uuid, public.team_assignee_status, public.team_assignee_status, jsonb) from public, anon, authenticated;
revoke execute on function public.notify_task_users(uuid, public.team_notification_type, text, text, uuid[]) from public, anon, authenticated;
revoke execute on function public.validate_task_approvers(uuid, uuid, uuid[], uuid[]) from public, anon, authenticated;
revoke execute on function public.validate_team_users(uuid, uuid[], public.team_role) from public, anon, authenticated;