export interface ReportTemplateSection {
  id: string;
  title: string;
  instruction: string;
  allowEmpty: boolean;
}

export interface ReportTemplate {
  id: string;
  name: string;
  description: string | null;
  basePrompt: string;
  sections: ReportTemplateSection[];
  constraints: string;
  isBuiltin: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface ReportTemplateInput {
  name: string;
  description?: string | null;
  basePrompt: string;
  sections: ReportTemplateSection[];
  constraints?: string;
}

export type ReportTemplatePatch = Partial<ReportTemplateInput>;

export interface ReportCandidate {
  id: string;
  title: string;
  description: string | null;
  status: 'todo' | 'doing' | 'done';
  priority: 'low' | 'medium' | 'high';
  dueAt: number | null;
  createdAt: number;
  updatedAt: number;
  completedAt: number | null;
  tags: string[];
  noteId: string | null;
  noteTitle: string | null;
}

export interface ReportNoteSnapshot {
  id: string;
  title: string;
  plainText: string;
}

export interface ReportTaskSnapshot extends ReportCandidate {
  note?: ReportNoteSnapshot;
}

export interface ReportTemplateSnapshot {
  name: string;
  description: string | null;
  basePrompt: string;
  sections: ReportTemplateSection[];
  constraints: string;
}

export interface ReportGenerationMeta {
  model: string;
  baseUrl: string;
  generatedAt: number;
  durationMs: number;
  promptChars: number;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

export interface Report {
  id: string;
  title: string;
  periodStart: number;
  periodEnd: number;
  templateId: string | null;
  template: ReportTemplateSnapshot;
  tasks: ReportTaskSnapshot[];
  notes: ReportNoteSnapshot[];
  contentMarkdown: string;
  generationMeta: ReportGenerationMeta;
  createdAt: number;
  updatedAt: number;
}

export type ReportSummary = Omit<Report, 'template' | 'tasks' | 'notes' | 'contentMarkdown' | 'generationMeta'> & {
  templateName: string;
  taskCount: number;
  noteCount: number;
};

export interface ReportGenerateInput {
  periodStart: number;
  periodEnd: number;
  templateId: string;
  taskIds: string[];
  includeNotes: boolean;
  aiConfigRevision: string;
}

export interface ReportUpdateInput {
  title?: string;
  contentMarkdown?: string;
}

export interface AiServiceConfig {
  baseUrl: string;
  model: string;
  hasApiKey: boolean;
  timeoutMs: number;
  revision: string;
}

export interface AiServiceConfigPatch {
  baseUrl?: string;
  model?: string;
  apiKey?: string;
  clearApiKey?: boolean;
  timeoutMs?: number;
}
