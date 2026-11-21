/** Historical season data for retained Finance read/request/processing tests.
 * Active creation, approval and editing must use project-budget workflows.
 */
export async function seedHistoricalSeasonBudget(
  query: (sql: string, params?: unknown[]) => Promise<unknown>,
  actor: string,
  approved = true,
) {
  await query(
    `insert into finance.budgets (
    season_id, public_ref, status, approved_by_member_id, approved_on,
    created_by_member_id, updated_by_member_id
  ) select id, 'B-' || code, $2, case when $2='approved' then $1::uuid else null end,
      case when $2='approved' then date '2026-10-01' else null end, $1::uuid, $1::uuid
    from finance.seasons where code='S27'`,
    [actor, approved ? "approved" : "draft"],
  );
  await query(
    `select finance.ensure_unallocated_for_purchase($1::uuid,b.id,s.id)
    from finance.budgets b join finance.seasons season on season.id=b.season_id
    cross join finance.systems s where season.code='S27' and s.active order by s.id`,
    [actor],
  );
}
