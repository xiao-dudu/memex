-- Client-generated progress note ids keep optimistic cache rows and server
-- rows identical across retries.
drop function if exists public.team_add_progress_note(uuid, text, uuid);
drop function if exists public.team_submit_assignee(uuid, text, integer, uuid);

create or replace function public.team_add_progress_note(
  p_task_id uuid,
  p_note_id uuid,
  p_body text,
  p_operation_id uuid
)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_team_id uuid;
begin
  select team_id into v_team_id from public.team_tasks where id = p_task_id;
  if v_team_id is null then raise exception 'NOT_AUTHORIZED'; end if;
  perform 1 from public.teams where id = v_team_id for update;
  perform public.assert_task_open(p_task_id);
  if not public.is_team_member(v_team_id) then raise exception 'NOT_AUTHORIZED'; end if;
  perform 1 from public.team_task_assignees
  where task_id = p_task_id and user_id = auth.uid()
  for update;
  if not found then raise exception 'NOT_AUTHORIZED'; end if;
  if not public.claim_operation(p_operation_id, v_team_id, 'team_add_progress_note') then
    return (public.operation_result(p_operation_id, 'team_add_progress_note') #>> '{}')::uuid;
  end if;
  if p_note_id is null then raise exception 'INVALID_STATUS'; end if;
  insert into public.team_task_progress_notes(id, task_id, team_id, user_id, body)
  values (p_note_id, p_task_id, v_team_id, auth.uid(), p_body);
  update public.team_operations
  set result_json = to_jsonb(p_note_id)
  where id = p_operation_id and user_id = auth.uid() and operation_type = 'team_add_progress_note';
  return p_note_id;
end;
$$;

create or replace function public.team_submit_assignee(
  p_task_id uuid,
  p_note_id uuid,
  p_note text,
  p_expected_version integer,
  p_operation_id uuid
)
returns integer language plpgsql security definer set search_path = public as $$
declare v_team_id uuid; v_status public.team_assignee_status; v_version integer; v_next_version integer;
begin
  select team_id into v_team_id from public.team_tasks where id = p_task_id;
  if v_team_id is null then raise exception 'NOT_AUTHORIZED'; end if;
  perform 1 from public.teams where id = v_team_id for update;
  perform public.assert_task_open(p_task_id);
  if not public.is_team_member(v_team_id) then raise exception 'NOT_AUTHORIZED'; end if;
  select status, version into v_status, v_version
  from public.team_task_assignees
  where task_id = p_task_id and user_id = auth.uid()
  for update;
  if v_status is null then raise exception 'NOT_AUTHORIZED'; end if;
  if not public.claim_operation(p_operation_id, v_team_id, 'team_submit_assignee') then
    return (public.operation_result(p_operation_id, 'team_submit_assignee') #>> '{}')::integer;
  end if;
  if v_version <> p_expected_version then raise exception 'VERSION_CONFLICT'; end if;
  if v_status <> 'doing' then raise exception 'INVALID_STATUS'; end if;
  if p_note is null or char_length(trim(p_note)) = 0 then raise exception 'INVALID_STATUS'; end if;
  if p_note_id is null then raise exception 'INVALID_STATUS'; end if;
  v_next_version := v_version + 1;
  insert into public.team_task_progress_notes(id, task_id, team_id, user_id, body)
  values (p_note_id, p_task_id, v_team_id, auth.uid(), trim(p_note));
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

revoke execute on function public.team_add_progress_note(uuid, uuid, text, uuid) from public, anon;
revoke execute on function public.team_submit_assignee(uuid, uuid, text, integer, uuid) from public, anon;
grant execute on function public.team_add_progress_note(uuid, uuid, text, uuid) to authenticated;
grant execute on function public.team_submit_assignee(uuid, uuid, text, integer, uuid) to authenticated;
