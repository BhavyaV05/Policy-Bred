-- Grant dashboard access to the researcher account.
-- 1) In Supabase: Authentication > Users > "Add user" (email + password, tick "Auto Confirm User").
-- 2) Replace the e-mail below with that account's e-mail and run this in the SQL Editor.
-- Only users listed in public.admin_users can read any study data; everyone else gets empty results / permission errors.

insert into public.admin_users (user_id, note)
select id, 'researcher'
from auth.users
where email = 'YOUR-EMAIL@example.com';

-- Check it worked (should return 1 row):
select * from public.admin_users;

-- To revoke access later:
-- delete from public.admin_users where user_id = (select id from auth.users where email = 'YOUR-EMAIL@example.com');
