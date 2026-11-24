import { isLocalMemberMode, localMemberSignedIn } from "../MemberPlatform/local-mode";
import type { RecruitmentPosition } from "./positions";
import type { ApplicationRow } from "./website-api";

const KEY = "helix-recruiting-local-v1";
type State = { positions: RecruitmentPosition[]; applications: ApplicationRow[] };
function guard() {
  if (!isLocalMemberMode() || !localMemberSignedIn()) throw new Error("Recruitment fixtures require signed-in member-local mode on loopback.");
}
export function readLocalRecruitment(): State {
  guard();
  return JSON.parse(localStorage.getItem(KEY) ?? '{"positions":[],"applications":[]}') as State;
}
export function writeLocalRecruitment(state: State) {
  guard();
  localStorage.setItem(KEY, JSON.stringify(state));
}
export function prepareLocalRecruitmentFixtures() {
  const state = readLocalRecruitment();
  const specifications = [
    ["Mechanical design engineer", "Mechanical & Production"],
    ["Embedded electronics engineer", "Electronics"],
    ["Autonomous systems developer", "Software & Autonomous"],
    ["Partnership coordinator", "Business & Marketing"],
    ["Competition logistics coordinator", "Logistics"],
    ["Finance coordinator", "Finance"],
    ["Team operations coordinator", "Management"],
    ["Battery validation engineer", "Electronics"],
  ];
  specifications.forEach(([title, department], index) => {
    const id = `local-position-${index + 1}`;
    if (state.positions.some(position => position.id === id)) return;
    state.positions.push({ id, title, department, applyUrl: "", visible: index !== 7,
      contact: { name: "Alex Example", email: "alex@example.invalid" },
      about: `Join the ${department} team and help deliver the S27 vehicle programme.`,
      tasks: ["Plan and deliver an assigned work package", "Collaborate on design reviews and testing", "Document the handover to the next season"],
      achieve: ["Practical project experience", "A completed vehicle integration milestone"],
    });
  });
  const names = ["Avery Example", "Robin Example", "Morgan Example", "Casey Example", "Jamie Example", "Taylor Example", "Jordan Example", "Quinn Example", "Charlie Example", "Riley Example", "Cameron Example", "Drew Example", "Lee Example", "Skyler Example", "Harper Example", "Rowan Example", "Alexandra Example", "Noah Example"];
  names.forEach((name, index) => {
    const id = `local-application-${index + 1}`;
    if (state.applications.some(application => application.id === id)) return;
    const position = state.positions.find(item => item.id === `local-position-${index % 7 + 1}`);
    if (!position) return;
    state.applications.push({id, created_at: `2026-11-${String(24 - index).padStart(2, "0")}T10:00:00Z`, season: index < 15 ? "S27" : "S26", full_name: name, email: `applicant${index + 1}@example.invalid`, phone: `+47 0000 ${String(index + 1).padStart(4, "0")}`, study_program: ["Mechanical engineering", "Robotics", "Economics", "Data science"][index % 4], study_program_other: null, year_of_study: index % 5 + 1, motivation: `I would like to contribute to ${position.title.toLowerCase()}.\n\nI have experience from student projects and enjoy collaborating across departments. I can contribute six hours a week and would like to help with planning, implementation and validation.`, position_id: position.id, position_title: position.title, interested_departments: [position.department, "Management"], cv_path: `local/${id}/cv.pdf`, photo_path: index % 3 === 0 ? `local/${id}/photo.svg` : null, consent: true});
  });
  writeLocalRecruitment(state);
}
export async function localRecruitmentFile(id: string, kind: "cv" | "photo") {
  const application = readLocalRecruitment().applications.find(item => item.id === id);
  if (!application || (kind === "photo" && !application.photo_path)) throw new Error("File not found.");
  let blob: Blob;
  if (kind === "cv") {
    const lines = [application.full_name, application.email, application.study_program, `Study year ${application.year_of_study}`, "", "Experience", "Student engineering project: design, implementation and validation.", "Skills: teamwork, documentation and technical problem solving."];
    const escape = (text: string) => text.replace(/[^\x20-\x7e]/g, "?").replace(/[\\()]/g, "\\$&");
    const stream = `BT /F1 14 Tf 50 780 Td 26 TL ${lines.map((line,index) => `${index ? "T* " : ""}(${escape(line)}) Tj`).join("\n")} ET`;
    const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>", "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>", `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];
    let pdf = "%PDF-1.4\n";
    const offsets: number[] = [];
    objects.forEach((object,index) => {offsets.push(pdf.length); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;});
    const xref = pdf.length;
    pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.map(offset=>`${String(offset).padStart(10,"0")} 00000 n \n`).join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
    blob = new Blob([pdf], {type: "application/pdf"});
  } else {
    blob = new Blob([`<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240"><rect width="240" height="240" fill="#243f91"/><text x="120" y="140" text-anchor="middle" font-family="sans-serif" font-size="64" fill="white">${application.full_name.split(" ").map(part => part[0]).join("")}</text></svg>`], {type: "image/svg+xml"});
  }
  const url = URL.createObjectURL(blob);
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return {url, expiresIn: 60};
}
