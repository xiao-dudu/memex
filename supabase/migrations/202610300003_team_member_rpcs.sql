-- supabase/migrations/202610300003_team_member_rpcs.sql

create or replace function public.team_create_team(
  p_team_id uuid,
  p_name text,
  p_display_name text,
  p_operation_id uuid
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_display_name text;
  v_result jsonb;
  v_team_inserted boolean := false;
begin
  v_result := public.operation_result(p_operation_id, 'create_team');
  if v_result is not null then
    return (v_result #>> '{}')::uuid;
  end if;
  if auth.uid() is null then raise exception 'NOT_AUTHORIZED'; end if;
  if exists (
    select 1 from public.team_members
    where user_id = auth.uid() and status = 'active'
  ) then
    raise exception 'ALREADY_IN_TEAM';
  end if;

  insert into public.teams(id, name, created_by)
  values (p_team_id, p_name, auth.uid());
  v_team_inserted := true;

  if not public.claim_operation(p_operation_id, p_team_id, 'create_team') then
    v_result := public.operation_result(p_operation_id, 'create_team');
    if v_result is not null then
      if v_team_inserted then
        delete from public.teams where id = p_team_id;
      end if;
      return (v_result #>> '{}')::uuid;
    end if;
    raise exception 'OPERATION_CONFLICT';
  end if;

  v_display_name := coalesce(nullif(trim(p_display_name), ''), nullif(split_part(v_email, '@', 1), ''), '成员');
  insert into public.team_members(team_id, user_id, role, email, display_name)
  values (p_team_id, auth.uid(), 'leader', v_email, v_display_name);

  update public.team_operations
  set result_json = to_jsonb(p_team_id)
  where id = p_operation_id;
  return p_team_id;
exception when unique_violation then
  v_result := public.operation_result(p_operation_id, 'create_team');
  if v_result is not null then
    if v_team_inserted then
      delete from public.teams where id = p_team_id;
    end if;
    return (v_result #>> '{}')::uuid;
  end if;
  raise exception 'ALREADY_IN_TEAM';
end;
$$;

create or replace function public.team_create_invite(
  p_team_id uuid,
  p_email text,
  p_expires_at bigint,
  p_operation_id uuid
)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_token text := encode(extensions.gen_random_bytes(32), 'hex');
  v_email text := lower(trim(coalesce(p_email, '')));
  v_team_id uuid := p_team_id;
begin
  perform 1 from public.teams where id = v_team_id for update;
  perform public.assert_team_leader(p_team_id);
  if v_email = '' then raise exception 'INVALID_STATUS'; end if;
  if p_expires_at is null or p_expires_at <= public.epoch_ms() then
    raise exception 'INVALID_STATUS';
  end if;
  -- Invite creation is online-only: the plaintext token is returned once and
  -- must not be persisted in team_operations. A retry creates a fresh invite.
  insert into public.team_invites(team_id, email, token_hash, expires_at, created_by)
  values (p_team_id, v_email, extensions.digest(v_token, 'sha256'), p_expires_at, auth.uid());
  return v_token;
end;
$$;

create or replace function public.team_accept_invite(
  p_token text,
  p_display_name text,
  p_operation_id uuid
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_invite public.team_invites%rowtype;
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_result jsonb;
  v_team_id uuid;
begin
  v_result := public.operation_result(p_operation_id, 'accept_invite');
  if v_result is not null then
    return (v_result #>> '{}')::uuid;
  end if;
  if auth.uid() is null then raise exception 'NOT_AUTHORIZED'; end if;

  select team_id into v_team_id
  from public.team_invites
  where token_hash = extensions.digest(p_token, 'sha256')
  limit 1;
  if v_team_id is null then
    v_result := public.operation_result(p_operation_id, 'accept_invite');
    if v_result is not null then
      return (v_result #>> '{}')::uuid;
    end if;
    raise exception 'INVITE_INVALID';
  end if;

  perform 1 from public.teams where id = v_team_id for update;

  select * into v_invite
  from public.team_invites
  where token_hash = extensions.digest(p_token, 'sha256')
    and accepted_at is null
    and revoked_at is null
    and expires_at > public.epoch_ms()
  for update;
  if v_invite.id is null then
    v_result := public.operation_result(p_operation_id, 'accept_invite');
    if v_result is not null then
      return (v_result #>> '{}')::uuid;
    end if;
    raise exception 'INVITE_INVALID';
  end if;
  if lower(v_invite.email) <> v_email then raise exception 'INVITE_EMAIL_MISMATCH'; end if;
  if exists (
    select 1 from public.team_members
    where team_id = v_invite.team_id and user_id = auth.uid() and status = 'active'
  ) then
    raise exception 'ALREADY_IN_TEAM';
  end if;

  if not public.claim_operation(p_operation_id, v_invite.team_id, 'accept_invite') then
    v_result := public.operation_result(p_operation_id, 'accept_invite');
    if v_result is not null then
      return (v_result #>> '{}')::uuid;
    end if;
    raise exception 'OPERATION_CONFLICT';
  end if;

  insert into public.team_members(team_id, user_id, role, email, display_name, status, removed_at)
  values (
    v_invite.team_id,
    auth.uid(),
    'member',
    v_email,
    coalesce(nullif(trim(p_display_name), ''), nullif(split_part(v_email, '@', 1), ''), '成员'),
    'active',
    null
  )
  on conflict (team_id, user_id) do update
    set status = 'active',
        role = 'member',
        removed_at = null,
        display_name = excluded.display_name;

  update public.team_invites
  set accepted_at = public.epoch_ms()
  where id = v_invite.id;
  update public.team_operations
  set result_json = to_jsonb(v_invite.team_id)
  where id = p_operation_id;
  return v_invite.team_id;
exception when unique_violation then
  raise exception 'ALREADY_IN_TEAM';
end;
$$;

create or replace function public.team_revoke_invite(
  p_invite_id uuid,
  p_operation_id uuid
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_team_id uuid;
  v_invite_team_id uuid;
begin
  if exists (
    select 1 from public.team_operations
    where id = p_operation_id
      and user_id = auth.uid()
      and operation_type = 'revoke_invite'
      and team_id = (select team_id from public.team_invites where id = p_invite_id)
  ) then
    return;
  end if;
  if auth.uid() is null then raise exception 'NOT_AUTHORIZED'; end if;

  select team_id into v_team_id
  from public.team_invites
  where id = p_invite_id;
  if v_team_id is null then raise exception 'NOT_AUTHORIZED'; end if;

  perform 1 from public.teams where id = v_team_id for update;
  perform public.assert_team_leader(v_team_id);

  select team_id into v_invite_team_id
  from public.team_invites
  where id = p_invite_id
    and accepted_at is null
    and revoked_at is null
  for update;
  if v_invite_team_id is null then
    if exists (
      select 1 from public.team_operations
      where id = p_operation_id
        and user_id = auth.uid()
        and operation_type = 'revoke_invite'
        and team_id = v_team_id
    ) then
      return;
    end if;
    raise exception 'NOT_AUTHORIZED';
  end if;

  if not public.claim_operation(p_operation_id, v_team_id, 'revoke_invite') then
    if exists (
      select 1 from public.team_operations
      where id = p_operation_id
        and user_id = auth.uid()
        and team_id = v_team_id
        and operation_type = 'revoke_invite'
    ) then
      return;
    end if;
    raise exception 'OPERATION_CONFLICT';
  end if;
  update public.team_invites
  set revoked_at = public.epoch_ms()
  where id = p_invite_id;
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
end;
$$;

revoke execute on function public.team_create_team(uuid, text, text, uuid) from public, anon;
revoke execute on function public.team_create_invite(uuid, text, bigint, uuid) from public, anon;
revoke execute on function public.team_accept_invite(text, text, uuid) from public, anon;
revoke execute on function public.team_revoke_invite(uuid, uuid) from public, anon;
revoke execute on function public.team_set_member_role(uuid, uuid, public.team_role, uuid) from public, anon;
revoke execute on function public.team_remove_member(uuid, uuid, uuid) from public, anon;

grant execute on function public.team_create_team(uuid, text, text, uuid) to authenticated;
grant execute on function public.team_create_invite(uuid, text, bigint, uuid) to authenticated;
grant execute on function public.team_accept_invite(text, text, uuid) to authenticated;
grant execute on function public.team_revoke_invite(uuid, uuid) to authenticated;
grant execute on function public.team_set_member_role(uuid, uuid, public.team_role, uuid) to authenticated;
grant execute on function public.team_remove_member(uuid, uuid, uuid) to authenticated;
