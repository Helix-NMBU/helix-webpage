/** Only established internal task/project routes are safe sign-in destinations. */
export function isProjectTaskPath(path: string): boolean {
  return /^\/(?:tasks|project-management(?:\/(?:overview|production|partnership-deliverables|marketing|operations))?)$/.test(path.split(/[?#]/)[0]);
}

/** Workspace slugs are generated from the fixed department catalog. */
export function isWorkspacePath(path: string): boolean {
  return /^\/(?:members|projects(?:\/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})?|departments(?:\/(?:management|mechanical-and-production|electronics|software-and-autonomous|business-and-marketing|logistics|finance))?)$/.test(path.split(/[?#]/)[0]);
}
