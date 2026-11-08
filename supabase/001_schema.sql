-- SIS 0.1: run once in a NEW Supabase project, before 002_courses.sql.
begin;
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 name text not null check (length(trim(name)) between 2 and 100),
 email text not null,
 role text not null default 'student' check (role in ('student','teacher','admin')),
 status text not null default 'pending' check (status in ('pending','active','suspended')),
 group_name text not null default '' check (length(group_name)<=60),
 version integer not null default 1,
 created_at timestamptz not null default now()
);
create table public.courses (
 id uuid primary key default gen_random_uuid(),
 name text not null check (length(trim(name)) between 2 and 120),
 code text not null unique check (length(code) between 1 and 30),
 category text not null default 'Басқа пәндер',
 credits integer not null default 5 check (credits between 1 and 30),
 description text not null default '' check (length(description)<=2000),
 teacher_id uuid references public.profiles(id),
 group_name text not null default '' check (length(group_name)<=60),
 version integer not null default 1,
 created_at timestamptz not null default now()
);
create table public.enrollments (
 course_id uuid not null references public.courses(id) on delete cascade,
 student_id uuid not null references public.profiles(id),
 created_at timestamptz not null default now(),
 primary key(course_id,student_id)
);
create table public.grades (
 id uuid primary key default gen_random_uuid(),
 course_id uuid not null,
 student_id uuid not null,
 assessment text not null check (length(trim(assessment)) between 1 and 120),
 week integer not null default 0 check (week between 0 and 52),
 score numeric(5,2) not null check (score between 0 and 100),
 updated_by uuid not null default auth.uid() references public.profiles(id),
 updated_at timestamptz not null default now(),
 version integer not null default 1,
 foreign key(course_id,student_id) references public.enrollments(course_id,student_id),
 unique(course_id,student_id,assessment,week)
);
create table public.schedules (
 id uuid primary key default gen_random_uuid(),
 course_id uuid not null references public.courses(id) on delete cascade,
 day integer not null check (day between 1 and 7),
 start_time time not null,
 room text not null check (length(room) between 1 and 60),
 version integer not null default 1
);
create table public.assignments (
 id uuid primary key default gen_random_uuid(),
 course_id uuid not null references public.courses(id) on delete cascade,
 title text not null check (length(trim(title)) between 1 and 500),
 kind text not null check (kind in ('Дәріс','Практика','БӨЖ','Тест','Емтихан')),
 week integer not null check (week between 1 and 52),
 due_date date,
 file_path text,
 file_name text,
 version integer not null default 1,
 created_at timestamptz not null default now()
);
create table public.submissions (
 id uuid primary key default gen_random_uuid(),
 assignment_id uuid not null references public.assignments(id) on delete cascade,
 student_id uuid not null references public.profiles(id),
 file_path text not null,
 file_name text not null check (length(file_name) between 1 and 250),
 submitted_at timestamptz not null default now(),
 version integer not null default 1,
 unique(assignment_id,student_id)
);
create table public.notices (
 id uuid primary key default gen_random_uuid(),
 body text not null check (length(trim(body)) between 1 and 2000),
 author_id uuid not null default auth.uid() references public.profiles(id),
 created_at timestamptz not null default now()
);
create table public.audit_log (
 id bigint generated always as identity primary key,
 actor_id uuid,
 table_name text not null,
 action text not null,
 record_id text,
 before_data jsonb,
 after_data jsonb,
 happened_at timestamptz not null default now()
);
create index enrollments_student_idx on public.enrollments(student_id);
create index courses_teacher_idx on public.courses(teacher_id);
create index grades_student_idx on public.grades(student_id);
create index assignments_course_idx on public.assignments(course_id);
create index submissions_student_idx on public.submissions(student_id);

-- Definer helpers read only authorization facts; no client role claims are trusted.
create function private.actor_role() returns text language sql stable security definer set search_path='' as $$
 select role from public.profiles where id=auth.uid() and status='active'
$$;
create function private.is_admin() returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(private.actor_role()='admin',false)
$$;
create function private.teaches(cid uuid) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(private.actor_role()='teacher',false) and exists(select 1 from public.courses where id=cid and teacher_id=auth.uid())
$$;
create function private.enrolled(cid uuid) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(private.actor_role()='student',false) and exists(select 1 from public.enrollments where course_id=cid and student_id=auth.uid())
$$;
create function private.course_access(cid uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.is_admin() or private.teaches(cid) or private.enrolled(cid)
$$;
create function private.student_in_course(cid uuid,sid uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.enrollments e join public.profiles p on p.id=e.student_id where e.course_id=cid and e.student_id=sid and p.role='student' and p.status='active')
$$;
create function private.can_enroll(cid uuid,sid uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.courses c join public.profiles p on p.id=sid where c.id=cid and p.role='student' and p.status='active' and (c.group_name='' or c.group_name=p.group_name))
$$;
create function private.sees_profile(pid uuid) returns boolean language sql stable security definer set search_path='' as $$
 select pid=auth.uid() or private.is_admin() or
 (private.actor_role() is not null and exists(select 1 from public.profiles p where p.id=pid and p.role='teacher' and p.status='active')) or
 (private.actor_role()='teacher' and exists(select 1 from public.enrollments e join public.courses c on c.id=e.course_id where e.student_id=pid and c.teacher_id=auth.uid()))
$$;
create function private.assignment_access(aid uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.assignments where id=aid and private.course_access(course_id))
$$;
create function private.reviews_assignment(aid uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.assignments where id=aid and (private.is_admin() or private.teaches(course_id)))
$$;

create function private.on_signup() returns trigger language plpgsql security definer set search_path='' as $$
 begin
 insert into public.profiles(id,name,email) values(new.id,left(coalesce(nullif(trim(new.raw_user_meta_data->>'name'),''),'Жаңа пайдаланушы'),100),coalesce(new.email,''));
 return new;
 end
$$;
create trigger sis_on_signup after insert on auth.users for each row execute function private.on_signup();
create function private.sync_email() returns trigger language plpgsql security definer set search_path='' as $$
 begin update public.profiles set email=coalesce(new.email,'') where id=new.id; return new; end
$$;
create trigger sis_email_changed after update of email on auth.users for each row execute function private.sync_email();

create function private.bump_version() returns trigger language plpgsql set search_path='' as $$
 begin new.version=old.version+1;return new;end
$$;
create function private.check_course_teacher() returns trigger language plpgsql security definer set search_path='' as $$
 begin
 if new.teacher_id is not null and not exists(select 1 from public.profiles where id=new.teacher_id and role='teacher' and status='active') then raise exception 'Select an active teacher'; end if;
 return new; end
$$;
create trigger course_teacher before insert or update on public.courses for each row execute function private.check_course_teacher();
create function private.grade_metadata() returns trigger language plpgsql set search_path='' as $$
 begin new.updated_by=auth.uid();new.updated_at=now();return new;end
$$;
create trigger grade_metadata before insert or update on public.grades for each row execute function private.grade_metadata();
create function private.submission_metadata() returns trigger language plpgsql set search_path='' as $$
 begin new.submitted_at=now();return new;end
$$;
create trigger submission_metadata before insert or update on public.submissions for each row execute function private.submission_metadata();
create function private.audit_change() returns trigger language plpgsql security definer set search_path='' as $$
 begin
 insert into public.audit_log(actor_id,table_name,action,record_id,before_data,after_data)
 values(auth.uid(),tg_table_name,tg_op,coalesce(to_jsonb(new)->>'id',to_jsonb(old)->>'id'),case when tg_op<>'INSERT' then to_jsonb(old) end,case when tg_op<>'DELETE' then to_jsonb(new) end);
 return coalesce(new,old); end
$$;
create trigger grades_audit after insert or update or delete on public.grades for each row execute function private.audit_change();
create trigger profiles_audit after update on public.profiles for each row execute function private.audit_change();
create trigger courses_audit after insert or update or delete on public.courses for each row execute function private.audit_change();

-- Admin approval is an explicit transaction, never a signup metadata field.
create function public.set_account_access(target uuid,new_role text,new_status text,new_group text,expected_version integer)
 returns void language plpgsql security definer set search_path='' as $$
 begin
 if not private.is_admin() or target=auth.uid() then raise exception 'Access denied' using errcode='42501';end if;
 if new_role not in ('student','teacher','admin') or new_status not in ('pending','active','suspended') or length(new_group)>60 then raise exception 'Invalid access settings';end if;
 update public.profiles set role=new_role,status=new_status,group_name=new_group where id=target and version=expected_version;
 if not found then raise exception 'Account changed; refresh and retry';end if;
 end
$$;
revoke all on function public.set_account_access(uuid,text,text,text,integer) from public,anon;
grant execute on function public.set_account_access(uuid,text,text,text,integer) to authenticated;

-- Enable RLS and grant narrowly scoped DML. Tables are never accessible anonymously.
do $$ declare t text;begin
 foreach t in array array['profiles','courses','enrollments','grades','schedules','assignments','submissions','notices','audit_log'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon,authenticated',t);
 execute format('grant select on public.%I to authenticated',t);
 end loop;
 foreach t in array array['profiles','courses','grades','schedules','assignments','submissions'] loop
 execute format('create trigger version_before_update before update on public.%I for each row execute function private.bump_version()',t);
 end loop;
 end $$;
grant insert,update,delete on public.courses,public.enrollments,public.grades,public.schedules,public.assignments,public.submissions to authenticated;
grant update(name) on public.profiles to authenticated;
grant insert,delete on public.notices to authenticated;

create policy profiles_read on public.profiles for select to authenticated using(private.sees_profile(id));
create policy profiles_name on public.profiles for update to authenticated using(id=auth.uid()) with check(id=auth.uid());
create policy courses_read on public.courses for select to authenticated using(private.actor_role() is not null);
create policy courses_manage on public.courses for all to authenticated using(private.is_admin()) with check(private.is_admin());
create policy enrollment_read on public.enrollments for select to authenticated using(private.is_admin() or private.teaches(course_id) or (student_id=auth.uid() and private.actor_role()='student'));
create policy enrollment_add on public.enrollments for insert to authenticated with check((private.is_admin() or (student_id=auth.uid() and private.actor_role()='student')) and private.can_enroll(course_id,student_id));
create policy enrollment_remove on public.enrollments for delete to authenticated using(private.is_admin() or (student_id=auth.uid() and private.actor_role()='student'));
create policy grades_read on public.grades for select to authenticated using(private.is_admin() or private.teaches(course_id) or (student_id=auth.uid() and private.actor_role()='student'));
create policy grades_add on public.grades for insert to authenticated with check((private.is_admin() or private.teaches(course_id)) and private.student_in_course(course_id,student_id));
create policy grades_edit on public.grades for update to authenticated using(private.is_admin() or private.teaches(course_id)) with check((private.is_admin() or private.teaches(course_id)) and private.student_in_course(course_id,student_id));
create policy grades_delete on public.grades for delete to authenticated using(private.is_admin());
create policy schedules_read on public.schedules for select to authenticated using(private.course_access(course_id));
create policy schedules_manage on public.schedules for all to authenticated using(private.is_admin() or private.teaches(course_id)) with check(private.is_admin() or private.teaches(course_id));
create policy assignments_read on public.assignments for select to authenticated using(private.course_access(course_id));
create policy assignments_manage on public.assignments for all to authenticated using(private.is_admin() or private.teaches(course_id)) with check(private.is_admin() or private.teaches(course_id));
create policy submissions_read on public.submissions for select to authenticated using(private.reviews_assignment(assignment_id) or (student_id=auth.uid() and private.actor_role()='student' and private.assignment_access(assignment_id)));
create policy submissions_add on public.submissions for insert to authenticated with check(student_id=auth.uid() and private.actor_role()='student' and private.assignment_access(assignment_id));
create policy submissions_edit on public.submissions for update to authenticated using(student_id=auth.uid() and private.actor_role()='student') with check(student_id=auth.uid() and private.actor_role()='student' and private.assignment_access(assignment_id));
create policy notices_read on public.notices for select to authenticated using(private.actor_role() is not null);
create policy notices_add on public.notices for insert to authenticated with check(author_id=auth.uid() and private.actor_role() in ('teacher','admin'));
create policy notices_remove on public.notices for delete to authenticated using(private.is_admin() or (author_id=auth.uid() and private.actor_role()='teacher'));
create policy audit_read on public.audit_log for select to authenticated using(private.is_admin());

-- Private files: each path is tied to its course / assignment and uploader.
-- UUID parsing fails closed on invalid path data.
create function private.file_access(path text,writing boolean) returns boolean language plpgsql stable security definer set search_path='' as $$
 declare parts text[]; cid uuid; aid uuid; sid uuid;
 begin
 parts=string_to_array(path,'/');
 if array_length(parts,1)<>4 then return false;end if;
 if parts[1]='courses' then
 cid=parts[2]::uuid;
 if writing then return private.is_admin() or private.teaches(cid);end if;
 return private.course_access(cid);
 elsif parts[1]='submissions' then
 aid=parts[2]::uuid;sid=parts[3]::uuid;
 if writing then return private.actor_role()='student' and sid=auth.uid() and private.assignment_access(aid);end if;
 return private.reviews_assignment(aid) or (private.actor_role()='student' and sid=auth.uid() and private.assignment_access(aid));
 end if;
 return false;
 exception when invalid_text_representation then return false;
 end
$$;
create function private.check_file_reference() returns trigger language plpgsql security definer set search_path='' as $$
 declare expected text;
 begin
 if new.file_path is null then return new;end if;
 if tg_table_name='assignments' then expected='courses/'||new.course_id::text||'/';
 else expected='submissions/'||new.assignment_id::text||'/'||new.student_id::text||'/';end if;
 if left(new.file_path,length(expected))<>expected or not private.file_access(new.file_path,false) or not exists(select 1 from storage.objects where bucket_id='sis-files' and name=new.file_path) then raise exception 'Invalid file reference';end if;
 return new;end
$$;
create trigger assignment_file before insert or update on public.assignments for each row execute function private.check_file_reference();
create trigger submission_file before insert or update on public.submissions for each row execute function private.check_file_reference();
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('sis-files','sis-files',false,10485760,array['application/pdf','text/plain','image/png','image/jpeg','application/zip','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.presentationml.presentation','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']) on conflict(id) do nothing;
create policy sis_files_read on storage.objects for select to authenticated using(bucket_id='sis-files' and private.file_access(name,false));
create policy sis_files_add on storage.objects for insert to authenticated with check(bucket_id='sis-files' and private.file_access(name,true));
-- Immutable objects. Replacing a submission uploads a NEW object; no client overwrite/delete permissions.

revoke execute on all functions in schema private from public,anon;
grant execute on function private.actor_role(),private.is_admin(),private.teaches(uuid),private.enrolled(uuid),private.course_access(uuid),private.student_in_course(uuid,uuid),private.can_enroll(uuid,uuid),private.sees_profile(uuid),private.assignment_access(uuid),private.reviews_assignment(uuid),private.file_access(text,boolean) to authenticated;
commit;
