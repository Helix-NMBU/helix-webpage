import { isLocalPlatformTester } from "./local-platform-profile";
import { isLocalMemberMode, localMemberSignedIn } from "./local-mode";
import { prepareLocalSeasonScenario, prepareLocalPipelineForecastScenario } from "../Finance/local-season-scenario";
import { createLocalProjectRepository } from "../ProjectManagement/local-repository";
import { addDays, osloDate } from "../ProjectManagement/model";
import { progressEvent } from "../ProjectManagement/progress";
import type { Task, TaskStatus } from "../ProjectManagement/types";
import { addLocalWonEffects, localSeasons, readLocalPartnerState, writeLocalPartnerState } from "../PartnerDeals/local-fixture";
import { withTierDeliverables } from "../PartnerDeals/sponsor-tier-terms";
import { stages, type Deal, type DealInput } from "../PartnerDeals/types";
import { prepareLocalRecruitmentFixtures } from "../Recruitment/local-fixture";

export const PLATFORM_SCENARIO_KEY = "helix-platform-testing-scenario-v1";
export const PLATFORM_MAIL_KEY = "helix-platform-testing-mail-v1";
const PROJECTS = "helix-member-local-projects-v1";
const id = (group: number, index: number) => `face${String(group).padStart(4, "0")}-0000-4000-8000-${String(index).padStart(12, "0")}`;
let pending: Promise<void> | null = null;
function guard() {
  if (!isLocalMemberMode() || !localMemberSignedIn() || !isLocalPlatformTester()) throw new Error("Platform fixtures require the signed-in platform_tester profile in member-local mode on loopback.");
}
export function prepareLocalPlatformScenario(): Promise<void> {
  guard();
  if (localStorage.getItem(PLATFORM_SCENARIO_KEY)) return Promise.resolve();
  pending ??= seed().finally(() => { pending = null; });
  return pending;
}
async function seed() {
  guard();
  // The established finance scenario is additive and maintains its own rollback backup.
  await prepareLocalSeasonScenario();
  await prepareLocalPipelineForecastScenario();
  guard();
  const keys = [PROJECTS, "helix-member-local-directory-v1", "helix-member-local-partner-deals-v1", "helix-recruiting-local-v1", PLATFORM_MAIL_KEY];
  const backup = Object.fromEntries(keys.map(key => [key, localStorage.getItem(key)]));
  localStorage.setItem("helix-platform-testing-backup-v1", JSON.stringify({createdAt: new Date().toISOString(), values: backup}));
  try {
    const projects = createLocalProjectRepository();
    const workspace = await projects.load();
    const directory = JSON.parse(localStorage.getItem("helix-member-local-directory-v1") ?? "{}");
    const firstNames = ["Morgan", "Jordan", "Avery", "Riley", "Taylor", "Casey", "Robin", "Quinn", "Jamie", "Drew", "Charlie", "Cameron", "Harper", "Rowan"];
    const today = osloDate(), now = new Date().toISOString();
    for (const [index, department] of workspace.departments.entries()) {
      const memberIds: string[] = [];
      for (let offset = 0; offset < 2; offset++) {
        const ordinal = index * 2 + offset, memberId = id(1, ordinal + 1), name = `${firstNames[ordinal]} Example`;
        if (!workspace.members.some(member => member.id === memberId)) workspace.members.push({id: memberId, name, avatarUrl: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" rx="32" fill="${["#243f91", "#087f8c", "#815ac0", "#b45309"][ordinal % 4]}"/><text x="32" y="42" text-anchor="middle" fill="white" font-family="sans-serif" font-size="24">${name[0]}E</text></svg>`)}`});
        directory[memberId] ??= {helixRole: offset ? `${department.name} team member` : `${department.name} lead`, joinedAt: "2026-08-15T10:00:00Z", lastSeenAt: now, role: "Member", revision: 1};
        memberIds.push(memberId);
      }
      department.memberIds = [...new Set([...department.memberIds, workspace.viewerId, ...memberIds])];
      department.leadIds = [...new Set([...(department.leadIds ?? (department.leadId ? [department.leadId] : [])), workspace.viewerId, memberIds[0]])];
      department.leadId ??= memberIds[0];
      department.revision++;
      const project = workspace.projects.find(item => item.departments.includes(department.name));
      if (!project) continue;
      const statuses: TaskStatus[] = ["backlog", "todo", "in_progress", "blocked", "done"];
      statuses.forEach((status, offset) => {
        const taskId = id(2, index * 5 + offset + 1);
        if (workspace.tasks.some(task => task.id === taskId)) return;
        const task: Task = {id: taskId, season: workspace.season, title: ["Review next-season requirements", "Prepare supplier comparison", "Validate integration checklist", "Resolve delivery dependency", "Record design review decisions"][offset], description: `Coordinate the ${department.name.toLowerCase()} work package with the ${project.name} project. Record decisions and supporting documentation.`, category: project.category, projectId: project.id, milestoneId: null, assigneeIds: offset === 0 ? [] : [offset === 1 ? workspace.viewerId : memberIds[offset % 2]], deadline: addDays(today, offset === 3 ? -4 : offset * 4 + 2), startDate: addDays(today, -10), status, priority: offset === 3 ? "urgent" : offset === 2 ? "high" : "normal", kind: "task", partnerName: "", blockedReason: status === "blocked" ? "Waiting for the supplier to confirm the revised delivery date." : "", revision: 1, createdAt: `${addDays(today, -10)}T10:00:00Z`, updatedAt: now, completedAt: status === "done" ? `${addDays(today, -1)}T15:00:00Z` : null};
        workspace.tasks.push(task);
        workspace.progressEvents.push(progressEvent({...task, status: "todo"}, task.createdAt));
        if (status !== "todo") workspace.progressEvents.push(progressEvent(task, now));
      });
    }
    localStorage.setItem(PROJECTS, JSON.stringify(workspace));
    localStorage.setItem("helix-member-local-directory-v1", JSON.stringify(directory));
    const pipeline = readLocalPartnerState();
    for (const [kindIndex, kind] of (["deal", "grant"] as const).entries()) {
      for (const [stageIndex, stage] of stages.entries()) {
        const ordinal = kindIndex * 6 + stageIndex + 1, dealId = id(3, ordinal), organizationId = id(4, ordinal);
        if (pipeline.deals.some(item => item.id === dealId)) continue;
        const organizationName = (kind === "grant" ? ["Campus innovation fund", "Regional mobility fund", "Green technology programme", "Engineering education fund", "Student equipment fund", "Research outreach fund"] : ["Summit engineering", "Cedar composites", "Harbor electronics", "Meridian manufacturing", "Atlas mobility", "Pine workshop"])[stageIndex];
        if (!pipeline.organizations.some(item => item.id === organizationId)) pipeline.organizations.push({id: organizationId, name: organizationName, revision: 0});
        const owner = workspace.members[(ordinal % (workspace.members.length - 1)) + 1];
        const input: DealInput = {id: dealId, organizationId, opportunityKind: kind, title: `${organizationName} ${kind === "grant" ? "S27 application" : "S27 partnership"}`, stage: stage === "won" ? "proposal" : stage, ownerMemberId: owner.id, seasonId: "s27", sponsorLevel: kind === "grant" ? null : ["bronze", "silver", "gold", "platinum", "main", "service"][stageIndex], probability: [25, 25, 75, 100, 100, 25][stageIndex], followUpOn: addDays(today, stageIndex - 2), contactName: `${firstNames[ordinal]} Example`, contactEmail: `contact${ordinal}@example.invalid`, startsOn: "2026-08-01", endsOn: "2027-07-31", agreementLink: "", negotiationNotes: kind === "grant" ? "" : "Confirm the scope, delivery dates and agreement with the contact before handover.", partnerNotes: kind === "grant" ? "" : "- Cash sponsorship\n- Workshop access for component validation\n- Technical feedback at the integration review", contributions: [{id: id(5, ordinal), seasonId: "s27", kind: "cash", amountOre: String((25000 + stageIndex * 35000 + kindIndex * 15000) * 100), description: kind === "grant" ? "S27 project support" : "Season sponsorship", invoiceDate: kind === "grant" ? null : addDays(today, 14 + stageIndex * 7)}], deliverables: []};
        if (kind === "deal" && stageIndex === 1) input.contributions.push({id: id(6, ordinal),seasonId: "s27",kind: "product",description: "Composite materials and technical support",amountOre: "3500000",invoiceDate: null});
        const deal: Deal = {...withTierDeliverables(input, {canManage:true, deals:pipeline.deals, organizations:pipeline.organizations, seasons:localSeasons}),id:dealId,organizationName,revision:0,stage};
        pipeline.deals.push(deal);
        if (stage === "won") addLocalWonEffects(pipeline, deal);
      }
    }
    writeLocalPartnerState(pipeline);
    prepareLocalRecruitmentFixtures();
    if (!localStorage.getItem(PLATFORM_MAIL_KEY)) {
      const subjects = ["S27 integration review agenda", "Chassis quote and lead time", "Electronics validation results", "Student innovation grant follow-up", "Competition freight estimate", "Recruitment interview schedule", "Partner logo files", "Budget review questions", "Workshop booking confirmed", "Telemetry data review", "Department planning notes", "Updated purchase documentation"];
      localStorage.setItem(PLATFORM_MAIL_KEY, JSON.stringify(subjects.map((subject,index)=>({id:`platform-mail-${index+1}`,threadId:`platform-mail-${index+1}`,from:`${firstNames[index]} Example <team${index+1}@example.invalid>`,replyTo:`team${index+1}@example.invalid`,subject,date:`${addDays(today,-index)}T10:00:00Z`,snippet:`Please review the ${subject.toLowerCase()} before our next meeting.`,body:`Hi Alex,\n\nPlease review the ${subject.toLowerCase()} before our next meeting.\n\nThe project team has recorded the current status and next steps. Let us know which items need follow-up.\n\n${firstNames[index]}`,htmlBody:`<p>Hi Alex,</p><p>Please review the <strong>${subject.toLowerCase()}</strong> before our next meeting.</p><ul><li>Review the current scope</li><li>Confirm the owner and due date</li><li>Record decisions in the project</li></ul><p>${firstNames[index]}</p>`,unread:index<5,starred:index%4===0,folder:index===9?"sent":index===10?"archive":index===11?"trash":"inbox"}))));
    }
    localStorage.setItem(PLATFORM_SCENARIO_KEY, JSON.stringify({createdAt: now, members: workspace.members.length, projects: workspace.projects.length, tasks: workspace.tasks.length, pipelineCards: pipeline.deals.length}));
    window.dispatchEvent(new Event("helix-workspace-updated"));
  } catch (error) {
    localStorage.removeItem(PLATFORM_SCENARIO_KEY);
    for (const [key,value] of Object.entries(backup)) { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key,value); }
    throw error;
  }
}
