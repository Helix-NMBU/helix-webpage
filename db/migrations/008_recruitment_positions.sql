-- Recruitment catalog: applications deliberately keep their historical position ID/title.
-- The one-time seed copies the checked-in public catalog, never legacy application records.
begin;
create table if not exists website.positions (
  id text primary key,
  document jsonb not null check (jsonb_typeof(document) = 'object' and document->>'id' = id),
  visible boolean not null default false,
  created_at timestamptz not null default now()
);
create table if not exists website.position_catalog_seeded (
  singleton boolean primary key default true check (singleton)
);
-- A separate marker prevents migration replay from restoring deleted postings.
with first_seed as (
  insert into website.position_catalog_seeded (singleton) values (true) on conflict do nothing returning singleton
)
insert into website.positions (id, document, visible)
select entry->>'id', entry, true
from jsonb_array_elements('[{"id": "open-application", "title": "Open Application", "department": "Open", "applyUrl": "", "contact": {"name": "Niclas Karlsen", "email": "niclas.karlsen@helixnmbu.no"}, "about": "Don''t see a role that fits you exactly? We''re always interested in hearing from talented, motivated students who share our passion for engineering and innovation. Tell us who you are, what you bring to the table and how you think you can contribute to Helix NMBU.", "tasks": ["Tell us about yourself and your background", "Describe the skills and experience you''d bring to the team", "Let us know which area of the car or organisation interests you most", "Share examples of projects, coursework or work you''re proud of"], "achieve": ["A place on a passionate, high-performing student team", "Hands-on experience in your area of interest", "A network spanning engineering, business and design at NMBU and beyond"], "visible": true}, {"id": "business-partnerships", "title": "Partner Relations Coordinator", "department": "Business & Marketing", "applyUrl": "", "contact": {"name": "Aslan Yelli ", "email": "aslan.yelli@helixnmbu.no", "linkedin": "https://www.linkedin.com/in/aslan-yelli-04259a271/"}, "about": "You will be responsible for securing the financial foundation of the team: identifying prospects, building relationships and closing sponsorship agreements that fund our season. This is a sales and relationship-driven role that combines strategic thinking with persistence and strong communication skills.", "tasks": ["Research, identify and approach potential sponsors across industries", "Prepare tailored proposals, pitch decks and partnership packages", "Lead meetings and negotiations with companies at various levels", "Manage the pipeline of prospects and maintain accurate records of outreach", "Work with the Head of Business to ensure sponsor deliverables are met"], "achieve": ["A secured sponsor portfolio that meaningfully funds the season", "Real experience in B2B sales, negotiation and account management", "Lasting professional relationships in the Norwegian engineering and tech industry"], "visible": true}, {"id": "communication-content-manager", "title": "Communication & Content Manager", "department": "Business & Marketing", "applyUrl": "", "contact": {"name": "Selma Woldseth", "email": "selma.woldseth@helixnmbu.no", "linkedin": "https://linkedin.com/in/selma-w-040660363"}, "about": "As Communication & Content Manager you will own how Helix tells its story: planning and running our communication across social media, the website and press. You will set the content strategy, keep the publishing rhythm going through the season and make sure sponsors, students and the FSAE community see what we''re building.", "tasks": ["Own the content calendar and publishing across our social channels", "Set the tone and visual direction together with the design profile", "Coordinate content creators and photographers around builds and events", "Produce sponsor visibility content and ensure partner commitments are delivered", "Track engagement and use it to sharpen the communication strategy"], "achieve": ["A visible, growing brand you shaped and ran through a full season", "Real experience in communication strategy, publishing and analytics", "A portfolio of campaigns tied to a race car people care about"], "visible": true}]'::jsonb) as entry
where exists (select 1 from first_seed)
on conflict (id) do nothing;
alter table website.positions enable row level security;
alter table website.position_catalog_seeded enable row level security;
revoke all on website.positions, website.position_catalog_seeded from public;
do $$
declare browser_role text;
begin
  for browser_role in select rolname from pg_roles where rolname in ('anon', 'anonymous', 'authenticated') loop
    execute format('revoke all on website.positions, website.position_catalog_seeded from %I', browser_role);
  end loop;
end;
$$;
grant select, insert, update, delete on website.positions, website.position_catalog_seeded to current_user;
commit;
