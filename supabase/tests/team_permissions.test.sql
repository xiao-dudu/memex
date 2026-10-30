-- supabase/tests/team_permissions.test.sql
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('11111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 'leader@example.com', crypt('password', gen_salt('bf')), now(), now(), now()),
  ('22222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated', 'member1@example.com', crypt('password', gen_salt('bf')), now(), now(), now()),
  ('33333333-3333-4333-8333-333333333333', 'authenticated', 'authenticated', 'member2@example.com', crypt('password', gen_salt('bf')), now(), now(), now()),
  ('44444444-4444-4444-8444-444444444444', 'authenticated', 'authenticated', 'leader2@example.com', crypt('password', gen_salt('bf')), now(), now(), now());

insert into public.teams (id, name, created_by)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '测试团队', '11111111-1111-4111-8111-111111111111'),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', '第二团队', '11111111-1111-4111-8111-111111111111');

insert into public.team_members (team_id, user_id, role, email, display_name)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'leader', 'leader@example.com', '领导'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '22222222-2222-4222-8222-222222222222', 'member', 'member1@example.com', '成员一'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '33333333-3333-4333-8333-333333333333', 'member', 'member2@example.com', '成员二'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '44444444-4444-4444-8444-444444444444', 'leader', 'leader2@example.com', '领导二');

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
-- review round 1: binding correction assertions
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","email":"leader@example.com"}', true);
select lives_ok(
  $$select public.team_create_task(
    '10101010-1010-4010-8010-101010101010',
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '自审批任务', null, null, 'medium', null, '{}',
    array['11111111-1111-4111-8111-111111111111']::uuid[],
    array['44444444-4444-4444-8444-444444444444']::uuid[]
  )$$,
  'leader can create a task with another active leader as approver'
);
select is(
  public.team_create_task(
    '10101010-1010-4010-8010-101010101010',
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '自审批任务', null, null, 'medium', null, '{}',
    array['11111111-1111-4111-8111-111111111111']::uuid[],
    array['44444444-4444-4444-8444-444444444444']::uuid[]
  ),
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'::uuid,
  'duplicate create operation returns the same task id'
);
select is(
  public.team_start_assignee('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 1, 'a0000000-0000-4000-8000-000000000001'),
  2,
  'leader can start own assignee item'
);
select is(
  public.team_submit_assignee('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', '自审批', 2, 'a0000000-0000-4000-8000-000000000002'),
  3,
  'leader can submit own assignee item'
);
select throws_ok(
  $$select public.team_review_assignee('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', '11111111-1111-4111-8111-111111111111', 3, 'approve', null, 'a0000000-0000-4000-8000-000000000003')$$,
  'P0001',
  'SELF_APPROVAL_FORBIDDEN',
  'leader cannot approve own target assignee item'
);

select set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","email":"member2@example.com"}', true);
select throws_ok(
  $$select public.team_start_assignee('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 999, 'b0000000-0000-4000-8000-000000000001')$$,
  'P0001',
  'VERSION_CONFLICT',
  'stale assignee version is rejected'
);
select is(
  public.team_start_assignee('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 1, 'b0000000-0000-4000-8000-000000000002'),
  2,
  'member can start task two'
);
select is(
  public.team_start_assignee('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 1, 'b0000000-0000-4000-8000-000000000002'),
  2,
  'duplicate start operation returns the stored version'
);
select lives_ok(
  $$select public.team_add_progress_note('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '重试备注', 'b0000000-0000-4000-8000-000000000003')$$,
  'member can add retry note'
);
select is(
  public.team_add_progress_note('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '重试备注', 'b0000000-0000-4000-8000-000000000003'),
  (select id from public.team_task_progress_notes
   where task_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' and body = '重试备注'),
  'duplicate note operation returns the same note id'
);

select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","email":"leader@example.com"}', true);
select throws_ok(
  $$select public.team_update_task(
    'd0000000-0000-4000-8000-000000000001',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    1,
    '任务一已完成', null, null, 'medium', null, '{}',
    array['22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333']::uuid[],
    array['11111111-1111-4111-8111-111111111111']::uuid[]
  )$$,
  'P0001',
  'INVALID_STATUS',
  'cannot add a new assignee after task completion'
);
select lives_ok(
  $$select public.team_reopen_task('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 1, 'd0000000-0000-4000-8000-000000000002')$$,
  'leader can reopen completed task'
);
select lives_ok(
  $$select public.team_update_task(
    'd0000000-0000-4000-8000-000000000003',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    2,
    '任务一重开', null, null, 'medium', null, '{}',
    array['22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333']::uuid[],
    array['11111111-1111-4111-8111-111111111111']::uuid[]
  )$$,
  'leader can add an assignee after reopen'
);
select is(
  (select count(*)::int from public.team_task_assignees
   where task_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
     and user_id = '33333333-3333-4333-8333-333333333333'),
  1,
  'new assignee is added after reopen'
);

select lives_ok(
  $$select public.team_create_task(
    'c0000000-0000-4000-8000-000000000001',
    'ffffffff-ffff-4fff-8fff-ffffffffffff',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '移除成员任务', null, null, 'medium', null, '{}',
    array['22222222-2222-4222-8222-222222222222']::uuid[],
    array['11111111-1111-4111-8111-111111111111']::uuid[]
  )$$,
  'leader can create a task for removed-member checks'
);
reset role;
update public.team_members
set status = 'removed', removed_at = public.epoch_ms()
where team_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  and user_id = '22222222-2222-4222-8222-222222222222';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","email":"member1@example.com"}', true);
select throws_ok(
  $$select public.team_start_assignee('ffffffff-ffff-4fff-8fff-ffffffffffff', 1, 'c0000000-0000-4000-8000-000000000002')$$,
  'P0001',
  'NOT_AUTHORIZED',
  'removed member cannot start an assignee item'
);
select throws_ok(
  $$select public.team_add_progress_note('ffffffff-ffff-4fff-8fff-ffffffffffff', '不应写入', 'c0000000-0000-4000-8000-000000000003')$$,
  'P0001',
  'NOT_AUTHORIZED',
  'removed member cannot add a progress note'
);
select throws_ok(
  $$select public.team_submit_assignee('ffffffff-ffff-4fff-8fff-ffffffffffff', '不应提交', 1, 'c0000000-0000-4000-8000-000000000004')$$,
  'P0001',
  'NOT_AUTHORIZED',
  'removed member cannot submit an assignee item'
);
select throws_ok(
  $$select public.emit_task_event('ffffffff-ffff-4fff-8fff-ffffffffffff', 'created', null, null, null, '{}'::jsonb)$$,
  '42501',
  null,
  'clients cannot execute emit_task_event directly'
);
select throws_ok(
  $$select public.notify_task_users('ffffffff-ffff-4fff-8fff-ffffffffffff', 'assigned', '不应写入', '不应写入', array['22222222-2222-4222-8222-222222222222']::uuid[])$$,
  '42501',
  null,
  'clients cannot execute notify_task_users directly'
);
select * from finish();
rollback;
