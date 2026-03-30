-- Run this in Supabase SQL editor to create the schema

create extension if not exists "pgcrypto";

-- People (name only — hours come from their schedule)
create table if not exists people (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  active boolean not null default true,
  created_at timestamptz default now()
);

-- Work schedule: one row per person per weekday they work
create table if not exists person_schedule (
  id uuid primary key default gen_random_uuid(),
  person_id uuid references people(id) on delete cascade,
  day_of_week int not null check (day_of_week between 1 and 5), -- 1=Mon … 5=Fri
  hours numeric not null default 0,
  unique(person_id, day_of_week)
);

-- Tasks (manager defines these)
create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  priority int,
  color text,
  weekly_hours_target numeric not null default 0,  -- total hrs/week the task needs
  created_at timestamptz default now()
);

-- Which people are assigned to each task
create table if not exists task_people (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references tasks(id) on delete cascade,
  person_id uuid references people(id) on delete cascade,
  week_number int not null check (week_number between 1 and 4),
  unique(task_id, person_id, week_number)
);

-- Fixed/default hours per person per task (set before auto-distribution)
create table if not exists task_fixed_hours (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references tasks(id) on delete cascade,
  person_id uuid references people(id) on delete cascade,
  hours numeric not null default 0,
  unique(task_id, person_id)
);

-- Final distribution output (written by the distribute endpoint)
create table if not exists task_distribution (
  id uuid primary key default gen_random_uuid(),
  person_id uuid references people(id) on delete cascade,
  task_id uuid references tasks(id) on delete cascade,
  week_number int not null check (week_number between 1 and 4),
  hours_per_week numeric not null default 0,
  preferred_day int check (preferred_day between 1 and 5),  -- 1=Mon … 5=Fri, NULL = no preference
  unique(person_id, task_id, week_number)
);

-- Absences (one row per calendar day)
create table if not exists absences (
  id uuid primary key default gen_random_uuid(),
  person_id uuid references people(id) on delete cascade,
  date date not null,
  type text not null check (type in ('sick', 'vacation')),
  reported_by text,
  created_at timestamptz default now()
);

-- Temporary reallocations (manager confirms coverage for a week)
create table if not exists temporary_reallocations (
  id uuid primary key default gen_random_uuid(),
  week_start_date date not null,
  covering_person_id uuid references people(id) on delete cascade,
  task_id uuid references tasks(id) on delete cascade,
  redirected_from_task_id uuid references tasks(id) on delete set null,
  hours numeric not null,
  confirmed_by text not null,
  created_at timestamptz default now()
);

-- Makeup hours
create table if not exists makeup_hours (
  id uuid primary key default gen_random_uuid(),
  absent_person_id uuid references people(id) on delete cascade,
  makeup_week_start_date date not null,
  task_id uuid references tasks(id) on delete cascade,
  hours numeric not null,
  note text,
  created_at timestamptz default now()
);

create index if not exists absences_date_idx on absences(date);
create index if not exists absences_person_idx on absences(person_id);
create index if not exists dist_person_idx on task_distribution(person_id);
create index if not exists dist_task_idx on task_distribution(task_id);

-- Row Level Security
-- Enables RLS on all tables and adds a permissive policy so the app continues
-- to work while blocking anonymous public access via the Supabase anon key.
alter table people enable row level security;
create policy "allow all" on people for all using (true) with check (true);

alter table person_schedule enable row level security;
create policy "allow all" on person_schedule for all using (true) with check (true);

alter table tasks enable row level security;
create policy "allow all" on tasks for all using (true) with check (true);

alter table task_people enable row level security;
create policy "allow all" on task_people for all using (true) with check (true);

alter table task_fixed_hours enable row level security;
create policy "allow all" on task_fixed_hours for all using (true) with check (true);

alter table task_distribution enable row level security;
create policy "allow all" on task_distribution for all using (true) with check (true);

alter table absences enable row level security;
create policy "allow all" on absences for all using (true) with check (true);

alter table temporary_reallocations enable row level security;
create policy "allow all" on temporary_reallocations for all using (true) with check (true);

alter table makeup_hours enable row level security;
create policy "allow all" on makeup_hours for all using (true) with check (true);
 