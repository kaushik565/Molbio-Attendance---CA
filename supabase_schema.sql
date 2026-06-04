-- Supabase Database Setup Script (Simplified Table-based Auth)
-- Paste this script into the Supabase SQL Editor (https://supabase.com) and click Run.

-- 1. Create a table for public profiles (stores usernames, passwords, and shift roles)
create table if not exists public.profiles (
  id text primary key, -- e.g. 'admin', 'shift_a', 'shift_b', 'shift_c', 'shift_general'
  username text unique not null, -- The supervisor's name (used as login username!)
  password text not null, -- Login password set by Admin
  role text not null check (role in ('admin', 'supervisor', 'viewer')),
  assigned_shift text not null check (assigned_shift in ('A', 'B', 'C', 'General', 'All')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. Create the employees table
create table if not exists public.employees (
  id text primary key, -- Employee ID like EMP001
  name text not null,
  shift text not null check (shift in ('A', 'B', 'C', 'General')),
  role text not null,
  is_active boolean default true not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 3. Create the attendance table
create table if not exists public.attendance (
  id bigint generated always as identity primary key,
  employee_id text references public.employees(id) on delete cascade not null,
  date date not null,
  status text not null check (status in ('P', 'A')),
  marked_by text references public.profiles(id) on delete set null,
  marked_at timestamp with time zone default timezone('utc'::text, now()) not null,
  
  -- Prevent double entries for the same employee on the same date
  unique(employee_id, date)
);

-- Disable Row Level Security (RLS) on all tables to allow simplified database-level authentication
alter table public.profiles disable row level security;
alter table public.employees disable row level security;
alter table public.attendance disable row level security;

-- Pre-seed the system with Admin and Default Shift accounts
insert into public.profiles (id, username, password, role, assigned_shift)
values 
  ('admin', 'admin', 'Molbio@qa', 'admin', 'All'),
  ('shift_a', 'Supervisor Shift A', 'shiftA123', 'supervisor', 'A'),
  ('shift_b', 'Supervisor Shift B', 'shiftB123', 'supervisor', 'B'),
  ('shift_c', 'Supervisor Shift C', 'shiftC123', 'supervisor', 'C'),
  ('shift_general', 'Supervisor General', 'general123', 'supervisor', 'General')
on conflict (id) do update set
  password = excluded.password,
  role = excluded.role,
  assigned_shift = excluded.assigned_shift;

-- 4. Create performance indexes to speed up dates range queries and filters
create index if not exists idx_attendance_date_emp on public.attendance(date, employee_id);
create index if not exists idx_employees_active_shift on public.employees(is_active, shift);

