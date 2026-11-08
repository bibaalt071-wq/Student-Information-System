import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

let db;
const ids={admin:'00000000-0000-0000-0000-000000000001',teacher:'00000000-0000-0000-0000-000000000002',otherTeacher:'00000000-0000-0000-0000-000000000003',student:'00000000-0000-0000-0000-000000000004',otherStudent:'00000000-0000-0000-0000-000000000005',pending:'00000000-0000-0000-0000-000000000006'};
const courseA='10000000-0000-0000-0000-000000000001',courseB='10000000-0000-0000-0000-000000000002';
const assignment='20000000-0000-0000-0000-000000000001';
const grade='30000000-0000-0000-0000-000000000001';
async function as(who){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[ids[who]||'']);await db.exec('set role authenticated');}
async function sql(text,params=[]){return (await db.query(text,params)).rows;}
async function denied(text,params=[]){await assert.rejects(()=>db.query(text,params));}
before(async()=>{
 db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create schema auth;create schema storage;grant usage on schema auth,storage,public to anon,authenticated;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}'::jsonb);
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;grant select,insert,update,delete on storage.objects to authenticated;`);
 await db.exec(await readFile(new URL('../supabase/001_schema.sql',import.meta.url),'utf8'));
 await db.exec(await readFile(new URL('../supabase/002_courses.sql',import.meta.url),'utf8'));
 for(const [name,id] of Object.entries(ids))await db.query("insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)",[id,name+'@example.test',JSON.stringify({name:name,role:'admin',status:'active'})]);
 await db.query("update public.profiles set role='admin',status='active' where id=$1",[ids.admin]);
 await db.query("update public.profiles set role='teacher',status='active' where id in ($1,$2)",[ids.teacher,ids.otherTeacher]);
 await db.query("update public.profiles set role='student',status='active',group_name='CS-1' where id in ($1,$2)",[ids.student,ids.otherStudent]);
 await db.query("insert into public.courses(id,name,code,teacher_id,group_name) values($1,'Test A','TESTA',$2,'CS-1'),($3,'Test B','TESTB',$4,'CS-2')",[courseA,ids.teacher,courseB,ids.otherTeacher]);
 await db.query('insert into public.enrollments(course_id,student_id) values($1,$2),($1,$3)',[courseA,ids.student,ids.otherStudent]);
 await as('teacher');
 await db.query("insert into public.grades(id,course_id,student_id,assessment,score) values($1,$2,$3,'Exam',90)",[grade,courseA,ids.student]);
 await db.query("insert into public.grades(course_id,student_id,assessment,score) values($1,$2,'Exam',65)",[courseA,ids.otherStudent]);
 await db.query("insert into public.assignments(id,course_id,title,kind,week) values($1,$2,'Task','БӨЖ',1)",[assignment,courseA]);
});
after(async()=>{await db?.close()});
test('untrusted signup role metadata is ignored; pending sees no academic data',async()=>{
 await as('pending');const p=await sql('select * from public.profiles');assert.equal(p.length,1);assert.equal(p[0].role,'student');assert.equal(p[0].status,'pending');
 assert.equal((await sql('select * from public.courses')).length,0);assert.equal((await sql('select * from public.grades')).length,0);
 await denied("update public.profiles set role='admin' where id=$1",[ids.pending]);
 await denied("select public.set_account_access($1,'admin','active','',1)",[ids.pending]);
});
test('student reads only own grades; cannot write grades or view other students',async()=>{
 await as('student');const rows=await sql('select * from public.grades');assert.equal(rows.length,1);assert.equal(rows[0].student_id,ids.student);
 assert.equal((await sql('select * from public.profiles where id=$1',[ids.otherStudent])).length,0);
 await denied("insert into public.grades(course_id,student_id,assessment,score) values($1,$2,'Hack',100)",[courseA,ids.student]);
 assert.equal((await sql('update public.grades set score=100 where id=$1 returning id',[grade])).length,0);
 await denied("update public.profiles set status='active' where id=$1",[ids.student]);
 const row=(await sql("update public.profiles set name='Updated Student' where id=$1 returning *",[ids.student]))[0];assert.equal(row.name,'Updated Student');assert.equal(row.role,'student');
});
test('teacher can grade their roster only, cannot change course assignment',async()=>{
 await as('otherTeacher');assert.equal((await sql('select * from public.grades')).length,0);
 await denied("insert into public.grades(course_id,student_id,assessment,score) values($1,$2,'Hack',100)",[courseA,ids.student]);
 assert.equal((await sql('update public.courses set teacher_id=$1 where id=$2 returning id',[ids.otherTeacher,courseA])).length,0);
 await as('teacher');assert.equal((await sql('select * from public.grades')).length,2);
 await denied("insert into public.grades(course_id,student_id,assessment,score) values($1,$2,'Non roster',100)",[courseA,ids.pending]);
});
test('grade bounds, optimistic concurrency and immutable audit actor',async()=>{
 await as('teacher');await denied('update public.grades set score=101 where id=$1',[grade]);
 let g=(await sql('select * from public.grades where id=$1',[grade]))[0];
 const updated=await sql('update public.grades set score=95,updated_by=$1 where id=$2 and version=$3 returning *',[ids.admin,grade,g.version]);assert.equal(updated.length,1);assert.equal(updated[0].updated_by,ids.teacher);
 assert.equal((await sql('update public.grades set score=50 where id=$1 and version=$2 returning id',[grade,g.version])).length,0);
 assert.equal((await sql('select * from public.audit_log')).length,0);
 await as('admin');const audit=await sql("select * from public.audit_log where table_name='grades' and action='UPDATE'");assert.equal(audit.length,1);assert.equal(audit[0].actor_id,ids.teacher);assert.equal(audit[0].before_data.score,90);assert.equal(audit[0].after_data.score,95);
 await denied("insert into public.audit_log(table_name,action) values('x','x')");
});
test('enrollment respects group and cannot erase graded history',async()=>{
 await as('student');await denied('insert into public.enrollments(course_id,student_id) values($1,$2)',[courseB,ids.student]);
 await denied('delete from public.enrollments where course_id=$1 and student_id=$2',[courseA,ids.student]);
});
test('admin approval and suspension take effect on the next query',async()=>{
 await as('admin');const p=(await sql('select * from public.profiles where id=$1',[ids.pending]))[0];
 await sql("select public.set_account_access($1,'student','active','CS-1',$2)",[ids.pending,p.version]);
 await denied("select public.set_account_access($1,'admin','active','',$2)",[ids.pending,p.version]);
 await denied("select public.set_account_access($1,'student','suspended','',1)",[ids.admin]);
 await as('pending');assert.ok((await sql('select * from public.courses')).length>=53);
 await as('admin');const p2=(await sql('select * from public.profiles where id=$1',[ids.pending]))[0];await sql("select public.set_account_access($1,'student','suspended','CS-1',$2)",[ids.pending,p2.version]);
 await as('pending');assert.equal((await sql('select * from public.courses')).length,0);
});
test('private upload paths, submission isolation and immutable objects',async()=>{
 const own=`submissions/${assignment}/${ids.student}/answer.pdf`,other=`submissions/${assignment}/${ids.otherStudent}/answer.pdf`;
 await as('student');await sql("insert into storage.objects(bucket_id,name) values('sis-files',$1)",[own]);
 await denied("insert into storage.objects(bucket_id,name) values('sis-files',$1)",[other]);
 await sql('insert into public.submissions(assignment_id,student_id,file_path,file_name) values($1,$2,$3,$4)',[assignment,ids.student,own,'answer.pdf']);
 await denied('insert into public.submissions(assignment_id,student_id,file_path,file_name) values($1,$2,$3,$4)',[assignment,ids.otherStudent,own,'forged.pdf']);
 assert.equal((await sql("update storage.objects set name='changed' returning name")).length,0);
 await as('otherStudent');assert.equal((await sql('select * from public.submissions')).length,0);assert.equal((await sql('select * from storage.objects')).length,0);
 await as('teacher');assert.equal((await sql('select * from public.submissions')).length,1);assert.equal((await sql('select * from storage.objects')).length,1);
 await as('otherTeacher');assert.equal((await sql('select * from public.submissions')).length,0);assert.equal((await sql('select * from storage.objects')).length,0);
});
test('malformed file paths fail closed and anonymous users have no table access',async()=>{
 await as('student');assert.equal((await sql("select private.file_access('submissions/not-a-uuid/user/file.pdf',false) as ok"))[0].ok,false);
 await db.exec('reset role;set role anon');await denied('select * from public.grades');await denied('select * from public.courses');
});
