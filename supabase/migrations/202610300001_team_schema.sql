-- supabase/migrations/202610300001_team_schema.sql
create extension if not exists pgcrypto;
create sequence if not exists public.team_sync_seq;

create or replace function public.epoch_ms()
returns bigint language sql stable
as $$ select (extract(epoch from clock_timestamp()) * 1000)::bigint $$;

create or replace function public.bump_sync_version()
returns trigger language plpgsql
as $$
begin
  new.updated_at := public.epoch_ms();
  new.sync_version := nextval('public.team_sync_seq');
  return new;
end;
$$;

create type public.team_role as enum ('leader', 'member');
create type public.team_assignee_status as enum ('todo', 'doing', 'submitted', 'approved', 'closed');
create type public.team_notification_type as enum ('assigned', 'returned', 'approved', 'task_completed', 'due_soon', 'overdue');
create type public.team_event_type as enum ('created', 'assigned', 'started', 'submitted', 'returned', 'approved', 'reopened', 'archived', 'closed');

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 100),
  created_by uuid not null references auth.users(id),
  created_at bigint not null default public.epoch_ms(),
  updated_at bigint not null default public.epoch_ms(),
  sync_version bigint not null default nextval('public.team_sync_seq')
);

create table public.team_members (
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  role public.team_role not null default 'member',
  status text not null default 'active' check (status in ('active', 'removed')),
  email text not null,
  display_name text not null,
  joined_at bigint not null default public.epoch_ms(),
  removed_at bigint,
  updated_at bigint not null default public.epoch_ms(),
  sync_version bigint not null default nextval('public.team_sync_seq'),
  primary key (team_id, user_id)
);

create unique index team_members_one_active_team
  on public.team_members(user_id) where status = 'active';

create table public.team_tasks (
  id uuid primary key,
  team_id uuid not null references public.teams(id) on delete cascade,
  unique (id, team_id),
  title text not null check (char_length(title) between 1 and 200),
  description text,
  description_json text,
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  due_at bigint,
  tags text[] not null default '{}',
  created_by uuid not null references auth.users(id),
  archived_at bigint,
  version integer not null default 1,
  created_at bigint not null default public.epoch_ms(),
  updated_at bigint not null default public.epoch_ms(),
  sync_version bigint not null default nextval('public.team_sync_seq')
);

create table public.team_task_leaders (
  task_id uuid not null references public.team_tasks(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  foreign key (task_id, team_id) references public.team_tasks(id, team_id) on delete cascade,
  user_id uuid not null references auth.users(id),
  sync_version bigint not null default nextval('public.team_sync_seq'),
  primary key (task_id, user_id)
);

create table public.team_task_assignees (
  task_id uuid not null references public.team_tasks(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  foreign key (task_id, team_id) references public.team_tasks(id, team_id) on delete cascade,
  user_id uuid not null references auth.users(id),
  status public.team_assignee_status not null default 'todo',
  approved_by uuid references auth.users(id),
  approved_at bigint,
  closed_by uuid references auth.users(id),
  closed_at bigint,
  version integer not null default 1,
  updated_at bigint not null default public.epoch_ms(),
  sync_version bigint not null default nextval('public.team_sync_seq'),
  primary key (task_id, user_id)
);

create table public.team_task_progress_notes (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.team_tasks(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  foreign key (task_id, team_id) references public.team_tasks(id, team_id) on delete cascade,
  user_id uuid not null references auth.users(id),
  body text not null check (char_length(body) between 1 and 20000),
  created_at bigint not null default public.epoch_ms(),
  sync_version bigint not null default nextval('public.team_sync_seq')
);

create table public.team_task_events (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.team_tasks(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  foreign key (task_id, team_id) references public.team_tasks(id, team_id) on delete cascade,
  actor_id uuid not null references auth.users(id),
  event_type public.team_event_type not null,
  target_user_id uuid references auth.users(id),
  from_status public.team_assignee_status,
  to_status public.team_assignee_status,
  metadata jsonb not null default '{}'::jsonb,
  created_at bigint not null default public.epoch_ms(),
  sync_version bigint not null default nextval('public.team_sync_seq')
);

create table public.team_notifications (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  foreign key (task_id, team_id) references public.team_tasks(id, team_id) on delete cascade,
  user_id uuid not null references auth.users(id),
  type public.team_notification_type not null,
  task_id uuid references public.team_tasks(id) on delete cascade,
  title text not null,
  body text not null,
  read_at bigint,
  created_at bigint not null default public.epoch_ms(),
  updated_at bigint not null default public.epoch_ms(),
  sync_version bigint not null default nextval('public.team_sync_seq')
);

create table public.team_invites (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  email text not null,
  token_hash bytea not null,
  expires_at bigint not null,
  created_by uuid not null references auth.users(id),
  accepted_at bigint,
  revoked_at bigint,
  created_at bigint not null default public.epoch_ms(),
  updated_at bigint not null default public.epoch_ms(),
  sync_version bigint not null default nextval('public.team_sync_seq')
);

create table public.team_operations (
  id uuid primary key,
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  created_at bigint not null default public.epoch_ms()
);

create index team_tasks_team_sync on public.team_tasks(team_id, sync_version);
create index team_members_team_sync on public.team_members(team_id, sync_version);
create index task_leaders_team_sync on public.team_task_leaders(team_id, sync_version);
create index task_assignees_team_sync on public.team_task_assignees(team_id, sync_version);
create index task_notes_team_sync on public.team_task_progress_notes(team_id, sync_version);
create index task_events_team_sync on public.team_task_events(team_id, sync_version);
create index team_notifications_user_sync on public.team_notifications(user_id, sync_version);
create index team_invites_team_sync on public.team_invites(team_id, sync_version);
create index team_tasks_due on public.team_tasks(team_id, due_at) where archived_at is null;

create trigger teams_bump before update on public.teams for each row execute function public.bump_sync_version();
create trigger team_members_bump before update on public.team_members for each row execute function public.bump_sync_version();
create trigger team_tasks_bump before update on public.team_tasks for each row execute function public.bump_sync_version();
create trigger team_task_assignees_bump before update on public.team_task_assignees for each row execute function public.bump_sync_version();
create trigger team_notifications_bump before update on public.team_notifications for each row execute function public.bump_sync_version();
create trigger team_invites_bump before update on public.team_invites for each row execute function public.bump_sync_version();

create or replace function public.is_team_member(p_team_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.team_members
    where team_id = p_team_id and user_id = auth.uid() and status = 'active'
  );
$$;

create or replace function public.is_team_leader(p_team_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.team_members
    where team_id = p_team_id and user_id = auth.uid() and role = 'leader' and status = 'active'
  );
$$;

create or replace function public.can_view_task(p_task_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from public.team_tasks t
    join public.team_members m on m.team_id = t.team_id and m.user_id = auth.uid() and m.status = 'active'
    where t.id = p_task_id
      and (
        m.role = 'leader'
        or exists (select 1 from public.team_task_assignees a where a.task_id = t.id and a.user_id = auth.uid())
      )
  );
$$;

create or replace function public.can_view_member(p_team_id uuid, p_member_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.team_members viewer
    where viewer.team_id = p_team_id and viewer.user_id = auth.uid() and viewer.status = 'active'
      and (
        viewer.role = 'leader'
        or viewer.user_id = p_member_id
        or exists (
          select 1
          from public.team_task_assignees mine
          join public.team_task_assignees target on target.task_id = mine.task_id
          where mine.team_id = p_team_id and mine.user_id = auth.uid() and target.user_id = p_member_id
        )
        or exists (
          select 1
          from public.team_task_assignees mine
          join public.team_task_leaders target on target.task_id = mine.task_id
          where mine.team_id = p_team_id and mine.user_id = auth.uid() and target.user_id = p_member_id
        )
      )
  );
$$;

create or replace function public.is_task_editor(p_task_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from public.team_tasks t
    join public.team_members m on m.team_id = t.team_id and m.user_id = auth.uid() and m.status = 'active' and m.role = 'leader'
    where t.id = p_task_id
      and (
        t.created_by = auth.uid()
        or exists (select 1 from public.team_task_leaders l where l.task_id = t.id and l.user_id = auth.uid())
      )
  );
$$;

create or replace function public.is_task_approver(p_task_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from public.team_tasks t
    join public.team_members m on m.team_id = t.team_id and m.user_id = auth.uid() and m.status = 'active' and m.role = 'leader'
    where t.id = p_task_id
      and (
        t.created_by = auth.uid()
        or exists (select 1 from public.team_task_leaders l where l.task_id = t.id and l.user_id = auth.uid())
      )
  );
$$;

create or replace function public.claim_operation(p_operation_id uuid, p_team_id uuid)
returns boolean language plpgsql security definer set search_path = public
as $$
begin
  insert into public.team_operations(id, team_id, user_id)
  values (p_operation_id, p_team_id, auth.uid())
  on conflict (id) do nothing;
  return found;
end;
$$;

revoke execute on function public.claim_operation(uuid, uuid) from public, anon, authenticated;

alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.team_tasks enable row level security;
alter table public.team_task_leaders enable row level security;
alter table public.team_task_assignees enable row level security;
alter table public.team_task_progress_notes enable row level security;
alter table public.team_task_events enable row level security;
alter table public.team_notifications enable row level security;
alter table public.team_invites enable row level security;
alter table public.team_operations enable row level security;

create policy teams_select on public.teams for select using (public.is_team_member(id));
create policy members_select on public.team_members for select using (public.can_view_member(team_id, user_id));
create policy tasks_select on public.team_tasks for select using (public.can_view_task(id));
create policy task_leaders_select on public.team_task_leaders for select using (public.can_view_task(task_id));
create policy task_assignees_select on public.team_task_assignees for select using (public.can_view_task(task_id));
create policy task_notes_select on public.team_task_progress_notes for select using (public.can_view_task(task_id));
create policy task_events_select on public.team_task_events for select using (public.can_view_task(task_id));
create policy notifications_select on public.team_notifications for select using (user_id = auth.uid());
create policy invites_select on public.team_invites for select using (public.is_team_leader(team_id));

revoke all on public.teams, public.team_members, public.team_tasks,
  public.team_task_leaders, public.team_task_assignees, public.team_task_progress_notes,
  public.team_task_events, public.team_notifications, public.team_invites, public.team_operations
  from anon, authenticated;

grant select on public.teams, public.team_members, public.team_tasks, public.team_task_leaders,
  public.team_task_assignees, public.team_task_progress_notes, public.team_task_events,
  public.team_notifications, public.team_invites
  to authenticated;

alter publication supabase_realtime add table public.team_tasks, public.team_task_assignees,
  public.team_task_progress_notes, public.team_task_events, public.team_notifications;
