import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const url = process.env.FINANCE_TEST_POSTGRES_URL;
const database = `partner_rollover_test_${randomUUID().replaceAll('-', '')}`;
const manager = '91000000-0000-4000-8000-000000000001';
const finance = '91000000-0000-4000-8000-000000000002';
const read = (name: string) => readFileSync(new URL(`../../../db/migrations/${name}.sql`, import.meta.url), 'utf8');
type Run = { created: number; failed: number; failures: { contributionId: string; code: string }[] };

describe.skipIf(!url)('invoice rollover on independent PostgreSQL connections', () => {
  let admin: pg.Client | undefined;
  let pool: pg.Pool | undefined;
  let season: string;
  const query = <T extends pg.QueryResultRow = pg.QueryResultRow>(sql: string, values?: unknown[]) => pool!.query<T>(sql, values);

  beforeAll(async () => {
    const connection = new URL(url!);
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(connection.hostname) || connection.pathname !== '/postgres') {
      throw new Error('Requires a loopback PostgreSQL maintenance connection.');
    }
    admin = new pg.Client({ connectionString: connection.toString() });
    await admin.connect();
    await admin.query(`create database ${database}`);
    connection.pathname = `/${database}`;
    pool = new pg.Pool({ connectionString: connection.toString(), max: 4 });
    await query(`create schema neon_auth;
      create table neon_auth."user"(id uuid primary key,name text,email text,"emailVerified" boolean,banned boolean);
      create table neon_auth.account(id uuid primary key default gen_random_uuid(),"accountId" text,"providerId" text,"userId" uuid references neon_auth."user"(id),"createdAt" timestamptz default now());`);
    for (const migration of [
      '001_member_cv', '002_member_helix_role', '009_platform_access_and_managed_positions',
      '009_project_management', '010_department_lead_tasks', '011_task_assignees', '012_project_milestones',
      '013_project_hierarchy', '014_milestone_field_updates', '015_project_departments', '016_fixed_departments',
      '017_workspace_directory', '020_project_start_dates', '021_project_creation_milestones',
      '018_department_homes', '019_department_settings_permissions', '025_workspace_space_access',
      '026_department_access_levels', '032_estimated_task_history', '033_project_status', '022_task_backlog_status',
    ]) await query(read(migration));
    await query('create schema partner; create table partner.organizations(id uuid primary key default gen_random_uuid(),name text,active boolean)');
    for (const [id, name] of [[manager, 'Manager'], [finance, 'Finance']]) {
      await query('insert into neon_auth."user" values($1,$2,$3,true,false)', [id, name, `${name.toLowerCase()}@helixnmbu.no`]);
      await query('insert into neon_auth.account("accountId","providerId","userId") values($1,\'google\',$2)', [name, id]);
      await query('insert into identity.members(id,auth_user_id,google_sub,email,full_name) values($1,$1,$2,$3,$2)', [id, name, `${name.toLowerCase()}@helixnmbu.no`]);
    }
    for (const migration of [
      '011_finance_core', '012_finance_season_budgets', '013_finance_funding', '024_financials_member_role',
      '035_partner_deals', '037_partner_deal_funding', '038_partner_won_handoff', '039_partner_deal_funding_recovery',
      '040_partner_stable_draft_items', '041_project_current_season', '042_partner_funding_hardening',
      '043_partner_finance_review', '044_partner_due_invoices', '045_partner_finance_review_unlink',
      '046_partner_agreement_changes', '047_partner_invoice_history', '048_partner_review_notifications',
      '049_partner_added_items', '050_partner_change_reconciliation', '051_won_finance_recovery',
      '052_partner_manual_history', '053_partner_manual_review', '054_partner_manual_finance_review',
      '055_partner_manual_review_gate', '056_partner_deal_sponsor_level', '059_imported_partner_deals',
      '060_imported_partner_finance_review', '063_partner_won_card_edits', '064_partner_closed_season_reconciliation',
    ]) await query(read(migration));
    await query("insert into identity.member_roles values($1,'project_manager'),($1,'platform_administrator')", [manager]);
    season = (await query<{ id: string }>(`insert into finance.seasons(code,name,start_date,end_date,status,created_by_member_id,updated_by_member_id)
      values('S28','S28','2027-08-01','2028-07-31','active',$1,$1) returning id`, [manager])).rows[0].id;
    await query(`insert into finance.settings(setting_key,setting_value,description,updated_by_member_id) values('current_season','"S28"','Current season',$1)`, [manager]);
    await query('select project_management.provision_current_departments($1)', [manager]);
    await query("insert into project_management.department_members(department_id,member_id,access_level) select id,$1,'lead' from project_management.departments where season='S28' and name='Finance'", [finance]);
  }, 60000);

  afterAll(async () => {
    await pool?.end();
    if (admin) {
      await admin.query(`drop database if exists ${database} with (force)`);
      await admin.end();
    }
  });

  async function eligibleDeal(name: string) {
    const org = (await query<{ id: string }>('insert into partner.organizations(name,active) values($1,false) returning id', [name])).rows[0].id;
    const deal = (await query<{ id: string }>(`insert into partner_deals.deals(organization_id,title,stage,won_at,won_by_member_id,created_by_member_id,updated_by_member_id)
      values($1,'Agreement','won',now(),$2,$2,$2) returning id`, [org, manager])).rows[0].id;
    const contribution = (await query<{ id: string }>(`insert into partner_deals.contributions(deal_id,season_id,kind,amount_ore,invoice_date,organization_id)
      values($1,$2,'cash',123456,'2027-11-03',$3) returning id`, [deal, season, org])).rows[0].id;
    await query('select partner_deals.attach_won_funding($1,$2)', [manager, deal]);
    return { deal, contribution };
  }

  async function waitForLock(pid: number) {
    for (let attempt = 0; attempt < 200; attempt++) {
      const state = (await query<{ wait_event_type: string | null }>('select wait_event_type from pg_stat_activity where pid=$1', [pid])).rows[0];
      if (state?.wait_event_type === 'Lock') return;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    throw new Error('The competing connection never waited for the rollover lock.');
  }

  it('serializes genuinely overlapping runs, catches up after downtime and preserves one funding/task link', async () => {
    const { deal, contribution } = await eligibleDeal('Concurrent rollover');
    const fundingBefore = (await query('select * from partner_deals.funding_links where contribution_id=$1', [contribution])).rows;
    const first = await pool!.connect();
    const second = await pool!.connect();
    let competing: Promise<pg.QueryResult<{ result: Run }>> | undefined;
    try {
      await first.query('begin');
      await first.query('select pg_advisory_xact_lock(72704,12)');
      const pid = (await second.query<{ pid: number }>('select pg_backend_pid() pid')).rows[0].pid;
      competing = second.query<{ result: Run }>("select partner_deals.materialize_invoices_on('2027-10-03') result");
      // Attach the rejection handler immediately so a setup failure cannot leak an unhandled rejection.
      void competing.catch(() => {});
      await waitForLock(pid);
      const initial = (await first.query<{ result: Run }>("select partner_deals.materialize_invoices_on('2027-10-03') result")).rows[0].result;
      expect(initial).toMatchObject({ created: 1, failed: 0 });
      await first.query('commit');
      expect((await competing).rows[0].result).toMatchObject({ created: 0, failed: 0 });
    } finally {
      await first.query('rollback').catch(() => {});
      await competing?.catch(() => {});
      first.release();
      second.release();
    }
    expect((await query('select * from partner_deals.funding_links where contribution_id=$1', [contribution])).rows).toEqual(fundingBefore);
    const tasks = (await query<{ id: string; description: string; deadline: string }>(`select t.id,t.description,t.deadline::text from partner_deals.task_links l
      join project_management.tasks t on t.id=l.task_id where l.contribution_id=$1 and l.kind='invoice'`, [contribution])).rows;
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({ deadline: '2027-11-03' });
    expect(tasks[0].description).toContain('1234.56 NOK');
    expect((await query<{ result: Run }>("select partner_deals.materialize_invoices_on('2027-10-04') result")).rows[0].result).toMatchObject({ created: 0, failed: 0 });
    expect((await query('select task_id from partner_deals.task_links where deal_id=$1', [deal])).rows).toEqual([{ task_id: tasks[0].id }]);
  }, 30000);

  it('rolls back partial project/task creation and retries once after the database failure is repaired', async () => {
    const { deal, contribution } = await eligibleDeal('Failed rollover');
    const before = (await query<{ count: string }>('select count(*) from project_management.projects')).rows[0].count;
    await query(`create function partner_deals.fail_test_invoice() returns trigger language plpgsql as $$ begin
      if new.partner_name='Failed rollover' and new.kind='task' then raise exception 'intentional invoice failure'; end if; return new; end $$;
      create trigger fail_test_invoice before insert on project_management.tasks for each row execute function partner_deals.fail_test_invoice()`);
    try {
      const result = (await query<{ result: Run }>("select partner_deals.materialize_invoices_on('2027-10-05') result")).rows[0].result;
      expect(result).toMatchObject({ created: 0, failed: 1 });
      expect(result.failures[0].contributionId).toBe(contribution);
      expect((await query('select * from partner_deals.task_links where deal_id=$1', [deal])).rows).toHaveLength(0);
      expect((await query<{ count: string }>('select count(*) from project_management.projects')).rows[0].count).toBe(before);
      expect((await query('select * from project_management.tasks where partner_name=$1', ['Failed rollover'])).rows).toHaveLength(0);
    } finally {
      await query('drop trigger fail_test_invoice on project_management.tasks; drop function partner_deals.fail_test_invoice()');
    }
    expect((await query<{ result: Run }>("select partner_deals.materialize_invoices_on('2027-10-06') result")).rows[0].result).toMatchObject({ created: 1, failed: 0 });
    expect((await query<{ result: Run }>("select partner_deals.materialize_invoices_on('2027-10-06') result")).rows[0].result).toMatchObject({ created: 0, failed: 0 });
    expect((await query('select * from partner_deals.task_links where contribution_id=$1', [contribution])).rows).toHaveLength(1);
    expect((await query('select * from partner_deals.funding_links where contribution_id=$1', [contribution])).rows).toHaveLength(1);
  }, 30000);

  it('rechecks a company approval after a concurrent funding edit without duplicating money', async () => {
    const { deal, contribution } = await eligibleDeal('Company correction');
    await query("select partner_deals.materialize_invoices_on('2027-10-06')");
    const target = (await query<{ id: string }>("insert into partner.organizations(name,active) values('Corrected company',false) returning id")).rows[0].id;
    await query("insert into identity.member_roles values($1,'financials') on conflict do nothing", [finance]);
    const terms = { title: 'Agreement', contactName: '', contactEmail: '', startsOn: null, endsOn: null, agreementLink: '',
      cashChanges: [{ id: contribution, amountOre: '123456', invoiceDate: '2027-11-03' }], inKindChanges: [], deliverableChanges: [],
      newCash: [], newInKind: [], newDeliverables: [], cardFields: { organizationId: target } };
    const change = (await query<{ id: string }>('select partner_deals.record_agreement_change($1,$2,$3,$4,0,$5,$6,$7::jsonb) id',
      [manager, 'Manager', 'manager@helixnmbu.no', deal, 'amendment', 'Correct the named company', JSON.stringify(terms)])).rows[0].id;
    const review = (await query<{ id: string }>('select id from partner_deals.company_finance_reviews where change_id=$1', [change])).rows[0].id;
    const funding = (await query<{ id: string; revision: number }>('select f.id,f.revision from finance.funding f join partner_deals.funding_links l on l.funding_id=f.id where l.contribution_id=$1', [contribution])).rows[0];
    await query('select partner_deals.resolve_finance_review($1,$2,$3,$4,$5,$6,$7,$8::jsonb)',
      [finance, 'Finance', 'finance@helixnmbu.no', review, 'verified', funding.id, funding.revision, null]);
    const editor = await pool!.connect(), resolver = await pool!.connect();
    let attempt: Promise<{ error: Error | null }> | undefined;
    try {
      await editor.query('begin');
      await editor.query("update finance.funding set note='Concurrent Finance correction',revision=revision+1 where id=$1", [funding.id]);
      const pid = (await resolver.query<{ pid: number }>('select pg_backend_pid() pid')).rows[0].pid;
      attempt = resolver.query('select partner_deals.resolve_agreement_change($1,$2,$3,$4,$5,false)',
        [manager, 'Manager', 'manager@helixnmbu.no', change, 'Reviewed original source']).then(() => ({ error: null }), error => ({ error }));
      await waitForLock(pid);
      await editor.query('commit');
      expect((await attempt).error?.message).toContain('deal_change_company_finance_pending');
    } finally {
      await editor.query('rollback').catch(() => {});
      await attempt?.catch(() => {});
      editor.release(); resolver.release();
    }
    expect((await query<{ status: string }>('select status from partner_deals.agreement_changes where id=$1', [change])).rows[0].status).toBe('pending');
    expect((await query<{ total: string }>('select sum(f.amount_ore)::text total from finance.funding f join partner_deals.funding_links l on l.funding_id=f.id join partner_deals.contributions c on c.id=l.contribution_id where c.deal_id=$1', [deal])).rows[0].total).toBe('123456');
    expect((await query('select * from partner_deals.funding_links where contribution_id=$1', [contribution])).rows).toHaveLength(1);
  }, 30000);

  it('keeps future invoices planned until explicit season setup, then catches up without changing historical tasks', async () => {
    const nextSeason = (await query<{ id: string }>(`insert into finance.seasons(code,name,start_date,end_date,status,created_by_member_id,updated_by_member_id)
      values('S29','S29','2028-08-01','2029-07-31','planning',$1,$1) returning id`, [manager])).rows[0].id;
    const { deal } = await eligibleDeal('Two-season rollover');
    const contribution = (await query<{ id: string }>(`insert into partner_deals.contributions(deal_id,season_id,kind,amount_ore,invoice_date)
      values($1,$2,'cash',250000,'2028-12-01') returning id`, [deal, nextSeason])).rows[0].id;
    await query('select partner_deals.attach_won_funding($1,$2)', [manager, deal]);
    expect((await query<{ result: Run }>("select partner_deals.materialize_invoices_on('2028-07-31') result")).rows[0].result).toMatchObject({ created: 1, failed: 0 });
    expect((await query('select * from partner_deals.task_links where contribution_id=$1', [contribution])).rows).toHaveLength(0);
    const historicalTasks = (await query('select * from project_management.tasks order by id')).rows;
    await expect(query("select partner_deals.materialize_invoices_on('2028-08-02')")).rejects.toThrow('deal_invoice_current_season_unavailable');
    expect((await query<{ setting_value: string }>("select setting_value from finance.settings where setting_key='current_season'")).rows[0].setting_value).toBe('S28');
    await query(`update finance.seasons set status='closed' where code='S28';
      update finance.seasons set status='active' where code='S29';
      update finance.settings set setting_value='"S29"' where setting_key='current_season'`);
    await query('select project_management.provision_current_departments($1)', [manager]);
    await expect(query("select partner_deals.materialize_invoices_on('2028-08-02')")).rejects.toThrow('deal_invoice_finance_lead_missing');
    await query("insert into project_management.department_members(department_id,member_id,access_level) select id,$1,'lead' from project_management.departments where season='S29' and name='Finance'", [finance]);
    expect((await query<{ result: Run }>("select partner_deals.materialize_invoices_on('2028-08-09') result")).rows[0].result).toMatchObject({ created: 1, failed: 0 });
    expect((await query<{ result: Run }>("select partner_deals.materialize_invoices_on('2028-08-10') result")).rows[0].result).toMatchObject({ created: 0, failed: 0 });
    expect((await query("select * from project_management.tasks where season='S28' order by id")).rows).toEqual(historicalTasks);
    const nextInvoice = (await query<{ season: string; deadline: string; description: string }>(`select t.season,t.deadline::text,t.description
      from project_management.tasks t join partner_deals.task_links l on l.task_id=t.id where l.contribution_id=$1 and l.kind='invoice'`, [contribution])).rows;
    expect(nextInvoice).toHaveLength(1);
    expect(nextInvoice[0]).toMatchObject({ season: 'S29', deadline: '2028-12-01' });
    expect(nextInvoice[0].description).toContain('2500.00 NOK');
    expect((await query('select * from partner_deals.funding_links where contribution_id=$1', [contribution])).rows).toHaveLength(1);
  }, 30000);
});
