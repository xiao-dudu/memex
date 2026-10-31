-- supabase/tests/team_permissions.test.sql
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('11111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 'leader@example.com', crypt('password', gen_salt('bf')), now(), now(), now()),
  ('22222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated', 'member1@example.com', crypt('password', gen_salt('bf')), now(), now(), now()),
  ('33333333-3333-4333-8333-333333333333', 'authenticated', 'authenticated', 'member2@example.com', crypt('password', gen_salt('bf')), now(), now(), now()),
  ('44444444-4444-4444-8444-444444444444', 'authenticated', 'authenticated', 'leader2@example.com', crypt('password', gen_salt('bf')), now(), now(), now()),
  ('55555555-5555-4555-8555-555555555555', 'authenticated', 'authenticated', 'creator@example.com', crypt('password', gen_salt('bf')), now(), now(), now()),
  ('66666666-6666-4666-8666-666666666666', 'authenticated', 'authenticated', 'invitee@example.com', crypt('password', gen_salt('bf')), now(), now(), now()),
  ('77777777-7777-4777-8777-777777777777', 'authenticated', 'authenticated', 'tasklead@example.com', crypt('password', gen_salt('bf')), now(), now(), now());

insert into public.teams (id, name, created_by)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '测试团队', '11111111-1111-4111-8111-111111111111'),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', '第二团队', '11111111-1111-4111-8111-111111111111');

insert into public.team_members (team_id, user_id, role, email, display_name)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'leader', 'leader@example.com', '领导'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '22222222-2222-4222-8222-222222222222', 'member', 'member1@example.com', '成员一'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '33333333-3333-4333-8333-333333333333', 'member', 'member2@example.com', '成员二'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '44444444-4444-4444-8444-444444444444', 'leader', 'leader2@example.com', '领导二'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '77777777-7777-4777-8777-777777777777', 'member', 'tasklead@example.com', '任务领导');

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
  $$select public.team_add_progress_note('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'd0000000-0000-4000-8000-000000000001', '已完成初稿', '88888888-8888-4888-8888-888888888888')$$,
  'member can add progress note'
);
select is(
  (select id from public.team_task_progress_notes
   where task_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' and body = '已完成初稿'),
  'd0000000-0000-4000-8000-000000000001'::uuid,
  'progress note uses the client-generated id'
);
select lives_ok(
  $$select public.team_submit_assignee('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'd0000000-0000-4000-8000-000000000002', '请验收', 2, '77777777-7777-4777-8777-777777777777')$$,
  'member can submit own item'
);
select is(
  (select id from public.team_task_progress_notes
   where task_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' and body = '请验收'),
  'd0000000-0000-4000-8000-000000000002'::uuid,
  'submission note uses the client-generated id'
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
  public.team_submit_assignee('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'd0000000-0000-4000-8000-000000000003', '自审批', 2, 'a0000000-0000-4000-8000-000000000002'),
  3,
  'leader can submit own assignee item'
);
select throws_ok(
  $$select public.team_review_assignee('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', '11111111-1111-4111-8111-111111111111', 3, 'approve', null, 'a0000000-0000-4000-8000-000000000003')$$,
  'P0001',
  'SELF_APPROVAL_FORBIDDEN',
  'leader cannot approve own target assignee item'
);

select set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-8444-444444444444","email":"leader2@example.com"}', true);
select is(
  public.team_review_assignee(
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    '11111111-1111-4111-8111-111111111111',
    3,
    'approve',
    null,
    'a0000000-0000-4000-8000-000000000004'
  ),
  4,
  'another leader can approve the task used for leader reopen checks'
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
  $$select public.team_add_progress_note('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'd0000000-0000-4000-8000-000000000004', '重试备注', 'b0000000-0000-4000-8000-000000000003')$$,
  'member can add retry note'
);
select is(
  public.team_add_progress_note('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'd0000000-0000-4000-8000-000000000004', '重试备注', 'b0000000-0000-4000-8000-000000000003'),
  'd0000000-0000-4000-8000-000000000004'::uuid,
  'duplicate note operation returns the same client note id'
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
  $$select public.team_add_progress_note('ffffffff-ffff-4fff-8fff-ffffffffffff', 'd0000000-0000-4000-8000-000000000005', '不应写入', 'c0000000-0000-4000-8000-000000000003')$$,
  'P0001',
  'NOT_AUTHORIZED',
  'removed member cannot add a progress note'
);
select throws_ok(
  $$select public.team_submit_assignee('ffffffff-ffff-4fff-8fff-ffffffffffff', 'd0000000-0000-4000-8000-000000000006', '不应提交', 1, 'c0000000-0000-4000-8000-000000000004')$$,
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
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","email":"leader@example.com"}', true);
select lives_ok(
  $$select public.team_create_task(
    'e0000000-0000-4000-8000-000000000001',
    '12121212-1212-4212-8212-121212121212',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '全关闭任务', null, null, 'medium', null, '{}',
    array['33333333-3333-4333-8333-333333333333']::uuid[],
    array['11111111-1111-4111-8111-111111111111']::uuid[]
  )$$,
  'leader can create an all-closed regression task'
);
select is(
  public.team_close_assignee(
    '12121212-1212-4212-8212-121212121212',
    '33333333-3333-4333-8333-333333333333',
    '关闭',
    1,
    'e0000000-0000-4000-8000-000000000002'
  ),
  2,
  'leader can close the only assignment'
);
select throws_ok(
  $$select public.team_update_task(
    'e0000000-0000-4000-8000-000000000003',
    '12121212-1212-4212-8212-121212121212',
    1,
    '全关闭任务', null, null, 'medium', null, '{}',
    array['33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444']::uuid[],
    array['11111111-1111-4111-8111-111111111111']::uuid[]
  )$$,
  'P0001',
  'INVALID_STATUS',
  'all-closed task rejects new assignee before reopen'
);
select lives_ok(
  $$select public.team_reopen_task('12121212-1212-4212-8212-121212121212', 1, 'e0000000-0000-4000-8000-000000000004')$$,
  'leader can reopen an all-closed task'
);
select is(
  (select status::text from public.team_task_assignees
   where task_id = '12121212-1212-4212-8212-121212121212'
     and user_id = '33333333-3333-4333-8333-333333333333'),
  'closed',
  'closed assignment remains closed after reopen'
);
select lives_ok(
  $$select public.team_update_task(
    'e0000000-0000-4000-8000-000000000005',
    '12121212-1212-4212-8212-121212121212',
    2,
    '全关闭任务重开', null, null, 'medium', null, '{}',
    array['33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444']::uuid[],
    array['11111111-1111-4111-8111-111111111111']::uuid[]
  )$$,
  'all-closed task accepts new assignee after reopen'
);
select is(
  (select status::text from public.team_task_assignees
   where task_id = '12121212-1212-4212-8212-121212121212'
     and user_id = '44444444-4444-4444-8444-444444444444'),
  'todo',
  'new assignee is added after all-closed reopen'
);
-- member-management assertions
select set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","email":"member2@example.com"}', true);
select throws_ok(
  $$select public.team_set_member_role('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '33333333-3333-4333-8333-333333333333', 'leader', '44444444-4444-4444-8444-444444444444')$$,
  'P0001',
  'NOT_AUTHORIZED',
  'member cannot promote themselves'
);

select set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-8444-444444444444","email":"leader2@example.com"}', true);
select is(
  length(set_config(
    'test.invite_token',
    public.team_create_invite(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'invitee@example.com',
      (extract(epoch from now()) * 1000)::bigint + 86400000,
      '44444444-4444-4444-8444-444444444450'
    ),
    true
  )),
  64,
  'leader can create an invite and receives a 256-bit token'
);
select is(
  encode((
    select token_hash from public.team_invites
    where team_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
      and email = 'invitee@example.com'
    order by created_at desc
    limit 1
  ), 'hex'),
  encode(extensions.digest(current_setting('test.invite_token'), 'sha256'), 'hex'),
  'invite stores only the SHA-256 token hash'
);

select set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-8444-444444444444","email":"leader2@example.com"}', true);
select is(
  length(set_config(
    'test.wrong_email_token',
    public.team_create_invite(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'wrong@example.com',
      (extract(epoch from now()) * 1000)::bigint + 86400000,
      '44444444-4444-4444-8444-444444444455'
    ),
    true
  )),
  64,
  'leader can create an invite for a different email'
);
select set_config('request.jwt.claims', '{"sub":"66666666-6666-4666-8666-666666666666","email":"invitee@example.com"}', true);
select throws_ok(
  $$select public.team_accept_invite(current_setting('test.wrong_email_token'), '错误邮箱', '66666666-6666-4666-8666-666666666664')$$,
  'P0001',
  'INVITE_EMAIL_MISMATCH',
  'invite cannot be accepted by a different email'
);

select is(
  public.team_accept_invite(
    current_setting('test.invite_token'),
    '邀请成员',
    '66666666-6666-4666-8666-666666666661'
  ),
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,
  'invitee can accept a valid invite'
);
select is(
  public.team_accept_invite(
    current_setting('test.invite_token'),
    '邀请成员',
    '66666666-6666-4666-8666-666666666661'
  ),
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,
  'duplicate accept operation returns the stored team id'
);

reset role;
insert into public.team_invites(team_id, email, token_hash, expires_at, created_by)
values (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'expired@example.com',
  extensions.digest('expired-token', 'sha256'),
  public.epoch_ms() - 1000,
  '11111111-1111-4111-8111-111111111111'
);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"66666666-6666-4666-8666-666666666666","email":"invitee@example.com"}', true);
select throws_ok(
  $$select public.team_accept_invite('expired-token', null, '66666666-6666-4666-8666-666666666665')$$,
  'P0001',
  'INVITE_INVALID',
  'expired invite cannot be accepted'
);

select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","email":"leader@example.com"}', true);
select is(
  (select accepted_at is not null from public.team_invites
   where team_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
     and email = 'invitee@example.com'
   order by created_at desc limit 1),
  true,
  'accepted invite is marked accepted'
);
select set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","email":"member2@example.com"}', true);
select throws_ok(
  $$select public.team_create_invite('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'blocked@example.com', (extract(epoch from now()) * 1000)::bigint + 86400000, '11111111-1111-4111-8111-111111111111')$$,
  'P0001',
  'NOT_AUTHORIZED',
  'member cannot create an invite'
);

select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","email":"leader@example.com"}', true);
select is(
  length(set_config(
    'test.revoke_token',
    public.team_create_invite(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'revoke@example.com',
      (extract(epoch from now()) * 1000)::bigint + 86400000,
      '11111111-1111-4111-8111-111111111112'
    ),
    true
  )),
  64,
  'leader can create an invite to revoke'
);
select set_config(
  'test.revoke_invite_id',
  (
    select id::text from public.team_invites
    where team_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
      and email = 'revoke@example.com'
    order by created_at desc limit 1
  ),
  true
);
select lives_ok(
  $$select public.team_revoke_invite(current_setting('test.revoke_invite_id')::uuid, '44444444-4444-4444-8444-444444444451')$$,
  'leader can revoke an invite'
);
select is(
  (select revoked_at is not null from public.team_invites
   where id = current_setting('test.revoke_invite_id')::uuid),
  true,
  'revoked invite is marked revoked'
);
select lives_ok(
  $$select public.team_revoke_invite(current_setting('test.revoke_invite_id')::uuid, '44444444-4444-4444-8444-444444444451')$$,
  'duplicate revoke operation is idempotent'
);

select lives_ok(
  $$select public.team_set_member_role('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '33333333-3333-4333-8333-333333333333', 'leader', '44444444-4444-4444-8444-444444444447')$$,
  'leader can promote a member'
);
select is(
  (select role::text from public.team_members
   where team_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
     and user_id = '33333333-3333-4333-8333-333333333333'),
  'leader',
  'member becomes leader'
);
select lives_ok(
  $$select public.team_set_member_role('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '33333333-3333-4333-8333-333333333333', 'member', '44444444-4444-4444-8444-444444444448')$$,
  'leader can demote another leader'
);
select is(
  (select role::text from public.team_members
   where team_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
     and user_id = '33333333-3333-4333-8333-333333333333'),
  'member',
  'leader becomes member'
);
select throws_ok(
  $$select public.team_set_member_role('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '44444444-4444-4444-8444-444444444444', 'member', '44444444-4444-4444-8444-444444444449')$$,
  'P0001',
  'APPROVER_REQUIRED',
  'leader demotion is blocked when it would remove the only non-assignee approver'
);
select is(
  (select role::text from public.team_members
   where team_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
     and user_id = '44444444-4444-4444-8444-444444444444'),
  'leader',
  'blocked demotion keeps the task approver as a leader'
);
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","email":"leader@example.com"}', true);
select is(
  length(set_config(
    'test.conflict_revoke_token',
    public.team_create_invite(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'conflict-revoke@example.com',
      (extract(epoch from now()) * 1000)::bigint + 86400000,
      '11111111-1111-4111-8111-111111111115'
    ),
    true
  )),
  64,
  'leader can create an invite for conflict coverage'
);
select set_config(
  'test.conflict_revoke_id',
  (
    select id::text from public.team_invites
    where team_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
      and email = 'conflict-revoke@example.com'
    order by created_at desc limit 1
  ),
  true
);
select throws_ok(
  $$select public.team_revoke_invite(current_setting('test.conflict_revoke_id')::uuid, '44444444-4444-4444-8444-444444444447')$$,
  'P0001',
  'OPERATION_CONFLICT',
  'revoke-invite operation id conflict is rejected'
);
select is(
  length(set_config(
    'test.leader_invite_token',
    public.team_create_invite(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'leader@example.com',
      (extract(epoch from now()) * 1000)::bigint + 86400000,
      '11111111-1111-4111-8111-111111111113'
    ),
    true
  )),
  64,
  'last leader can create an invite'
);
select throws_ok(
  $$select public.team_accept_invite(current_setting('test.leader_invite_token'), '领导', '11111111-1111-4111-8111-111111111114')$$,
  'P0001',
  'ALREADY_IN_TEAM',
  'active last leader cannot accept an invite'
);
select throws_ok(
  $$select public.team_set_member_role('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '66666666-6666-4666-8666-666666666666', 'leader', '44444444-4444-4444-8444-444444444451')$$,
  'P0001',
  'OPERATION_CONFLICT',
  'set-role operation id conflict is rejected'
);
select throws_ok(
  $$select public.team_remove_member('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '66666666-6666-4666-8666-666666666666', '44444444-4444-4444-8444-444444444447')$$,
  'P0001',
  'OPERATION_CONFLICT',
  'remove-member operation id conflict is rejected'
);
select throws_ok(
  $$select public.team_set_member_role('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'member', '44444444-4444-4444-8444-444444444445')$$,
  'P0001',
  'APPROVER_REQUIRED',
  'leader demotion cannot remove the only valid approver'
);
select throws_ok(
  $$select public.team_remove_member('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', '44444444-4444-4444-8444-444444444446')$$,
  'P0001',
  'TASK_LEADERSHIP_NOT_TRANSFERRED',
  'leader removal cannot bypass task leadership transfer'
);
select throws_ok(
  $$select public.team_remove_member('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '33333333-3333-4333-8333-333333333333', '44444444-4444-4444-8444-444444444452')$$,
  'P0001',
  'UNFINISHED_ASSIGNMENTS',
  'member with unfinished assignments cannot be removed'
);

reset role;
insert into public.team_tasks (id, team_id, title, created_by)
values ('13131313-1313-4313-8313-131313131313', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '领导任务', '77777777-7777-4777-8777-777777777777');
insert into public.team_task_leaders (task_id, team_id, user_id)
values ('13131313-1313-4313-8313-131313131313', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '77777777-7777-4777-8777-777777777777');
insert into public.team_tasks (id, team_id, title, created_by)
values ('14141414-1414-4414-8414-141414141414', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '历史创建任务', '66666666-6666-4666-8666-666666666666');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","email":"leader@example.com"}', true);
select throws_ok(
  $$select public.team_remove_member('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '77777777-7777-4777-8777-777777777777', '44444444-4444-4444-8444-444444444453')$$,
  'P0001',
  'TASK_LEADERSHIP_NOT_TRANSFERRED',
  'member with active task leadership cannot be removed'
);

select lives_ok(
  $$select public.team_create_task(
    '15151515-1515-4515-8515-151515151515',
    '15151515-1515-4515-8515-151515151516',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '移除成员重开任务', null, null, 'medium', null, '{}',
    array['66666666-6666-4666-8666-666666666666']::uuid[],
    array['11111111-1111-4111-8111-111111111111']::uuid[]
  )$$,
  'leader can create a task for removed-member reopen coverage'
);
select set_config('request.jwt.claims', '{"sub":"66666666-6666-4666-8666-666666666666","email":"invitee@example.com"}', true);
select is(
  public.team_start_assignee('15151515-1515-4515-8515-151515151516', 1, '15151515-1515-4515-8515-151515151517'),
  2,
  'assignee can start the reopen-coverage task'
);
select is(
  public.team_submit_assignee('15151515-1515-4515-8515-151515151516', 'd0000000-0000-4000-8000-000000000007', '提交', 2, '15151515-1515-4515-8515-151515151518'),
  3,
  'assignee can submit the reopen-coverage task'
);
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","email":"leader@example.com"}', true);
select is(
  public.team_review_assignee(
    '15151515-1515-4515-8515-151515151516',
    '66666666-6666-4666-8666-666666666666',
    3,
    'approve',
    null,
    '15151515-1515-4515-8515-151515151519'
  ),
  4,
  'leader can approve the reopen-coverage assignment'
);
select lives_ok(
  $$select public.team_remove_member('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '66666666-6666-4666-8666-666666666666', '44444444-4444-4444-8444-444444444454')$$,
  'leader can remove a member without unfinished work'
);
select is(
  (select status from public.team_members
   where team_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
     and user_id = '66666666-6666-4666-8666-666666666666'),
  'removed',
  'removed member is marked removed'
);
select lives_ok(
  $$select public.team_remove_member('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '66666666-6666-4666-8666-666666666666', '44444444-4444-4444-8444-444444444454')$$,
  'duplicate remove operation is idempotent'
);
select throws_ok(
  $$select public.team_reopen_task('15151515-1515-4515-8515-151515151516', 1, '15151515-1515-4515-8515-151515151520')$$,
  'P0001',
  'NOT_AUTHORIZED',
  'removed approved assignee blocks reopen'
);

select lives_ok(
  $$select public.team_set_member_role('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '33333333-3333-4333-8333-333333333333', 'leader', '16161616-1616-4616-8616-161616161601')$$,
  'leader can promote an approver for removed-leader reopen coverage'
);
select lives_ok(
  $$select public.team_create_task(
    '16161616-1616-4616-8616-161616161602',
    '16161616-1616-4616-8616-161616161616',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '已移除领导重开任务', null, null, 'medium', null, '{}',
    array['11111111-1111-4111-8111-111111111111']::uuid[],
    array['11111111-1111-4111-8111-111111111111','33333333-3333-4333-8333-333333333333']::uuid[]
  )$$,
  'leader can create a task for removed task-leader reopen coverage'
);
select is(
  public.team_start_assignee('16161616-1616-4616-8616-161616161616', 1, '16161616-1616-4616-8616-161616161603'),
  2,
  'assignee can start the removed-leader reopen task'
);
select is(
  public.team_submit_assignee('16161616-1616-4616-8616-161616161616', 'd0000000-0000-4000-8000-000000000008', '提交', 2, '16161616-1616-4616-8616-161616161604'),
  3,
  'assignee can submit the removed-leader reopen task'
);
select set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","email":"member2@example.com"}', true);
select is(
  public.team_review_assignee(
    '16161616-1616-4616-8616-161616161616',
    '11111111-1111-4111-8111-111111111111',
    3,
    'approve',
    null,
    '16161616-1616-4616-8616-161616161605'
  ),
  4,
  'promoted leader can approve the removed-leader reopen task'
);
reset role;
insert into public.team_task_leaders (task_id, team_id, user_id)
values (
  '16161616-1616-4616-8616-161616161616',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '22222222-2222-4222-8222-222222222222'
);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","email":"leader@example.com"}', true);
select throws_ok(
  $$select public.team_reopen_task('16161616-1616-4616-8616-161616161616', 1, '16161616-1616-4616-8616-161616161606')$$,
  'P0001',
  'NOT_AUTHORIZED',
  'removed task leader blocks reopen'
);

select set_config('request.jwt.claims', '{"sub":"55555555-5555-4555-8555-555555555555","email":"creator@example.com"}', true);
select is(
  public.team_create_team(
    'f0000000-0000-4000-8000-000000000001',
    '创建团队',
    '创建者',
    '55555555-5555-4555-8555-555555555551'
  ),
  'f0000000-0000-4000-8000-000000000001'::uuid,
  'user can create their first team'
);
select is(
  public.team_create_team(
    'f0000000-0000-4000-8000-000000000001',
    '创建团队',
    '创建者',
    '55555555-5555-4555-8555-555555555551'
  ),
  'f0000000-0000-4000-8000-000000000001'::uuid,
  'duplicate create-team operation returns the stored team id'
);
select throws_ok(
  $$select public.team_create_team('f0000000-0000-4000-8000-000000000002', '第二团队', '创建者', '55555555-5555-4555-8555-555555555552')$$,
  'P0001',
  'ALREADY_IN_TEAM',
  'user cannot create a second active team'
);

reset role;
insert into public.team_tasks (id, team_id, title, created_by)
values ('a1a1a1a1-a1a1-41a1-81a1-a1a1a1a1a1a1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '归档不可重开', '11111111-1111-4111-8111-111111111111');
insert into public.team_task_leaders (task_id, team_id, user_id)
values ('a1a1a1a1-a1a1-41a1-81a1-a1a1a1a1a1a1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111');
insert into public.team_task_assignees (task_id, team_id, user_id, status)
values ('a1a1a1a1-a1a1-41a1-81a1-a1a1a1a1a1a1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '22222222-2222-4222-8222-222222222222', 'approved');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","email":"leader@example.com"}', true);
select lives_ok(
  $$select public.team_archive_task('a1a1a1a1-a1a1-41a1-81a1-a1a1a1a1a1a1', 1, 'a1a1a1a1-a1a1-41a1-81a1-a1a1a1a1a1a2')$$,
  'leader can archive a task for reopen coverage'
);
select throws_ok(
  $$select public.team_reopen_task('a1a1a1a1-a1a1-41a1-81a1-a1a1a1a1a1a1', 2, 'a1a1a1a1-a1a1-41a1-81a1-a1a1a1a1a1a3')$$,
  'P0001',
  'TASK_ARCHIVED',
  'archived tasks cannot be reopened'
);

reset role;
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('acacacac-acac-4cac-8cac-acacacacacac', 'authenticated', 'authenticated', 'terminal-note@example.com', crypt('password', gen_salt('bf')), now(), now(), now());
insert into public.team_members (team_id, user_id, role, email, display_name)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'acacacac-acac-4cac-8cac-acacacacacac', 'member', 'terminal-note@example.com', '终态备注成员');
insert into public.team_tasks (id, team_id, title, created_by)
values ('a2a2a2a2-a2a2-42a2-82a2-a2a2a2a2a2a2', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '终态备注', '11111111-1111-4111-8111-111111111111');
insert into public.team_task_leaders (task_id, team_id, user_id)
values ('a2a2a2a2-a2a2-42a2-82a2-a2a2a2a2a2a2', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111');
insert into public.team_task_assignees (task_id, team_id, user_id, status)
values ('a2a2a2a2-a2a2-42a2-82a2-a2a2a2a2a2a2', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'acacacac-acac-4cac-8cac-acacacacacac', 'approved');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"acacacac-acac-4cac-8cac-acacacacacac","email":"terminal-note@example.com"}', true);
select throws_ok(
  $$select public.team_add_progress_note('a2a2a2a2-a2a2-42a2-82a2-a2a2a2a2a2a2', 'a2a2a2a2-a2a2-42a2-82a2-a2a2a2a2a2a3', '终态后不应写入', 'a2a2a2a2-a2a2-42a2-82a2-a2a2a2a2a2a4')$$,
  'P0001',
  'INVALID_STATUS',
  'approved assignments reject progress notes'
);

reset role;
insert into public.team_notifications (id, team_id, user_id, type, title, body)
values ('a3a3a3a3-a3a3-43a3-83a3-a3a3a3a3a3a3', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '66666666-6666-4666-8666-666666666666', 'assigned', '已移除成员通知', '不应可见');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"66666666-6666-4666-8666-666666666666","email":"invitee@example.com"}', true);
select is(
  (select count(*)::int from public.team_notifications where id = 'a3a3a3a3-a3a3-43a3-83a3-a3a3a3a3a3a3'),
  0,
  'removed members cannot read notifications'
);
select throws_ok(
  $$select public.team_mark_notification_read('a3a3a3a3-a3a3-43a3-83a3-a3a3a3a3a3a3', 'a3a3a3a3-a3a3-43a3-83a3-a3a3a3a3a3a4')$$,
  'P0001',
  'NOT_AUTHORIZED',
  'removed members cannot mark notifications read'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","email":"leader@example.com"}', true);
select is(
  (select count(*)::int from public.team_member_events
   where team_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
     and target_user_id = '66666666-6666-4666-8666-666666666666'
     and event_type = 'removed'
     and actor_id = '11111111-1111-4111-8111-111111111111'),
  1,
  'member removal writes an actor/target audit event'
);

reset role;
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('88888888-8888-4888-8888-888888888888', 'authenticated', 'authenticated', 'leave@example.com', crypt('password', gen_salt('bf')), now(), now(), now()),
  ('cdcdcdcd-cdcd-4cdc-8cdc-cdcdcdcdcdcd', 'authenticated', 'authenticated', 'leave-leader@example.com', crypt('password', gen_salt('bf')), now(), now(), now());
insert into public.teams (id, name, created_by)
values ('f0f0f0f0-f0f0-40f0-80f0-f0f0f0f0f0f0', '自离团队', 'cdcdcdcd-cdcd-4cdc-8cdc-cdcdcdcdcdcd');
insert into public.team_members (team_id, user_id, role, email, display_name)
values
  ('f0f0f0f0-f0f0-40f0-80f0-f0f0f0f0f0f0', '88888888-8888-4888-8888-888888888888', 'member', 'leave@example.com', '自离成员'),
  ('f0f0f0f0-f0f0-40f0-80f0-f0f0f0f0f0f0', 'cdcdcdcd-cdcd-4cdc-8cdc-cdcdcdcdcdcd', 'leader', 'leave-leader@example.com', '自离团队领导');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"88888888-8888-4888-8888-888888888888","email":"leave@example.com"}', true);
select lives_ok(
  $$select public.team_leave_team('f0f0f0f0-f0f0-40f0-80f0-f0f0f0f0f0f0', '88888888-8888-4888-8888-888888888889')$$,
  'member can leave a team'
);
reset role;
select is(
  (select status from public.team_members
   where team_id = 'f0f0f0f0-f0f0-40f0-80f0-f0f0f0f0f0f0'
     and user_id = '88888888-8888-4888-8888-888888888888'),
  'removed',
  'self-leave marks membership removed'
);
select is(
  (select count(*)::int from public.team_member_events
   where team_id = 'f0f0f0f0-f0f0-40f0-80f0-f0f0f0f0f0f0'
     and actor_id = '88888888-8888-4888-8888-888888888888'
     and target_user_id = '88888888-8888-4888-8888-888888888888'
     and event_type = 'left'),
  1,
  'self-leave writes an actor/target audit event'
);

reset role;
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('99999999-9999-4999-8999-999999999999', 'authenticated', 'authenticated', 'demote-leader@example.com', crypt('password', gen_salt('bf')), now(), now(), now()),
  ('abababab-abab-4bab-8bab-abababababab', 'authenticated', 'authenticated', 'sole-approver@example.com', crypt('password', gen_salt('bf')), now(), now(), now());
insert into public.teams (id, name, created_by)
values ('f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1', '降级约束团队', '99999999-9999-4999-8999-999999999999');
insert into public.team_members (team_id, user_id, role, email, display_name)
values
  ('f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1', '99999999-9999-4999-8999-999999999999', 'leader', 'demote-leader@example.com', '降级操作人'),
  ('f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1', 'abababab-abab-4bab-8bab-abababababab', 'leader', 'sole-approver@example.com', '唯一审批人');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"99999999-9999-4999-8999-999999999999","email":"demote-leader@example.com"}', true);
select lives_ok(
  $$select public.team_create_task(
    'f2f2f2f2-f2f2-42f2-82f2-f2f2f2f2f2f2',
    'f3f3f3f3-f3f3-43f3-83f3-f3f3f3f3f3f3',
    'f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1',
    '降级审批约束', null, null, 'medium', null, '{}',
    array['99999999-9999-4999-8999-999999999999']::uuid[],
    array['abababab-abab-4bab-8bab-abababababab']::uuid[]
  )$$,
  'leader can create a task whose only non-assignee approver is another leader'
);
select throws_ok(
  $$select public.team_set_member_role(
    'f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1',
    'abababab-abab-4bab-8bab-abababababab',
    'member',
    'f2f2f2f2-f2f2-42f2-82f2-f2f2f2f2f2f4'
  )$$,
  'P0001',
  'APPROVER_REQUIRED',
  'leader demotion cannot remove the only non-assignee approver'
);
select lives_ok(
  $$select public.team_archive_task('f3f3f3f3-f3f3-43f3-83f3-f3f3f3f3f3f3', 1, 'f2f2f2f2-f2f2-42f2-82f2-f2f2f2f2f2f5')$$,
  'leader can archive the demotion-coverage task'
);
select lives_ok(
  $$select public.team_set_member_role(
    'f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1',
    'abababab-abab-4bab-8bab-abababababab',
    'member',
    'f2f2f2f2-f2f2-42f2-82f2-f2f2f2f2f2f6'
  )$$,
  'leader can demote after the task is archived'
);
select is(
  (select count(*)::int from public.team_task_leaders
   where task_id = 'f3f3f3f3-f3f3-43f3-83f3-f3f3f3f3f3f3'
     and user_id = 'abababab-abab-4bab-8bab-abababababab'),
  1,
  'demotion preserves archived task leadership history'
);

reset role;
with defs as (
  select
    'perform 1 from public.teams where id = v_team_id for update;'::text as lock_marker,
    pg_get_functiondef('public.team_create_task(uuid,uuid,uuid,text,text,text,text,bigint,text[],uuid[],uuid[])'::regprocedure) as create_task_def,
    pg_get_functiondef('public.team_update_task(uuid,uuid,integer,text,text,text,text,bigint,text[],uuid[],uuid[])'::regprocedure) as update_task_def,
    pg_get_functiondef('public.team_start_assignee(uuid,integer,uuid)'::regprocedure) as start_assignee_def,
    pg_get_functiondef('public.team_add_progress_note(uuid,uuid,text,uuid)'::regprocedure) as add_note_def,
    pg_get_functiondef('public.team_submit_assignee(uuid,uuid,text,integer,uuid)'::regprocedure) as submit_assignee_def,
    pg_get_functiondef('public.team_review_assignee(uuid,uuid,integer,text,text,uuid)'::regprocedure) as review_assignee_def,
    pg_get_functiondef('public.team_reopen_task(uuid,integer,uuid)'::regprocedure) as reopen_task_def,
    pg_get_functiondef('public.team_archive_task(uuid,integer,uuid)'::regprocedure) as archive_task_def,
    pg_get_functiondef('public.team_close_assignee(uuid,uuid,text,integer,uuid)'::regprocedure) as close_assignee_def,
    pg_get_functiondef('public.team_create_invite(uuid,text,bigint,uuid)'::regprocedure) as create_invite_def,
    pg_get_functiondef('public.team_accept_invite(text,text,uuid)'::regprocedure) as accept_invite_def,
    pg_get_functiondef('public.team_revoke_invite(uuid,uuid)'::regprocedure) as revoke_invite_def
)
select ok(
  position(lock_marker in create_task_def) > 0
  and position(lock_marker in create_task_def) < position('perform public.assert_team_leader' in create_task_def)
  and position(lock_marker in create_task_def) < position('insert into public.team_tasks' in create_task_def)
  and position(lock_marker in update_task_def) > 0
  and position(lock_marker in update_task_def) < position('perform public.assert_task_editor' in update_task_def)
  and position(lock_marker in update_task_def) < position('from public.team_tasks where id = p_task_id for update' in update_task_def)
  and position(lock_marker in start_assignee_def) > 0
  and position(lock_marker in start_assignee_def) < position('if not public.is_team_member' in start_assignee_def)
  and position(lock_marker in start_assignee_def) < position('from public.team_task_assignees' in start_assignee_def)
  and position(lock_marker in add_note_def) > 0
  and position(lock_marker in add_note_def) < position('if not public.is_team_member' in add_note_def)
  and position(lock_marker in add_note_def) < position('from public.team_task_assignees' in add_note_def)
  and position(lock_marker in submit_assignee_def) > 0
  and position(lock_marker in submit_assignee_def) < position('if not public.is_team_member' in submit_assignee_def)
  and position(lock_marker in submit_assignee_def) < position('from public.team_task_assignees' in submit_assignee_def)
  and position(lock_marker in review_assignee_def) > 0
  and position(lock_marker in review_assignee_def) < position('if not public.is_task_approver' in review_assignee_def)
  and position(lock_marker in review_assignee_def) < position('from public.team_task_assignees' in review_assignee_def)
  and position(lock_marker in reopen_task_def) > 0
  and position(lock_marker in reopen_task_def) < position('perform public.assert_task_editor' in reopen_task_def)
  and position(lock_marker in reopen_task_def) < position('from public.team_tasks where id = p_task_id for update' in reopen_task_def)
  and position(lock_marker in archive_task_def) > 0
  and position(lock_marker in archive_task_def) < position('perform public.assert_task_editor' in archive_task_def)
  and position(lock_marker in archive_task_def) < position('from public.team_tasks where id = p_task_id for update' in archive_task_def)
  and position(lock_marker in close_assignee_def) > 0
  and position(lock_marker in close_assignee_def) < position('perform public.assert_task_editor' in close_assignee_def)
  and position(lock_marker in close_assignee_def) < position('from public.team_task_assignees' in close_assignee_def)
  and position(lock_marker in create_invite_def) > 0
  and position(lock_marker in create_invite_def) < position('perform public.assert_team_leader' in create_invite_def)
  and position(lock_marker in create_invite_def) < position('insert into public.team_invites' in create_invite_def)
  and position('select team_id into v_team_id' in accept_invite_def) > 0
  and position('select team_id into v_team_id' in accept_invite_def) < position(lock_marker in accept_invite_def)
  and position(lock_marker in accept_invite_def) > 0
  and position(lock_marker in accept_invite_def) < position('select * into v_invite' in accept_invite_def)
  and position('for update' in substring(accept_invite_def from position('select * into v_invite' in accept_invite_def))) > 0
  and position(lock_marker in accept_invite_def) < position('if exists (' in accept_invite_def)
  and position(lock_marker in revoke_invite_def) > 0
  and position(lock_marker in revoke_invite_def) < position('perform public.assert_team_leader' in revoke_invite_def)
  and position('from public.team_invites' in substring(revoke_invite_def from position(lock_marker in revoke_invite_def))) > 0,
  'team-row locks precede task/assignee/invite locks and auth rechecks'
)
from defs;
select ok(
  position('v_team_inserted boolean := false' in pg_get_functiondef('public.team_create_team(uuid,text,text,uuid)'::regprocedure)) > 0
  and position('delete from public.teams where id = p_team_id' in pg_get_functiondef('public.team_create_team(uuid,text,text,uuid)'::regprocedure)) > 0,
  'create-team claim conflict cleans up an inserted team'
);

select ok(
  exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'team_members'
  ),
  'team_members is published for realtime membership changes'
);
select * from finish();
rollback;
