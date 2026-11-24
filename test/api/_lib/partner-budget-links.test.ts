import { readFileSync, readdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, beforeEach, afterEach, afterAll, expect, it } from "vitest";
import { createDealServices } from "../../../api/_lib/partner-deals-service.js";
const actor = randomUUID(),
  outsider = randomUUID();
const people = new Map([
  [
    "pipeline",
    {
      userId: actor,
      googleSub: "pipeline",
      name: "Pipeline",
      email: "pipeline@helixnmbu.no",
    },
  ],
  [
    "outsider",
    {
      userId: outsider,
      googleSub: "outsider",
      name: "Outsider",
      email: "outsider@helixnmbu.no",
    },
  ],
]);
let db: PGlite,
  service: ReturnType<typeof createDealServices>,
  season: string,
  header: string,
  entries: string[],
  org: string;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    'create schema neon_auth;create table neon_auth."user"(id uuid primary key,name text,email text,"emailVerified" boolean,banned boolean,image text);create table neon_auth.account(id uuid primary key default gen_random_uuid(),"userId" uuid,"providerId" text,"accountId" text,"createdAt" timestamptz default now());create role anon;create role authenticated;create role anonymous;',
  );
  const directory = new URL("../../../db/migrations/", import.meta.url);
  for (const file of readdirSync(directory)
    .filter((file) => /^\d{3}_[a-z0-9_]+\.sql$/.test(file))
    .sort())
    await db.exec(readFileSync(new URL(file, directory), "utf8"));
  for (const person of people.values()) {
    await db.query(
      'insert into neon_auth."user"(id,name,email,"emailVerified",banned) values($1,\'Member\',$2,true,false)',
      [person.userId, person.email],
    );
    await db.query(
      'insert into neon_auth.account("userId","providerId","accountId") values($1,\'google\',$2)',
      [person.userId, person.googleSub],
    );
    await db.query(
      "insert into identity.members(id,auth_user_id,google_sub,email,full_name) values($1,$1,$2,$3,'Member')",
      [person.userId, person.googleSub, person.email],
    );
  }
  await db.query(
    "insert into partner_deals.space_access values($1,true,true)",
    [actor],
  );
  season = (
    await db.query<{ id: string }>(
      "insert into finance.seasons(code,name,start_date,end_date,status,created_by_member_id,updated_by_member_id) values('S27','S27','2026-08-01','2027-07-31','active',$1,$1) returning id",
      [actor],
    )
  ).rows[0].id;
  await db.query(
    "insert into finance.settings(setting_key,setting_value,description,updated_by_member_id) values('current_season','\"S27\"','Current season',$1) on conflict(setting_key) do update set setting_value=excluded.setting_value",
    [actor],
  );
  const project = randomUUID();
  await db.query(
    "insert into project_management.projects(id,season,name,category,departments,lead_ids) values($1,'S27','Frame','production',array['Mechanical & Production','Electronics'],array[$2::uuid])",
    [project, actor],
  );
  const department = (
    await db.query<{ id: string }>(
      "select id from project_management.departments where season='S27' and name='Mechanical & Production'",
    )
  ).rows[0].id;
  header = (
    await db.query<{ id: string }>(
      "insert into finance.project_budgets(season_id,project_id,responsible_department_id,created_by_member_id,updated_by_member_id) values($1,$2,$3,$4,$4) returning id",
      [season, project, department, actor],
    )
  ).rows[0].id;
  const budget = (
    await db.query<{ id: string }>(
      "insert into finance.budgets(season_id,public_ref,status,approved_by_member_id,approved_on,created_by_member_id,updated_by_member_id) values($1,'B-S27','approved',$2,'2026-11-01',$2,$2) returning id",
      [season, actor],
    )
  ).rows[0].id;
  const system = (
    await db.query<{ id: string }>(
      "insert into finance.systems(department_key,code,name) select department_key,'SYS-TEST','Frame system' from identity.departments where department_key='mechanical-production' returning id",
    )
  ).rows[0].id;
  entries = [];
  for (let index = 0; index < 3; index++) {
    const id = randomUUID();
    entries.push(id);
    await db.query(
      "insert into finance.budget_items(id,budget_id,system_id,public_ref,description,category,planned_ore,priority,reuse_status,status,created_by_member_id,updated_by_member_id) values($1,$2,$3,$4,$5,'material',100000,$6,'new','planned',$7,$7)",
      [
        id,
        budget,
        system,
        `BI-S27-00${index + 1}`,
        `Purchase ${index + 1}`,
        `P${index + 1}`,
        actor,
      ],
    );
    await db.query(
      "insert into finance.project_budget_entries(id,project_budget_id,budget_item_id,created_by_member_id) values($1,$2,$1,$3)",
      [id, header, actor],
    );
  }
  const electronics = (
    await db.query<{ id: string }>(
      "insert into finance.systems(department_key,code,name) select department_key,'SYS-ELEC','Electronics system' from identity.departments where project_management.canonical_department(name)='Electronics' returning id",
    )
  ).rows[0].id;
  await db.query("update finance.budget_items set system_id=$1 where id=$2", [
    electronics,
    entries[2],
  ]);
  org = (
    await db.query<{ id: string }>(
      "insert into partner.organizations(name,active) values('Partner',false) returning id",
    )
  ).rows[0].id;
  const guarded = {
    query: async <T>(sql: string, args?: unknown[]) => {
      await db.exec("savepoint service_query");
      try {
        const result = await db.query<T>(sql, args);
        await db.exec("release savepoint service_query");
        return result;
      } catch (error) {
        await db.exec(
          "rollback to savepoint service_query;release savepoint service_query",
        );
        throw error;
      }
    },
  };
  service = createDealServices({
    db: guarded,
    authenticate: async (token) => people.get(token)!,
  });
}, 60000);
beforeEach(() => db.exec("begin"));
afterEach(() => db.exec("rollback"));
afterAll(() => db.close());
async function deal(kind = "deal") {
  return (
    await service.save("pipeline", {
      opportunityKind: kind,
      organizationId: org,
      title: "Partnership",
      stage: "proposal",
      seasonId: season,
      ownerMemberId: null,
      contactName: "",
      contactEmail: "",
      startsOn: null,
      endsOn: null,
      agreementLink: "",
      negotiationNotes: "",
      contributions: [],
      deliverables: [],
    })
  ).id;
}
async function select(id: string, ids: string[]) {
  const current = await service.budgetLinks("pipeline", id);
  const input = {
    action: "saveDealBudgetLinks",
    requestId: randomUUID(),
    dealId: id,
    dealExpectedRevision: current.dealRevision,
    applicationExpectedRevision: current.applicationRevision,
    entries: current.entries
      .filter((entry) => ids.includes(entry.entryId))
      .map(({ entryId, budgetRevision }) => ({ entryId, budgetRevision })),
  };
  await service.saveBudgetLinks("pipeline", input);
  return input;
}
async function priorities() {
  return (
    await db.query<{ id: string; priority: string; ordinary_priority: string }>(
      "select id,priority,ordinary_priority from finance.effective_budget_entries order by public_ref",
    )
  ).rows;
}
it.each(["deal", "grant"])(
  "turns only selected purchases into P0 when a %s is Won and preserves ordinary priorities",
  async (kind) => {
    const id = await deal(kind);
    expect((await service.budgetLinks("pipeline", id)).entries).toHaveLength(3);
    const input = await select(id, [entries[0], entries[1]]);
    expect((await priorities()).map((entry) => entry.priority)).toEqual([
      "P1",
      "P2",
      "P3",
    ]);
    await service.saveBudgetLinks("pipeline", input);
    expect(
      (await db.query("select id from finance.budget_obligations")).rows,
    ).toHaveLength(2);
    const current = await service.budgetLinks("pipeline", id);
    await service.confirmWon("pipeline", id, current.dealRevision, true);
    await service.confirmWon("pipeline", id, current.dealRevision, true);
    expect((await priorities()).map((entry) => entry.priority)).toEqual([
      "P0",
      "P0",
      "P3",
    ]);
    expect(
      (await priorities()).map((entry) => entry.ordinary_priority),
    ).toEqual(["P1", "P2", "P3"]);
    const won = await service.budgetLinks("pipeline", id);
    expect(won.locked).toBe(true);
    await expect(
      service.saveBudgetLinks("pipeline", {
        ...input,
        requestId: randomUUID(),
        dealExpectedRevision: won.dealRevision,
        applicationExpectedRevision: won.applicationRevision,
        entries: [],
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(
      (
        await db.query(
          "select id from finance.funding_application_events where action='pipelineWon'",
        )
      ).rows,
    ).toHaveLength(1);
  },
);
it("allows deselection before Won with release history, and rejects stale selections atomically", async () => {
  const id = await deal();
  const first = await select(id, [entries[0], entries[1]]);
  await select(id, [entries[1]]);
  expect(
    (
      await db.query(
        "select id from finance.budget_obligations where released_at is not null",
      )
    ).rows,
  ).toHaveLength(1);
  await expect(
    service.saveBudgetLinks("pipeline", { ...first, requestId: randomUUID() }),
  ).rejects.toMatchObject({ status: 409 });
  const current = await service.budgetLinks("pipeline", id);
  await service.confirmWon("pipeline", id, current.dealRevision, true);
  expect((await priorities()).map((entry) => entry.priority)).toEqual([
    "P1",
    "P0",
    "P3",
  ]);
});
it("denies unrelated members and keeps priority unchanged when confirmation fails", async () => {
  const id = await deal();
  await expect(service.budgetLinks("outsider", id)).rejects.toMatchObject({
    status: 403,
  });
  const input = await select(id, [entries[0]]);
  await expect(
    service.saveBudgetLinks("outsider", { ...input, requestId: randomUUID() }),
  ).rejects.toMatchObject({ status: 403 });
  await db.query("update partner_deals.deals set stage='lost' where id=$1", [
    id,
  ]);
  const current = await service.budgetLinks("pipeline", id);
  await expect(
    service.confirmWon("pipeline", id, current.dealRevision, true),
  ).rejects.toMatchObject({ status: 400 });
  expect((await priorities()).map((entry) => entry.priority)).toEqual([
    "P1",
    "P2",
    "P3",
  ]);
});
it("rejects changed budgets and malformed or duplicate choices without writing links", async () => {
  const id = await deal(),
    current = await service.budgetLinks("pipeline", id);
  const input = {
    requestId: randomUUID(),
    dealId: id,
    dealExpectedRevision: current.dealRevision,
    applicationExpectedRevision: 0,
    entries: [
      {
        entryId: entries[0],
        budgetRevision: current.entries[0].budgetRevision,
      },
    ],
  };
  await db.query(
    "update finance.project_budgets set revision=revision+1 where id=$1",
    [header],
  );
  await expect(
    service.saveBudgetLinks("pipeline", input),
  ).rejects.toMatchObject({ status: 409 });
  expect(
    (await db.query("select id from finance.budget_obligations")).rows,
  ).toHaveLength(0);
  await expect(
    service.saveBudgetLinks("pipeline", {
      ...input,
      entries: [input.entries[0], input.entries[0]],
    }),
  ).rejects.toMatchObject({ status: 400 });
});

it("activates a pending budgeted purchase without approving or materializing its money", async () => {
  const version = randomUUID(),
    entry = randomUUID();
  await db.query(
    "insert into finance.project_budget_versions(id,project_budget_id,version_number,status,created_by_member_id) values($1,$2,1,'draft',$3)",
    [version, header, actor],
  );
  await db.query(
    "insert into finance.project_budget_entries(id,project_budget_id,created_by_member_id) values($1,$2,$3)",
    [entry, header, actor],
  );
  const system = (
    await db.query<{ id: string }>("select id from finance.systems limit 1")
  ).rows[0].id;
  await db.query(
    "insert into finance.project_budget_version_entries(version_id,entry_id,system_id,description,category,planned_ore,ordinary_priority,reuse_status,status) values($1,$2,$3,'Pending sensor','component',200000,'P3','new','planned')",
    [version, entry, system],
  );
  await db.query(
    "update finance.project_budget_versions set status='department_pending',submitted_at=now(),submitted_snapshot=finance.project_budget_snapshot(id) where id=$1",
    [version],
  );
  await db.query(
    "update finance.project_budgets set pending_version_id=$1,revision=revision+1 where id=$2",
    [version, header],
  );
  const id = await deal("grant");
  const before = await service.budgetLinks("pipeline", id);
  expect(before.entries.find((item) => item.entryId === entry)).toMatchObject({
    approved: false,
    priority: "P3",
  });
  await select(id, [entry]);
  const current = await service.budgetLinks("pipeline", id);
  await service.confirmWon("pipeline", id, current.dealRevision, true);
  expect(
    (await service.budgetLinks("pipeline", id)).entries.find(
      (item) => item.entryId === entry,
    ),
  ).toMatchObject({ approved: false, priority: "P0", ordinaryPriority: "P3" });
  expect(
    (await db.query("select id from finance.budget_items where id=$1", [entry]))
      .rows,
  ).toHaveLength(0);
  expect(
    (
      await db.query<{ approved_version_id: string | null }>(
        "select approved_version_id from finance.project_budgets where id=$1",
        [header],
      )
    ).rows[0].approved_version_id,
  ).toBeNull();
});
it("rechecks revoked pipeline access before changing links", async () => {
  const id = await deal(),
    current = await service.budgetLinks("pipeline", id);
  await db.query(
    "update partner_deals.space_access set pipeline=false where member_id=$1",
    [actor],
  );
  await expect(
    service.saveBudgetLinks("pipeline", {
      requestId: randomUUID(),
      dealId: id,
      dealExpectedRevision: current.dealRevision,
      applicationExpectedRevision: 0,
      entries: [
        {
          entryId: entries[0],
          budgetRevision: current.entries[0].budgetRevision,
        },
      ],
    }),
  ).rejects.toMatchObject({ status: 403 });
  expect(
    (await db.query("select id from finance.budget_obligations")).rows,
  ).toHaveLength(0);
});

it("projects each entry's department across projects and retains it for unavailable selected entries", async () => {
  const id = await deal();
  const current = await service.budgetLinks("pipeline", id);
  expect(
    current.entries.find((entry) => entry.entryId === entries[0])
      ?.departmentName,
  ).toBe("Mechanical & Production");
  expect(
    current.entries.find((entry) => entry.entryId === entries[2])
      ?.departmentName,
  ).toBe("Electronics");
  await select(id, [entries[2]]);
  await db.query(
    "update finance.budget_items set status='cancelled' where id=$1",
    [entries[2]],
  );
  expect(
    (await service.budgetLinks("pipeline", id)).entries.find(
      (entry) => entry.entryId === entries[2],
    ),
  ).toMatchObject({
    selected: true,
    unavailable: true,
    departmentName: "Electronics",
  });
});
