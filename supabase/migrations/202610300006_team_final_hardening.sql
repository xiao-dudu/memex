-- Final team-mode hardening: archived tasks, terminal progress notes,
-- notification membership checks, member removal/leave audit, and demotion
-- invariants that keep every active task approvable by a non-assignee leader.

create table if not exists public.team_member_events (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  actor_id uuid not null references auth.users(id),
  target_user_id uuid not null references auth.users(id),
  event_type text not null check (event_type in ('removed', 'left')),
  created_at bigint not null default public.epoch_ms(),
  sync_version bigint not null default nextval('public.team_sync_seq')
);

create index if not exists team_member_events_team_sync
  on public.team_member_events(team_id, sync_version);

alter table public.team_member_events enable row level security;

drop policy if exists member_events_select on public.team_member_events;
create policy member_events_select on public.team_member_events
  for select using (public.is_team_leader(team_id));

revoke all on public.team_member_events from anon, authenticated;
grant select on public.team_member_events to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.team_member_events;
exception when duplicate_object then
  null;
end;
$$;

drop policy if exists notifications_select on public.team_notifications;
create policy notifications_select on public.team_notifications
  for select using (
    user_id = auth.uid()
    and public.is_team_member(team_id)
  );

create or replace function public.task_has_valid_approver(
  p_task_id uuid,
  p_excluded_user_id uuid default null
)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from public.team_tasks t
    join public.team_members m
      on m.team_id = t.team_id
     and m.status = 'active'
     and m.role = 'leader'
    where t.id = p_task_id
      and (p_excluded_user_id is null or m.user_id <> p_excluded_user_id)
      and not exists (
        select 1 from public.team_task_assignees a
        where a.task_id = t.id and a.user_id = m.user_id
      )
      and (
        m.user_id = t.created_by
        or exists (
          select 1 from public.team_task_leaders l
          where l.task_id = t.id and l.user_id = m.user_id
        )
      )
  );
$$;

revoke execute on function public.task_has_valid_approver(uuid, uuid) from public, anon, authenticated;

create or replace function public.team_add_progress_note(
  p_task_id uuid,
  p_note_id uuid,
  p_body text,
  p_operation_id uuid
)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_team_id uuid; v_status public.team_assignee_status;
begin
  select team_id into v_team_id from public.team_tasks where id = p_task_id;
  if v_team_id is null then raise exception 'NOT_AUTHORIZED'; end if;
  perform 1 from public.teams where id = v_team_id for update;
  perform public.assert_task_open(p_task_id);
  if not public.is_team_member(v_team_id) then raise exception 'NOT_AUTHORIZED'; end if;
  select status into v_status
  from public.team_task_assignees
  where task_id = p_task_id and user_id = auth.uid()
  for update;
  if v_status is null then raise exception 'NOT_AUTHORIZED'; end if;
  if not public.claim_operation(p_operation_id, v_team_id, 'team_add_progress_note') then
    return (public.operation_result(p_operation_id, 'team_add_progress_note') #>> '{}')::uuid;
  end if;
  if p_note_id is null then raise exception 'INVALID_STATUS'; end if;
  if p_body is null or char_length(trim(p_body)) = 0 then raise exception 'INVALID_STATUS'; end if;
  if v_status not in ('todo', 'doing', 'submitted') then raise exception 'INVALID_STATUS'; end if;
  insert into public.team_task_progress_notes(id, task_id, team_id, user_id, body)
  values (p_note_id, p_task_id, v_team_id, auth.uid(), trim(p_body));
  update public.team_operations
  set result_json = to_jsonb(p_note_id)
  where id = p_operation_id and user_id = auth.uid() and operation_type = 'team_add_progress_note';
  return p_note_id;
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
  perform 1 from public.teams where id = v_team_id for update;
  if not public.is_team_member(v_team_id) then raise exception 'NOT_AUTHORIZED'; end if;
  if not public.claim_operation(p_operation_id, v_team_id, 'team_mark_notification_read') then return; end if;
  update public.team_notifications set read_at = public.epoch_ms() where id = p_notification_id and user_id = auth.uid();
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
  select team_id into v_team_id from public.team_tasks where id = p_task_id;
  if v_team_id is null then raise exception 'NOT_AUTHORIZED'; end if;
  perform 1 from public.teams where id = v_team_id for update;
  perform public.assert_task_open(p_task_id);
  perform public.assert_task_editor(p_task_id);
  select version into v_version
  from public.team_tasks where id = p_task_id for update;
  if v_version is null then raise exception 'NOT_AUTHORIZED'; end if;
  if not public.claim_operation(p_operation_id, v_team_id, 'team_reopen_task') then
    return (public.operation_result(p_operation_id, 'team_reopen_task') #>> '{}')::integer;
  end if;
  if v_version <> p_expected_version then raise exception 'VERSION_CONFLICT'; end if;
  if exists (select 1 from public.team_task_assignees where task_id = p_task_id and status not in ('approved', 'closed')) then
    raise exception 'INVALID_STATUS';
  end if;
  if exists (
    select 1 from public.team_task_assignees a
    where a.task_id = p_task_id and a.status = 'approved'
      and not exists (
        select 1 from public.team_members m
        where m.team_id = v_team_id and m.user_id = a.user_id and m.status = 'active'
      )
  ) then
    raise exception 'NOT_AUTHORIZED';
  end if;
  if exists (
    select 1 from public.team_task_leaders l
    where l.task_id = p_task_id and l.team_id = v_team_id
      and not exists (
        select 1 from public.team_members m
        where m.team_id = v_team_id and m.user_id = l.user_id and m.status = 'active' and m.role = 'leader'
      )
  ) then
    raise exception 'NOT_AUTHORIZED';
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
  select team_id into v_team_id from public.team_tasks where id = p_task_id;
  if v_team_id is null then raise exception 'NOT_AUTHORIZED'; end if;
  perform 1 from public.teams where id = v_team_id for update;
  perform public.assert_task_editor(p_task_id);
  select version into v_version
  from public.team_tasks where id = p_task_id for update;
  if v_version is null then raise exception 'NOT_AUTHORIZED'; end if;
  if not public.claim_operation(p_operation_id, v_team_id, 'team_archive_task') then
    return (public.operation_result(p_operation_id, 'team_archive_task') #>> '{}')::integer;
  end if;
  if v_version <> p_expected_version then raise exception 'VERSION_CONFLICT'; end if;
  if exists (select 1 from public.team_tasks where id = p_task_id and archived_at is not null) then
    raise exception 'TASK_ARCHIVED';
  end if;
  v_next_version := v_version + 1;
  update public.team_tasks set archived_at = public.epoch_ms(), version = v_next_version where id = p_task_id;
  perform public.emit_task_event(p_task_id, 'archived');
  update public.team_operations
  set result_json = to_jsonb(v_next_version)
  where id = p_operation_id and user_id = auth.uid() and operation_type = 'team_archive_task';
  return v_next_version;
end;
$$;

create or replace function public.team_set_member_role(
  p_team_id uuid,
  p_user_id uuid,
  p_role public.team_role,
  p_operation_id uuid
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_current public.team_role;
  v_leader_count integer;
begin
  if exists (
    select 1 from public.team_operations
    where id = p_operation_id
      and user_id = auth.uid()
      and operation_type = 'set_member_role'
      and team_id = p_team_id
  ) then
    return;
  end if;
  if auth.uid() is null then raise exception 'NOT_AUTHORIZED'; end if;
  if p_role is null then raise exception 'INVALID_STATUS'; end if;

  perform id from public.teams where id = p_team_id for update;
  perform public.assert_team_leader(p_team_id);

  select role into v_current
  from public.team_members
  where team_id = p_team_id and user_id = p_user_id and status = 'active';
  if v_current is null then raise exception 'NOT_AUTHORIZED'; end if;

  if v_current = 'leader' and p_role = 'member' then
    select count(*) into v_leader_count
    from public.team_members
    where team_id = p_team_id and role = 'leader' and status = 'active';
    if v_leader_count <= 1 then raise exception 'LAST_LEADER'; end if;
    if exists (
      select 1
      from public.team_tasks t
      where t.team_id = p_team_id
        and t.archived_at is null
        and (
          t.created_by = p_user_id
          or exists (
            select 1 from public.team_task_leaders l
            where l.task_id = t.id and l.user_id = p_user_id
          )
        )
        and not public.task_has_valid_approver(t.id, p_user_id)
    ) then
      raise exception 'APPROVER_REQUIRED';
    end if;
  end if;

  if not public.claim_operation(p_operation_id, p_team_id, 'set_member_role') then
    if exists (
      select 1 from public.team_operations
      where id = p_operation_id
        and user_id = auth.uid()
        and team_id = p_team_id
        and operation_type = 'set_member_role'
    ) then
      return;
    end if;
    raise exception 'OPERATION_CONFLICT';
  end if;

  update public.team_members
  set role = p_role
  where team_id = p_team_id and user_id = p_user_id and status = 'active';

  if v_current = 'leader' and p_role = 'member' then
    delete from public.team_task_leaders
    where team_id = p_team_id and user_id = p_user_id;
  end if;
end;
$$;

create or replace function public.team_remove_member(
  p_team_id uuid,
  p_user_id uuid,
  p_operation_id uuid
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_role public.team_role;
  v_leader_count integer;
begin
  if exists (
    select 1 from public.team_operations
    where id = p_operation_id
      and user_id = auth.uid()
      and operation_type = 'remove_member'
      and team_id = p_team_id
  ) then
    return;
  end if;
  if auth.uid() is null then raise exception 'NOT_AUTHORIZED'; end if;

  perform id from public.teams where id = p_team_id for update;
  perform public.assert_team_leader(p_team_id);

  select role into v_role
  from public.team_members
  where team_id = p_team_id and user_id = p_user_id and status = 'active';
  if v_role is null then
    if exists (
      select 1 from public.team_operations
      where id = p_operation_id
        and user_id = auth.uid()
        and operation_type = 'remove_member'
        and team_id = p_team_id
    ) then
      return;
    end if;
    raise exception 'NOT_AUTHORIZED';
  end if;

  if v_role = 'leader' then
    select count(*) into v_leader_count
    from public.team_members
    where team_id = p_team_id and role = 'leader' and status = 'active';
    if v_leader_count <= 1 then raise exception 'LAST_LEADER'; end if;
  end if;

  if exists (
    select 1
    from public.team_task_assignees a
    join public.team_tasks t on t.id = a.task_id
    where a.team_id = p_team_id
      and a.user_id = p_user_id
      and t.archived_at is null
      and a.status not in ('approved', 'closed')
  ) then
    raise exception 'UNFINISHED_ASSIGNMENTS';
  end if;

  if exists (
    select 1
    from public.team_task_leaders l
    join public.team_tasks t on t.id = l.task_id
    where l.team_id = p_team_id
      and l.user_id = p_user_id
      and t.archived_at is null
  ) then
    raise exception 'TASK_LEADERSHIP_NOT_TRANSFERRED';
  end if;

  if not public.claim_operation(p_operation_id, p_team_id, 'remove_member') then
    if exists (
      select 1 from public.team_operations
      where id = p_operation_id
        and user_id = auth.uid()
        and team_id = p_team_id
        and operation_type = 'remove_member'
    ) then
      return;
    end if;
    raise exception 'OPERATION_CONFLICT';
  end if;

  update public.team_members
  set status = 'removed', removed_at = public.epoch_ms()
  where team_id = p_team_id and user_id = p_user_id and status = 'active';

  insert into public.team_member_events(team_id, actor_id, target_user_id, event_type)
  values (p_team_id, auth.uid(), p_user_id, 'removed');
end;
$$;

create or replace function public.team_leave_team(
  p_team_id uuid,
  p_operation_id uuid
)
returns void language plpgsql security definer set search_path = public as $$
declare v_role public.team_role; v_leader_count integer;
begin
  if exists (
    select 1 from public.team_operations
    where id = p_operation_id
      and user_id = auth.uid()
      and operation_type = 'leave_team'
      and team_id = p_team_id
  ) then
    return;
  end if;
  if auth.uid() is null then raise exception 'NOT_AUTHORIZED'; end if;

  perform id from public.teams where id = p_team_id for update;
  select role into v_role
  from public.team_members
  where team_id = p_team_id and user_id = auth.uid() and status = 'active';
  if v_role is null then raise exception 'NOT_AUTHORIZED'; end if;

  if v_role = 'leader' then
    select count(*) into v_leader_count
    from public.team_members
    where team_id = p_team_id and role = 'leader' and status = 'active';
    if v_leader_count <= 1 then raise exception 'LAST_LEADER'; end if;
  end if;

  if exists (
    select 1
    from public.team_task_assignees a
    join public.team_tasks t on t.id = a.task_id
    where a.team_id = p_team_id
      and a.user_id = auth.uid()
      and t.archived_at is null
      and a.status not in ('approved', 'closed')
  ) then
    raise exception 'UNFINISHED_ASSIGNMENTS';
  end if;

  if exists (
    select 1
    from public.team_task_leaders l
    join public.team_tasks t on t.id = l.task_id
    where l.team_id = p_team_id
      and l.user_id = auth.uid()
      and t.archived_at is null
  ) then
    raise exception 'TASK_LEADERSHIP_NOT_TRANSFERRED';
  end if;

  if not public.claim_operation(p_operation_id, p_team_id, 'leave_team') then
    if exists (
      select 1 from public.team_operations
      where id = p_operation_id
        and user_id = auth.uid()
        and team_id = p_team_id
        and operation_type = 'leave_team'
    ) then
      return;
    end if;
    raise exception 'OPERATION_CONFLICT';
  end if;

  update public.team_members
  set status = 'removed', removed_at = public.epoch_ms()
  where team_id = p_team_id and user_id = auth.uid() and status = 'active';

  insert into public.team_member_events(team_id, actor_id, target_user_id, event_type)
  values (p_team_id, auth.uid(), auth.uid(), 'left');
end;
$$;

revoke execute on function public.team_add_progress_note(uuid, uuid, text, uuid) from public, anon;
revoke execute on function public.team_mark_notification_read(uuid, uuid) from public, anon;
revoke execute on function public.team_reopen_task(uuid, integer, uuid) from public, anon;
revoke execute on function public.team_archive_task(uuid, integer, uuid) from public, anon;
revoke execute on function public.team_set_member_role(uuid, uuid, public.team_role, uuid) from public, anon;
revoke execute on function public.team_remove_member(uuid, uuid, uuid) from public, anon;
revoke execute on function public.team_leave_team(uuid, uuid) from public, anon;

grant execute on function public.team_add_progress_note(uuid, uuid, text, uuid) to authenticated;
grant execute on function public.team_mark_notification_read(uuid, uuid) to authenticated;
grant execute on function public.team_reopen_task(uuid, integer, uuid) to authenticated;
grant execute on function public.team_archive_task(uuid, integer, uuid) to authenticated;
grant execute on function public.team_set_member_role(uuid, uuid, public.team_role, uuid) to authenticated;
grant execute on function public.team_remove_member(uuid, uuid, uuid) to authenticated;
grant execute on function public.team_leave_team(uuid, uuid) to authenticated;
