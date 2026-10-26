/** Only established internal task/project routes are safe sign-in destinations. */
export function isProjectTaskPath(path: string): boolean {
  return /^\/(?:tasks|project-management(?:\/(?:overview|production|partnership-deliverables|marketing|operations))?)$/.test(path.split(/[?#]/)[0]);
}
