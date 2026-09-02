import type { ProjectRepository } from "../../domain/projects/repository";
import type { ProductProject } from "../../domain/projects/types";
import type {
  ProductionRun,
  ProjectWorkspaceDocument,
  ProjectWorkspaceRepository,
} from "../../domain/workspace/project-workspace";
import type { WorkbenchState } from "./types";

export async function locateRun(
  runId: string,
  readState: () => WorkbenchState,
  projectRepository: ProjectRepository,
  workspaceRepository: ProjectWorkspaceRepository,
): Promise<{
  project: ProductProject;
  workspace: ProjectWorkspaceDocument;
  run: ProductionRun;
} | null> {
  const active = readState().activeProject;
  const storedProjects = await projectRepository.list();
  const projects = active
    ? [active, ...storedProjects.filter((project) => project.id !== active.id)]
    : storedProjects;
  for (const project of projects) {
    const workspace = await workspaceRepository.load(project.id);
    const run = workspace.runs.find((candidate) => candidate.id === runId);
    if (run && (!project.platformId || project.platformId === run.platformId)) {
      return { project, workspace, run };
    }
  }
  return null;
}
