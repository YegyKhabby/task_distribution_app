begin;

create table if not exists task_week_settings (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references tasks(id) on delete cascade,
  week_number int not null check (week_number between 1 and 4),
  weekly_hours_target numeric not null default 0,
  unique(task_id, week_number)
);

insert into task_week_settings (task_id, week_number, weekly_hours_target)
select t.id, w.week_number, t.weekly_hours_target
from tasks t
cross join (values (1), (2), (3), (4)) as w(week_number)
on conflict (task_id, week_number) do update
set weekly_hours_target = excluded.weekly_hours_target;

create table if not exists task_fixed_hours_new (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references tasks(id) on delete cascade,
  person_id uuid references people(id) on delete cascade,
  week_number int not null check (week_number between 1 and 4),
  hours numeric not null default 0,
  unique(task_id, person_id, week_number)
);

insert into task_fixed_hours_new (task_id, person_id, week_number, hours)
select tfh.task_id, tfh.person_id, w.week_number, tfh.hours
from task_fixed_hours tfh
cross join (values (1), (2), (3), (4)) as w(week_number)
on conflict (task_id, person_id, week_number) do update
set hours = excluded.hours;

drop table if exists task_fixed_hours cascade;
alter table task_fixed_hours_new rename to task_fixed_hours;

alter table task_fixed_hours enable row level security;
drop policy if exists "allow all" on task_fixed_hours;
create policy "allow all" on task_fixed_hours for all using (true) with check (true);

alter table task_week_settings enable row level security;
drop policy if exists "allow all" on task_week_settings;
create policy "allow all" on task_week_settings for all using (true) with check (true);

commit;
