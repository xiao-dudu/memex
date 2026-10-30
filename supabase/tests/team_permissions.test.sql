-- supabase/tests/team_permissions.test.sql
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('11111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 'leader@example.com', crypt('password', gen_salt('bf')), now(), now(), now()),
  ('22222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated', 'member1@example.com', crypt('password', gen_salt('bf')), now(), now(), now()),
  ('33333333-3333-4333-8333-333333333333', 'authenticated', 'authenticated', 'member2@example.com', crypt('password', gen_salt('bf')), now(), now(), now());

insert into public.teams (id, name, created_by)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '测试团队', '11111111-1111-4111-8111-111111111111');

insert into public.team_members (team_id, user_id, role, email, display_name)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'leader', 'leader@example.com', '领导'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '22222222-2222-4222-8222-222222222222', 'member', 'member1@example.com', '成员一'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '33333333-3333-4333-8333-333333333333', 'member', 'member2@example.com', '成员二');

insert into public.team_tasks (id, team_id, title, created_by)
values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '任务一', '11111111-1111-4111-8111-111111111111');

insert into public.team_task_leaders (task_id, team_id, user_id)
values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111');

insert into public.team_task_assignees (task_id, team_id, user_id)
values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '22222222-2222-4222-8222-222222222222');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","email":"member1@example.com"}', true);
select is((select count(*)::int from public.team_tasks), 1, 'assigned member sees the task');
select is((select count(*)::int from public.team_tasks where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'), 1, 'assigned member sees task row');

select set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","email":"member2@example.com"}', true);
select is((select count(*)::int from public.team_tasks), 0, 'unassigned member sees no tasks');
select is((select count(*)::int from public.team_task_assignees), 0, 'unassigned member sees no assignees');

select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","email":"leader@example.com"}', true);
select is((select count(*)::int from public.team_tasks), 1, 'leader sees all tasks');
select is((select count(*)::int from public.team_task_assignees), 1, 'leader sees all assignees');

select * from finish();
rollback;
