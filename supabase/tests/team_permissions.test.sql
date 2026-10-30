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
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '测试团队', '11111111-1111-4111-8111-111111111111'),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', '第二团队', '11111111-1111-4111-8111-111111111111');

insert into public.team_members (team_id, user_id, role, email, display_name)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'leader', 'leader@example.com', '领导'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '22222222-2222-4222-8222-222222222222', 'member', 'member1@example.com', '成员一'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '33333333-3333-4333-8333-333333333333', 'member', 'member2@example.com', '成员二');

select throws_ok(
  $$insert into public.team_members (team_id, user_id, role, email, display_name)
    values ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', '22222222-2222-4222-8222-222222222222', 'member', 'member1@example.com', '成员一')$$,
  '23505', null, 'one active team per user'
);

insert into public.team_tasks (id, team_id, title, created_by)
values
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '任务一', '11111111-1111-4111-8111-111111111111'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '任务二', '11111111-1111-4111-8111-111111111111');

insert into public.team_task_leaders (task_id, team_id, user_id)
values
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111');

insert into public.team_task_assignees (task_id, team_id, user_id)
values
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '22222222-2222-4222-8222-222222222222'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '33333333-3333-4333-8333-333333333333');

select is(
  (select sync_version from public.team_tasks where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')
    < (select sync_version from public.team_tasks where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'),
  true,
  'task sync versions advance on insert'
);
update public.team_tasks set title = '任务一更新' where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
select ok(
  (select sync_version from public.team_tasks where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')
    > (select sync_version from public.team_tasks where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'),
  'task update bumps sync version'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","email":"member1@example.com"}', true);
select is((select count(*)::int from public.team_tasks), 1, 'member1 sees only the assigned task');
select is((select count(*)::int from public.team_tasks where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'), 1, 'member1 sees task one');
select is((select count(*)::int from public.team_tasks where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'), 0, 'member1 cannot see task two');
select throws_ok(
  $$insert into public.team_tasks (id, team_id, title, created_by)
    values ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '非法任务', '22222222-2222-4222-8222-222222222222')$$,
  '42501', null, 'authenticated member cannot insert tasks directly'
);

select set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","email":"member2@example.com"}', true);
select is((select count(*)::int from public.team_tasks), 1, 'member2 sees only the assigned task');
select is((select count(*)::int from public.team_tasks where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'), 1, 'member2 sees task two');
select is((select count(*)::int from public.team_tasks where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'), 0, 'member2 cannot see task one');

select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","email":"leader@example.com"}', true);
select is((select count(*)::int from public.team_tasks), 2, 'leader sees all tasks');
select is((select count(*)::int from public.team_task_assignees), 2, 'leader sees all assignees');

-- append before select * from finish(); in supabase/tests/team_permissions.test.sql
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","email":"member1@example.com"}', true);
select lives_ok(
  $$select public.team_start_assignee('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 1, '99999999-9999-4999-8999-999999999999')$$,
  'member can start own item'
);
select lives_ok(
  $$select public.team_add_progress_note('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '已完成初稿', '88888888-8888-4888-8888-888888888888')$$,
  'member can add progress note'
);
select lives_ok(
  $$select public.team_submit_assignee('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '请验收', 2, '77777777-7777-4777-8777-777777777777')$$,
  'member can submit own item'
);

select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","email":"leader@example.com"}', true);
select lives_ok(
  $$select public.team_review_assignee('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '22222222-2222-4222-8222-222222222222', 3, 'approve', '通过', '66666666-6666-4666-8666-666666666666')$$,
  'authorized leader can approve'
);
select is(
  (select status::text from public.team_task_assignees where task_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' and user_id = '22222222-2222-4222-8222-222222222222'),
  'approved',
  'assignee becomes approved'
);
select throws_ok(
  $$select public.team_review_assignee('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '22222222-2222-4222-8222-222222222222', 4, 'return', null, '55555555-5555-4555-8555-555555555555')$$,
  'P0001',
  'INVALID_STATUS',
  'approved item cannot be reviewed again'
);
select * from finish();
rollback;
