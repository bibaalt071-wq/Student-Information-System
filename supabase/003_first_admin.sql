-- Run AFTER signing up and confirming your email on the deployed site.
-- Replace only the placeholder with YOUR verified email.
-- Execute in the project's SQL Editor as the project owner, never in browser code.
do $$
declare target_email text := 'REPLACE_WITH_YOUR_VERIFIED_EMAIL'; target_id uuid;
begin
 if target_email='REPLACE_WITH_YOUR_VERIFIED_EMAIL' then raise exception 'Set your verified email first';end if;
 if exists(select 1 from public.profiles where role='admin' and status='active') then raise exception 'An active administrator already exists. Use the application to manage access.';end if;
 select id into target_id from auth.users where lower(email)=lower(target_email) and email_confirmed_at is not null;
 if target_id is null then raise exception 'Verified account not found. Sign up and confirm email first.';end if;
 update public.profiles set role='admin',status='active' where id=target_id;
 if not found then raise exception 'Profile missing; check schema installation.';end if;
end $$;
