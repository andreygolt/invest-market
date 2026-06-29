import type { ProjectChecklist, ProjectDashboardData } from '@/types';

export function buildChecklist(
  project: ProjectDashboardData,
  docsCount: number
): ProjectChecklist {
  return {
    questionnaire14: project.questionnaire_s1 !== null,
    questionnaire58: project.questionnaire_s5 !== null,
    hasDocuments: docsCount > 0,
    hasVideo: project.video_path !== null,
    submitted: project.status !== 'draft',
  };
}
