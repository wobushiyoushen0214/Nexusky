import type { WorkflowSampleVaultId } from '../workflow-samples'
export type { WorkflowSampleVaultId } from '../workflow-samples'

export interface FileEntry {
  name: string
  path: string
  isDirectory: boolean
  children?: FileEntry[]
  mtime?: number
}

export interface TrashEntry {
  fileName: string
  originalName: string
  originalPath?: string
  path: string
  deletedAt?: number
  reason?: string
}

export interface NoteSearchResult {
  id: string
  title: string
  filePath: string
  aliasMatch?: string
}

export type PropertyValue = string | number | boolean | (string | number | boolean)[] | null

export interface PropertyTableRow {
  id: string
  title: string
  filePath: string
  createdAt: number
  updatedAt: number
  properties: Record<string, PropertyValue>
}

export type PublishScope =
  | { type: 'all' }
  | { type: 'folder'; folderPath: string }
  | { type: 'tag'; tag: string }
  | { type: 'property'; key: string; value?: string }

export type PublishAccessMode = 'public' | 'private'

export interface PublishTarget {
  outputPath: string
  files: number
  scopeLabel: string
  access: PublishAccessMode
  publishedAt: number
}

export interface PublishPreviewNote {
  title: string
  relPath: string
  href: string
  linkCount: number
  missingLinkCount: number
}

export interface PublishPreviewLinkIssue {
  sourceTitle: string
  sourcePath: string
  target: string
  label?: string
  line: number
  context: string
  kind: 'wikilink' | 'markdown'
}

export interface PublishPreviewAssetIssue {
  sourceTitle: string
  sourcePath: string
  target: string
  line: number
  context: string
}

export interface PublishPreviewResult {
  scopeLabel: string
  notes: PublishPreviewNote[]
  assets: string[]
  linkCount: number
  missingLinks: PublishPreviewLinkIssue[]
  missingAssets: PublishPreviewAssetIssue[]
}

export interface PublishResult {
  ok: boolean
  outputPath?: string
  files: number
  scopeLabel?: string
  access?: PublishAccessMode
  updatedFiles?: number
  skippedFiles?: number
  removedFiles?: number
}

export interface PublishUnpublishResult {
  ok: boolean
  outputPath?: string
  removedFiles: number
}

export interface WorkflowSampleVaultCreateResult {
  vaultPath: string
  files: number
  indexed: number
}

export interface PluginCommand {
  id: string
  title: string
  description?: string
  prompt: string
  mode?: 'chat' | 'edit'
}

export interface PluginPanel {
  id: string
  title: string
  description?: string
  content?: string
}

export interface PluginEditorExtension {
  id: string
  title: string
  description?: string
  kind: 'markdown' | 'toolbar' | 'slash'
}

export interface LocalPlugin {
  id: string
  name: string
  version?: string
  commands: PluginCommand[]
  panels: PluginPanel[]
  editorExtensions: PluginEditorExtension[]
}

export type PluginLocalPackSource = 'bundled_local'
export type PluginLocalPackPermission = 'ai_prompt' | 'read_only_panel' | 'editor_extension_declaration'
export type PluginLocalPackRiskLevel = 'low' | 'medium'

export interface PluginLocalPackItem extends LocalPlugin {
  author: string
  tags: string[]
  source: PluginLocalPackSource
  permissions: PluginLocalPackPermission[]
  riskLevel: PluginLocalPackRiskLevel
  installNote: string
  installed: boolean
}

export type PluginMarketplaceSource = PluginLocalPackSource
export type PluginMarketplacePermission = PluginLocalPackPermission
export type PluginMarketplaceRiskLevel = PluginLocalPackRiskLevel
export type PluginMarketplaceItem = PluginLocalPackItem

export interface CssSnippet {
  name: string
  path: string
  content: string
}

export interface ThemePackage {
  id: string
  name: string
  path: string
  version?: string
  author?: string
  description?: string
  colors: Record<string, string>
}

export interface NoteTemplate {
  id: string
  name: string
  content: string
  description?: string
  category?: string
}

export interface TemplateLocalPackItem extends NoteTemplate {
  author: string
  tags: string[]
  installed: boolean
}

export type TemplateMarketplaceItem = TemplateLocalPackItem

export interface BacklinkResult {
  sourceTitle: string
  sourcePath: string
  line: number
  context: string
}

export interface OutgoingLinkResult {
  targetTitle: string
  targetPath?: string
  line: number
  context: string
  resolved: boolean
}

export interface UnlinkedMentionResult {
  sourceTitle: string
  sourcePath: string
  line: number
  context: string
  mention: string
}

export type GraphMode = 'semantic' | 'connection' | 'folder' | 'group' | 'folder-scope'

export type GraphEdgeLinkType = 'explicit' | 'inferred' | 'folder'

export interface GraphNode {
  id: string
  title: string
  filePath?: string
  type: 'file' | 'folder'
  folder?: string
  noteCount?: number
  directNoteCount?: number
  childFolderCount?: number
}

export interface GraphEdge {
  source: string
  target: string
  linkType: GraphEdgeLinkType
  weight?: number
}

export interface GraphData {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

export interface KanbanColumn {
  id: string
  name: string
  sortOrder: number
}

export interface KanbanTask {
  id: string
  columnId: string
  title: string
  description: string
  sortOrder: number
  priority: number
  dueDate: string | null
  sourceNoteId?: string | null
  sourceFilePath?: string | null
  sourceTitle?: string | null
  createdAt: number
  updatedAt: number
}

export interface KanbanRelation {
  id: string
  sourceTaskId: string
  targetTaskId: string
  relationType: 'blocks' | 'depends_on' | 'related'
}

export interface KanbanAiPlan {
  tasks: { title: string; description?: string; priority?: number; dueDate?: string | null; sourceNoteId?: string | null; sourceFilePath?: string | null }[]
  relations: { sourceIndex: number; targetIndex: number; relationType: KanbanRelation['relationType'] }[]
}

export interface SearchIndexStatus {
  state: 'idle' | 'indexing' | 'done' | 'error'
  current: number
  total: number
  indexed: number
  message?: string
  updatedAt: number
}

export type ChatRole = 'system' | 'user' | 'assistant' | 'tool'

export interface ChatContentPart {
  type: 'text' | 'image_url'
  text?: string
  image_url?: { url: string }
}

export interface IPCChatMessage {
  role: ChatRole
  content: string | ChatContentPart[]
}

export type ChatSourceOrigin = 'local_search' | 'context_pack' | 'vault_tool'
export type ChatSourceMemoryTier = 'hot' | 'warm' | 'cold'

export interface ChatSource {
  title: string
  filePath: string
  chunk: string
  score: number
  line?: number
  endLine?: number
  heading?: string
  blockId?: string
  origins?: ChatSourceOrigin[]
  explanation?: string
  evidence?: string[]
  relationType?: LongContextRelationType
  memoryTier?: ChatSourceMemoryTier
}

export type AIOutboundPreviewMode = 'chat' | 'agent'

export type AIOutboundPreviewSnippetKind = 'prompt' | 'client_context' | 'attachment' | 'retrieved_note' | 'long_context'

export interface AIOutboundPreviewSnippet {
  kind: AIOutboundPreviewSnippetKind
  title: string
  preview: string
  filePath?: string
  score?: number
  chars?: number
}

export interface AIOutboundPreview {
  mode: AIOutboundPreviewMode
  provider: {
    id: string
    name: string
    type: AIProviderConfig['type']
    model: string
    localOnly: boolean
  } | null
  messageCount: number
  systemMessageCount: number
  userMessageCount: number
  imageCount: number
  estimatedTokens: number
  cost: AIOutboundPreviewCost
  currentFilePath?: string | null
  promptPreview: string
  clientContextSnippets: AIOutboundPreviewSnippet[]
  attachmentSnippets: AIOutboundPreviewSnippet[]
  retrievedNoteSnippets: AIOutboundPreviewSnippet[]
  longContext: {
    hot: number
    warm: number
    cold: number
    dropped: number
    sources: number
    estimatedTokens: number
    snippets: AIOutboundPreviewSnippet[]
  }
  toolAccess?: {
    toolCount: number
    toolNames: string[]
  }
  warnings: string[]
}

export type AICostBudgetStatus = 'none' | 'ok' | 'near' | 'over' | 'unknown'

export interface AICostBudget {
  monthlyUsd?: number
  warnAtPercent: number
}

export interface AIOutboundPreviewCost {
  estimatedInputTokens: number
  estimatedOutputTokens: number
  estimatedCostUsd: number | null
  inputCostPer1MTokens?: number
  outputCostPer1MTokens?: number
  monthlyBudgetUsd?: number
  monthlyCostUsd: number
  projectedMonthlyCostUsd: number | null
  budgetUsagePercent: number | null
  budgetStatus: AICostBudgetStatus
  unknownCostRecords: number
}

export type ChatHistoryRole = 'user' | 'assistant'

export interface ChatHistoryEntry {
  id: string
  role: ChatHistoryRole
  content: string
  sources?: ChatSource[]
}

export interface AIStreamEvent {
  type: 'text' | 'done' | 'error' | 'retry' | 'tool_call'
  content: string
}

export interface AINotesProgress {
  stage: 'planning' | 'planned' | 'generating' | 'indexing' | 'index-error' | 'done' | string
  message: string
  requestId?: number
  plan?: { title: string; brief?: string }[]
  current?: number
  total?: number
  created?: number
  failed?: number
  failedItems?: GeneratedNoteFailure[]
}

export interface GeneratedNoteFailure {
  title: string
  stage: 'generate' | 'write'
  error: string
}

export interface GeneratedFlashcard {
  type: 'basic' | 'cloze'
  front: string
  back: string
  tags: string[]
}

export interface GeneratedNoteBatchPlanItem {
  dir: string
  topic: string
  count: number
}

export type FlashcardReviewRating = 'again' | 'hard' | 'good' | 'easy'

export interface FlashcardQueueItem extends GeneratedFlashcard {
  title: string
  filePath: string
  startLine: number
  endLine: number
  sourceTitle?: string
  status: string
  interval: number
  ease: number
  due: string
}

export interface AIProviderConfig {
  id: string
  name: string
  type: 'openai' | 'openai-responses' | 'claude' | 'custom' | 'ollama' | 'codex'
  baseUrl: string
  apiKey: string
  model: string
  enabled: boolean
  authMode?: 'api-key' | 'auth-token'
  inputCostPer1MTokens?: number
  outputCostPer1MTokens?: number
  hasApiKey?: boolean
  capabilities?: AIProviderCapabilities
}

export interface TestResult {
  ok: boolean
  text: string
  latencyMs?: number
  model?: string
}

export interface AIProviderCapabilities {
  streaming: boolean
  toolCalling: boolean
}

export interface AIProviderValidationResult {
  ok: boolean
  error?: string
}

export interface SettingsSyncStatus {
  configured: boolean
  provider?: 'supabase' | 'webdav' | 's3'
  lastSync?: number
  status?: 'idle' | 'syncing' | 'error'
  error?: string
}

export interface SettingsSyncConfig {
  provider: 'supabase' | 'webdav' | 's3'
  config: Record<string, string>
}

export interface SettingsPlugin {
  id: string
  name: string
  version: string
  enabled: boolean
  description?: string
  author?: string
}

export interface ProactiveConfig {
  enabled: boolean
  frequency: 'low' | 'medium' | 'high'
  categories: string[]
}

export interface FetchModelsParams {
  type: 'openai' | 'openai-responses' | 'claude' | 'custom' | 'ollama' | 'codex'
  baseUrl: string
  apiKey: string
  authMode?: AIProviderConfig['authMode']
  providerId?: string
}

export interface FetchModelsResult {
  ok: boolean
  models: string[]
  error?: string
}

export type AIUsageSource = 'chat' | 'agent' | 'completion' | 'edit' | 'utility'
export type AIUsageStatus = 'completed' | 'error' | 'aborted'

export interface AIUsageRecord {
  id: string
  providerId: string
  providerName: string
  providerType: AIProviderConfig['type']
  model: string
  source: AIUsageSource
  status: AIUsageStatus
  startedAt: number
  completedAt: number
  inputTokens: number
  outputTokens: number
  totalTokens: number
  inputCostPer1MTokens?: number
  outputCostPer1MTokens?: number
  estimatedCostUsd: number | null
  finishReason?: string
}

export interface AIUsageProviderSummary {
  providerId: string
  providerName: string
  providerType: AIProviderConfig['type']
  model: string
  records: number
  inputTokens: number
  outputTokens: number
  totalTokens: number
  estimatedCostUsd: number
  unknownCostRecords: number
}

export interface AIUsageSummary {
  since?: number
  until?: number
  records: number
  inputTokens: number
  outputTokens: number
  totalTokens: number
  estimatedCostUsd: number
  unknownCostRecords: number
  byProvider: AIUsageProviderSummary[]
}

export interface ExtractedDocumentText {
  name: string
  path: string
  text: string
  truncated: boolean
  method: 'text' | 'docx' | 'xlsx' | 'pdf' | 'binary'
}

export type LongContextEntityType = 'note' | 'task' | 'chat'

export type LongContextRelationType =
  | 'related_to'
  | 'caused_by'
  | 'evolved_from'
  | 'blocked_by'
  | 'inspired_by'
  | 'repeated_pattern'
  | 'supports_goal'
  | 'conflicts_with'

export type LongContextFeedbackType = 'useful' | 'not_related' | 'wrong_reason' | 'dismissed' | 'snoozed'

export interface LongContextSuggestion {
  relationId: string
  targetType: LongContextEntityType
  targetId: string
  targetTitle: string
  targetPath?: string
  relationType: LongContextRelationType
  confidence: number
  score: number
  reason: string
  evidence: string[]
  lastSeenAt: number
}

export interface LongTermTheme {
  id: string
  title: string
  summary: string
  keywords: string[]
  strength: number
  evidenceCount: number
  firstSeenAt: number
  lastSeenAt: number
  memberships: LongTermThemeMembership[]
}

export interface LongTermThemeMembership {
  entityType: LongContextEntityType
  entityId: string
  entityTitle: string
  entityPath?: string
  confidence: number
  evidence: string[]
}

export interface LongContextRelationRefreshResult {
  refreshed: number
  archived: number
}

export interface LongContextCognitiveReviewResult {
  title: string
  markdown: string
  filePath?: string
  generatedAt: number
  since: number
  until: number
  stats: {
    newRelations: number
    themeChanges: number
    repeatedQuestions: number
    blockers: number
    resurfacedContexts: number
  }
}

export interface LongContextMetricsBucket {
  bucketStart: number
  shown: number
  opened: number
  useful: number
  notRelated: number
  usefulRate: number
  openRate: number
  notRelatedRate: number
}

export interface LongContextMetricsSeries {
  bucketSizeSec: number
  buckets: LongContextMetricsBucket[]
}

export interface LongContextMetrics {
  since?: number
  until?: number
  counts: {
    suggestionShown: number
    suggestionOpened: number
    suggestionUseful: number
    suggestionDismissed: number
    suggestionNotRelated: number
    relationCreated: number
    relationReinforced: number
    themeCreated: number
  }
  rates: {
    usefulRate: number
    openRate: number
    notRelatedRate: number
  }
  series: LongContextMetricsSeries
}

export interface LongContextUserPrefs {
  confidenceThreshold: number
  tokenBudget: number
  hotRatio: number
  warmRatio: number
  coldRatio: number
  decayHalfLifeDays: number
  topN: number
  hotLimit: number
  warmLimit: number
  coldLimit: number
  archiveAfterDays: number
}

export type LongContextMemoryTier = 'hot' | 'warm' | 'cold'
export type AppLanguage = 'zh-CN' | 'en'

export interface LongContextPackItemPayload {
  tier: LongContextMemoryTier
  relationId?: string
  title: string
  source?: string
  relationType?: LongContextRelationType
  confidence?: number
  score?: number
  reason: string
  evidence: string[]
  droppedReason?: 'exceeded_token_budget'
}

export interface LongContextInspection {
  pack: {
    hot: LongContextPackItemPayload[]
    warm: LongContextPackItemPayload[]
    cold: LongContextPackItemPayload[]
    estimatedTokens: number
    tokenBudget: number
    droppedItems: LongContextPackItemPayload[]
  }
  currentFilePath?: string
  generatedAt: number
}

export type ProactiveSuggestionKind = 'relation' | 'theme_link' | 'cognitive_review' | 'maintenance'
export type ProactiveSuggestionStatus = 'pending' | 'shown' | 'opened' | 'snoozed' | 'dismissed' | 'expired'
export type ProactiveCtaAction = 'open_note' | 'add_wikilink' | 'open_review' | 'open_queue'
export type ProactiveEntityType = 'note' | 'task' | 'vault'
export type ProactiveTriggerKind =
  | 'long_context_high_score'
  | 'theme_proximity'
  | 'cognitive_review_ready'
  | 'stale_island_note'
  | 'overdue_task_burst'

export interface ProactiveSuggestion {
  id: string
  kind: ProactiveSuggestionKind
  sourceRef: string
  entityType: ProactiveEntityType | null
  entityId: string | null
  title: string
  body: string
  ctaAction: ProactiveCtaAction
  ctaPayload: Record<string, unknown>
  importance: number
  status: ProactiveSuggestionStatus
  snoozeUntil: number | null
  shownAt: number | null
  respondedAt: number | null
  signature: string
  createdAt: number
  updatedAt: number
}

export interface ProactiveTriggerThresholds {
  highScoreThreshold: number
  highScoreRecentHours: number
  staleIslandDays: number
  themeKeywordOverlapMin: number
  overdueTaskMin: number
}

export interface VaultHealthSummary {
  noteCount: number
  linkCount: number
  unresolvedLinkCount: number
  orphanCount: number
  openTaskCount: number
  duplicateTitleCount: number
  missingMemoryCount: number
  staleNoteCount: number
  score: number
  scannedAt: number
  scoreFactors: VaultHealthScoreFactor[]
  trend: VaultHealthTrendPoint[]
  growth?: GrowthMetrics
  relativeRank?: string
}

export interface GrowthMetrics {
  newLinksThisWeek: number
  orphansReducedThisWeek: number
  healthScoreChange: number
}

export type VaultHealthScoreFactorId = 'links' | 'tasks' | 'memory' | 'structure' | 'freshness' | 'sync'

export interface VaultHealthScoreFactor {
  id: VaultHealthScoreFactorId
  score: number
  weight: number
  impact: number
  issueCount: number
  status: 'good' | 'warn' | 'bad'
}

export interface VaultHealthTrendPoint {
  weekStart: string
  snapshotDate: string
  scannedAt: number
  score: number
  noteCount: number
  repairSignalCount: number
}

export interface ProactiveUserPrefs {
  enabled: boolean
  silentHoursStart?: string
  silentHoursEnd?: string
  defaultSnoozeDays: number
  perKindEnabled: Record<ProactiveSuggestionKind, boolean>
  maxPerDay: number
  importanceFloor: number
  triggerThresholds: ProactiveTriggerThresholds
}

export type ToolSurfaceKind = 'read_only' | 'preview_write' | 'agent_only'
export type ToolSurfaceCategory = 'note' | 'graph' | 'memory' | 'task' | 'maintenance'

export interface ToolSurfaceEntry {
  name: string
  kind: ToolSurfaceKind
  category: ToolSurfaceCategory
  labelKey: string
  keywords: string[]
  requiresCurrentNote: boolean
}

export type ToolSurfaceRunResult =
  | { ok: true; content: string; sources?: ChatSource[] }
  | { ok: false; error: string }

export type KnowledgeMaintenanceType =
  | 'fix_unresolved_link'
  | 'review_overdue_tasks'
  | 'review_due_today_tasks'
  | 'review_high_priority_tasks'
  | 'review_scheduled_tasks'
  | 'review_started_tasks'
  | 'review_blocked_tasks'
  | 'review_recurring_tasks'
  | 'review_upcoming_tasks'
  | 'connect_orphan'
  | 'fill_empty_note'
  | 'resolve_duplicate_title'
  | 'resolve_duplicate_alias'
  | 'review_open_tasks'
  | 'link_unlinked_reference'
  | 'refresh_memory'
  | 'split_large_note'
  | 'fill_missing_property'
  | 'maintain_bridge'

export type MaintenanceScanGroup = 'links' | 'tasks' | 'properties' | 'memory' | 'structure' | 'bridge'

export interface KnowledgeMaintenanceItem {
  type: KnowledgeMaintenanceType
  title: string
  filePath: string
  priority: number
  action: string
  reason: string
  detail: string
}

export type MaintenanceScanState = 'pending' | 'partial' | 'complete' | 'error'

export interface MaintenanceScanStatus {
  state: MaintenanceScanState
  completedTypes: KnowledgeMaintenanceType[]
  pendingTypes: KnowledgeMaintenanceType[]
  completedGroups?: MaintenanceScanGroup[]
  pendingGroups?: MaintenanceScanGroup[]
  updatedAt: number
  durationMs?: number
  message?: string
}

export type MaintenanceApplyAction = 'open_note' | 'create_target' | 'mark_done' | 'archive' | 'add_alias'
export type MaintenanceApplyMode = 'preview' | 'apply' | 'undo'
export type MaintenanceFeedbackStatus = 'done' | 'skipped' | 'snoozed' | 'not_relevant'

export interface MaintenanceApplyPreview {
  filePath: string
  summary: string
  before: string | null
  after: string | null
  beforeHash?: string
  afterHash?: string
  createsFile: boolean
}

export interface MaintenanceApplyResult {
  ok: boolean
  appliedAction: string
  resultMessage: string
  filePath?: string
  preview?: MaintenanceApplyPreview
  undoToken?: string
  undoExpiresAt?: number
}

export interface MaintenanceFeedbackResult {
  ok: true
  signature: string
  status: MaintenanceFeedbackStatus
  snoozeUntil: number | null
}

export type MaintenanceFeedbackStatusCounts = Record<MaintenanceFeedbackStatus, number>

export interface MaintenanceFeedbackSummary {
  last7Days: MaintenanceFeedbackStatusCounts
  last30Days: MaintenanceFeedbackStatusCounts
  updatedAt: number
}

// ============================================================================
// Maintenance Queue Redesign - Issue Clusters & Work Packages
// ============================================================================

export type MaintenanceClusterType = 'note' | 'folder' | 'category' | 'impact'
export type MaintenancePriorityLevel = 'high' | 'medium' | 'low'
export type MaintenanceConfidenceLevel = 'high' | 'medium' | 'low'
export type MaintenancePackageMode = 'quick' | 'focused' | 'deep'

/**
 * Issue Cluster - 聚合后的问题域
 * 将多个原始维护项聚合成用户能理解的问题组
 */
export interface MaintenanceIssueCluster {
  id: string                              // cluster 唯一标识
  type: MaintenanceClusterType            // 聚合维度
  title: string                           // "12 篇笔记有链接问题"
  description: string                     // "67 个断链分布在 12 篇笔记"
  itemCount: number                       // 包含的原始维护项数量
  affectedResources: string[]             // 受影响的笔记/文件夹路径
  priority: MaintenancePriorityLevel      // 优先级
  estimatedMinutes: number                // 预计处理时间（分钟）
  impactScore: number                     // 影响分数 0-100
  items: KnowledgeMaintenanceItem[]       // 包含的原始维护项
  categories: MaintenanceScanGroup[]      // 涉及的类型分组
}

/**
 * Work Package - 可执行的维护批次
 * 系统策划好的一轮维护工作
 */
export interface MaintenanceWorkPackage {
  id: string
  title: string                           // "快速清理"
  description: string                     // "5 分钟 · 3-5 项 · 仅高置信度"
  mode: MaintenancePackageMode
  estimatedMinutes: number
  confidence: MaintenanceConfidenceLevel
  clusters: MaintenanceIssueCluster[]
  totalItems: number
  scope?: {                               // deep 模式的自定义范围
    timeLimit?: number
    riskLevel?: 'low' | 'medium' | 'high'
    folders?: string[]
    categories?: MaintenanceScanGroup[]
  }
}

/**
 * Maintenance Session - 维护会话状态
 * 用户正在进行的维护工作
 */
export interface MaintenanceSession {
  id: string
  vaultPath: string
  package: MaintenanceWorkPackage
  startedAt: number
  currentIndex: number
  completed: KnowledgeMaintenanceItem[]
  skipped: KnowledgeMaintenanceItem[]
  remaining: KnowledgeMaintenanceItem[]
  stats: {
    resolved: number
    healthImprovement: number             // 预计健康分提升
    affectedNotes: string[]               // 受影响的笔记路径
  }
}

/**
 * Session Summary - 维护会话完成摘要
 * 显示本次维护的成果
 */
export interface MaintenanceSessionSummary {
  sessionId: string
  duration: number                        // 会话时长（秒）
  itemsProcessed: number
  itemsResolved: number
  healthBefore: number
  healthAfter: number
  improvements: {
    category: MaintenanceScanGroup
    before: number
    after: number
  }[]
  nextRecommendation?: MaintenanceWorkPackage
}

/**
 * Maintenance Overview - 维护队列首屏概览
 * 替代原来的 118 个卡片列表
 */
export interface MaintenanceOverview {
  summary: {
    totalItems: number
    problemAreas: {
      category: MaintenanceScanGroup
      count: number
      impact: MaintenancePriorityLevel
      description: string
    }[]
    healthScore: number
    mainIssue: string                     // "链接问题是主要问题：67 项分布在 12 篇笔记"
  }
  packages: MaintenanceWorkPackage[]      // 预设的维护批次
  clusters: MaintenanceIssueCluster[]     // 问题域分组
  scan: MaintenanceScanStatus
}

export interface AiApplyEditResult {
  success: boolean
  filePath?: string
  beforeHash?: string
  afterHash?: string
  created?: boolean
  error?: string
}

export interface FileReadWithHashResult {
  filePath: string
  content: string
  hash: string
}

export interface FileApplyContentMutationResult {
  success: boolean
  filePath?: string
  beforeHash?: string
  afterHash?: string
  created?: boolean
  error?: string
}

export type CloudSyncHealthStatus = 'idle' | 'ok' | 'conflict' | 'error'

export interface CloudSyncHealth {
  activeProvider: string
  activeProviderName: string
  activeProviderConfigured: boolean
  offlineQueueSize: number
  status: CloudSyncHealthStatus
  lastRunAt: number | null
  lastDirection: 'sync' | 'pull' | null
  total: number
  pushed: number
  pulled: number
  conflicts: number
  errors: number
  lastError: string | null
}

export interface CloudSyncConflict {
  path: string
  localHash: string
  localUpdatedAt: string
  remoteHash: string
  remoteUpdatedAt: string
}

export interface IPCChannelMap {
  'file:read': { params: { path: string }; result: string }
  'file:read-with-hash': { params: { path: string; vaultPath?: string }; result: FileReadWithHashResult }
  'file:extract-document-text': { params: { path: string }; result: ExtractedDocumentText }
  'file:stat': { params: { path: string }; result: { size: number; mtime: number } }
  'file:write': { params: { path: string; content: string; vaultPath?: string }; result: void }
  'file:apply-content-mutation': { params: { path: string; content: string; vaultPath?: string; expectedBeforeHash?: string; allowCreate?: boolean }; result: FileApplyContentMutationResult }
  'file:list': { params: { dirPath: string }; result: FileEntry[] }
  'file:list-shallow': { params: { dirPath: string }; result: FileEntry[] }
  'file:create': { params: { path: string; content?: string; vaultPath?: string }; result: void }
  'file:reveal': { params: { path: string }; result: void }
  'file:delete': { params: { path: string; vaultPath?: string }; result: void }
  'file:rename': { params: { oldPath: string; newPath: string; vaultPath?: string }; result: void }
  'file:save-image': { params: { vaultPath: string; imageData: string; fileName: string }; result: string }
  'file:get-history': { params: { vaultPath: string; filePath: string }; result: { fileName: string; path: string; timestamp: string }[] }
  'file:restore-history': { params: { snapshotPath: string; targetPath: string }; result: void }
  'file:encrypt': { params: { path: string; password: string }; result: boolean }
  'file:decrypt': { params: { path: string; password: string }; result: { success: boolean; content?: string; error?: string } }
  'file:list-trash': { params: { vaultPath: string }; result: TrashEntry[] }
  'file:restore-trash': { params: { trashPath: string; vaultPath: string }; result: void }
  'file:empty-trash': { params: { vaultPath: string }; result: void }
  'export:html': { params: { content: string; title: string }; result: boolean }
  'export:pdf': { params: { content: string; title: string }; result: boolean }
  'export:share': { params: { content: string; title: string }; result: string }
  'export:preview-publish-vault': { params: { vaultPath: string; scope?: PublishScope }; result: PublishPreviewResult }
  'export:get-publish-target': { params: { vaultPath: string }; result: PublishTarget | null }
  'export:publish-vault': { params: { vaultPath: string; scope?: PublishScope; access?: PublishAccessMode }; result: PublishResult }
  'export:unpublish-vault': { params: { vaultPath: string; outputPath?: string }; result: PublishUnpublishResult }
  'vault:select': { params: undefined; result: string | null }
  'vault:create': { params: { name: string }; result: string | null }
  'vault:create-sample': { params: { sampleId: WorkflowSampleVaultId }; result: WorkflowSampleVaultCreateResult | null }
  'vault:get': { params: undefined; result: string | null }
  'vault:get-recent': { params: undefined; result: string[] }
  'vault:clear-current': { params: undefined; result: void }
  'vault:health-scan': { params: { vaultPath: string }; result: VaultHealthSummary }
  'vault:health-shown': { params: { vaultPath: string }; result: { lastShownAt: number } }
  'vault:health-mark-shown': { params: { vaultPath: string; at?: number }; result: { lastShownAt: number } }
  'db:index-vault': { params: { vaultPath: string }; result: { indexed: number } }
  'db:index-file': { params: { vaultPath: string; filePath: string }; result: void }
  'db:remove-file': { params: { vaultPath: string; filePath: string }; result: void }
  'db:remove-folder': { params: { vaultPath: string; folderPath: string }; result: void }
  'db:get-all-notes': { params: { vaultPath: string }; result: NoteSearchResult[] }
  'db:get-property-rows': { params: { vaultPath: string }; result: PropertyTableRow[] }
  'db:get-recent-notes': { params: { vaultPath: string; limit?: number }; result: NoteSearchResult[] }
  'db:get-outgoing-links': { params: { vaultPath: string; noteId?: string; filePath?: string }; result: OutgoingLinkResult[] }
  'db:get-backlinks': { params: { vaultPath: string; noteId?: string; filePath?: string }; result: BacklinkResult[] }
  'db:get-unlinked-mentions': { params: { vaultPath: string; noteId?: string; filePath?: string }; result: UnlinkedMentionResult[] }
  'db:get-graph': { params: { vaultPath: string; mode?: GraphMode; rootPath?: string }; result: GraphData }
  'db:search-notes': { params: { vaultPath: string; query: string }; result: NoteSearchResult[] }
  'db:lexical-search': { params: { vaultPath: string; query: string }; result: { noteId: string; title: string; filePath: string; chunk: string; score: number }[] }
  'db:fulltext-search': { params: { vaultPath: string; query: string; regex?: boolean }; result: { filePath: string; title: string; line: string; lineNumber: number }[] }
  'db:get-tags': { params: { vaultPath: string }; result: { name: string; count: number }[] }
  'db:get-notes-by-tag': { params: { vaultPath: string; tag: string }; result: NoteSearchResult[] }
  'flashcards:list-due': { params: { vaultPath: string; today?: string; limit?: number }; result: { cards: FlashcardQueueItem[]; total: number } }
  'flashcards:review': { params: { vaultPath: string; filePath: string; startLine: number; rating: FlashcardReviewRating; reviewedAt?: string }; result: { ok: boolean; card?: FlashcardQueueItem; error?: string } }
  'kanban:get-columns': { params: { vaultPath: string }; result: KanbanColumn[] }
  'kanban:create-column': { params: { vaultPath: string; id: string; name: string }; result: void }
  'kanban:rename-column': { params: { vaultPath: string; id: string; name: string }; result: void }
  'kanban:delete-column': { params: { vaultPath: string; id: string }; result: void }
  'kanban:reorder-columns': { params: { vaultPath: string; columnIds: string[] }; result: void }
  'kanban:get-tasks': { params: { vaultPath: string }; result: KanbanTask[] }
  'kanban:import-indexed-tasks': { params: { vaultPath: string; columnId?: string; preview?: boolean; limit?: number; plan?: KanbanAiPlan }; result: { tasks: KanbanTask[] | KanbanAiPlan['tasks']; relations: KanbanRelation[] | KanbanAiPlan['relations']; summary: string; plan?: KanbanAiPlan } }
  'kanban:create-task': { params: { vaultPath: string; id: string; columnId: string; title: string; description?: string; priority?: number; dueDate?: string | null; sourceNoteId?: string | null; sourceFilePath?: string | null }; result: void }
  'kanban:update-task': { params: { vaultPath: string; id: string; title?: string; description?: string; columnId?: string; sortOrder?: number; priority?: number; dueDate?: string | null; sourceNoteId?: string | null; sourceFilePath?: string | null }; result: void }
  'kanban:delete-task': { params: { vaultPath: string; id: string }; result: void }
  'kanban:move-task': { params: { vaultPath: string; taskId: string; columnId: string; sortOrder: number }; result: void }
  'kanban:reorder-tasks': { params: { vaultPath: string; moves: { id: string; columnId: string; sortOrder: number }[] }; result: void }
  'kanban:get-relations': { params: { vaultPath: string; taskId?: string }; result: KanbanRelation[] }
  'kanban:create-relation': { params: { vaultPath: string; id: string; sourceTaskId: string; targetTaskId: string; relationType: KanbanRelation['relationType'] }; result: void }
  'kanban:delete-relation': { params: { vaultPath: string; id: string }; result: void }
  'kanban:ai-analyze': { params: { vaultPath: string }; result: { summary: string } }
  'kanban:ai-breakdown-task': { params: { vaultPath: string; taskId?: string; title: string; description?: string; columnId?: string; preview?: boolean; plan?: KanbanAiPlan }; result: { tasks: KanbanTask[] | KanbanAiPlan['tasks']; relations: KanbanRelation[] | KanbanAiPlan['relations']; summary: string; plan?: KanbanAiPlan } }
  'kanban:ai-from-note': { params: { vaultPath: string; filePath: string; content?: string; columnId?: string; preview?: boolean; plan?: KanbanAiPlan }; result: { tasks: KanbanTask[] | KanbanAiPlan['tasks']; relations: KanbanRelation[] | KanbanAiPlan['relations']; summary: string; plan?: KanbanAiPlan } }
  'db:index-search-note': { params: { vaultPath: string; noteId: string; content: string }; result: void }
  'db:build-search-index': { params: { vaultPath: string }; result: { indexed: number } }
  'db:search-index-status': { params: { vaultPath: string }; result: SearchIndexStatus }
  'long-context:get-suggestions': {
    params: {
      vaultPath: string
      entityType: LongContextEntityType
      entityId: string
      content?: string
      limit?: number
      refresh?: boolean
      language?: AppLanguage
    }
    result: LongContextSuggestion[]
  }
  'long-context:discover-relations': {
    params: {
      vaultPath: string
      entityType: LongContextEntityType
      entityId: string
      content?: string
      limit?: number
      language?: AppLanguage
    }
    result: {
      discovered: number
      suggestions: LongContextSuggestion[]
    }
  }
  'long-context:submit-feedback': {
    params: {
      vaultPath: string
      relationId: string
      feedbackType: LongContextFeedbackType
      note?: string
    }
    result: void
  }
  'long-context:get-themes': {
    params: {
      vaultPath: string
      limit?: number
    }
    result: LongTermTheme[]
  }
  'long-context:run-theme-extraction': {
    params: {
      vaultPath: string
      language?: AppLanguage
    }
    result: {
      created: number
      updated: number
    }
  }
  'long-context:refresh-relations': {
    params: {
      vaultPath: string
      entityType?: LongContextEntityType
      entityId?: string
      limit?: number
    }
    result: LongContextRelationRefreshResult
  }
  'long-context:generate-cognitive-review': {
    params: {
      vaultPath: string
      since?: number
      until?: number
      write?: boolean
      outputPath?: string
    }
    result: LongContextCognitiveReviewResult
  }
  'long-context:record-suggestion-opened': {
    params: {
      vaultPath: string
      entityType: LongContextEntityType
      entityId: string
      relationId: string
      targetType: LongContextEntityType
      targetId: string
      targetTitle?: string
      targetPath?: string
    }
    result: void
  }
  'long-context:get-metrics': {
    params: {
      vaultPath: string
      since?: number
      until?: number
    }
    result: LongContextMetrics
  }
  'long-context:get-prefs': { params: undefined; result: LongContextUserPrefs }
  'long-context:set-prefs': { params: { prefs: Partial<LongContextUserPrefs> }; result: LongContextUserPrefs }
  'long-context:inspect-pack': {
    params: {
      vaultPath: string
      currentFilePath?: string | null
      tokenBudget?: number
      language?: AppLanguage
    }
    result: LongContextInspection
  }
  'long-context:lookup-citation': {
    params: {
      vaultPath: string
      sourceFilePath: string
      sourceTitle: string
    }
    result: {
      found: boolean
      relations: LongContextSuggestion[]
      themes: LongTermTheme[]
    }
  }
  'db:chat-history-load': { params: { vaultPath: string; sessionId?: string }; result: ChatHistoryEntry[] }
  'db:chat-history-append': { params: { vaultPath: string; role: ChatHistoryRole; content: string; sources?: ChatSource[]; sessionId?: string }; result: void }
  'db:chat-history-clear': { params: { vaultPath: string; sessionId?: string }; result: void }
  'db:chat-sessions-list': { params: { vaultPath: string }; result: { id: string; title: string; createdAt: number; updatedAt: number }[] }
  'db:chat-session-create': { params: { vaultPath: string; id: string; title: string }; result: void }
  'db:chat-session-delete': { params: { vaultPath: string; sessionId: string }; result: void }
  'db:chat-session-rename': { params: { vaultPath: string; sessionId: string; title: string }; result: void }
  'ai:get-providers': { params: undefined; result: AIProviderConfig[] }
  'ai:save-provider': { params: { config: AIProviderConfig }; result: void }
  'ai:delete-provider': { params: { id: string }; result: void }
  'ai:test-provider': { params: { config: AIProviderConfig }; result: TestResult }
  'ai:save-providers': { params: { providers: AIProviderConfig[] }; result: void }
  'ai:set-active': { params: { providerId: string }; result: void }
  'ai:get-active-provider': { params: undefined; result: string | null }
  'ai:get-usage-summary': { params: { since?: number; until?: number }; result: AIUsageSummary }
  'ai:list-usage-records': { params: { since?: number; until?: number; limit?: number }; result: AIUsageRecord[] }
  'ai:clear-usage-records': { params: undefined; result: { cleared: number } }
  'ai:get-cost-budget': { params: undefined; result: AICostBudget }
  'ai:set-cost-budget': { params: AICostBudget; result: AICostBudget }
  'ai:validate': { params: { config: AIProviderConfig }; result: AIProviderValidationResult }
  'ai:probe-question': {
    params: { config?: AIProviderConfig; question?: string }
    result:
      | { ok: true; answer: string; latencyMs: number; model: string }
      | { ok: false; error: string }
  }
  'ai:chat': { params: { messages: IPCChatMessage[]; vaultPath?: string; systemPrompt?: string; currentFilePath?: string | null; language?: AppLanguage }; result: void }
  'ai:chat-agent': { params: { messages: IPCChatMessage[]; vaultPath?: string; systemPrompt?: string; currentFilePath?: string | null; language?: AppLanguage }; result: void }
  'ai:preview-outbound': { params: { messages: IPCChatMessage[]; vaultPath?: string; currentFilePath?: string | null; language?: AppLanguage; mode?: AIOutboundPreviewMode }; result: AIOutboundPreview }
  'ai:detect-intent': { params: { messages: IPCChatMessage[]; intents?: string[]; intentContext?: string }; result: { intent?: string } }
  'ai:stop': { params: undefined; result: void }
  'ai:complete': { params: { text: string; system?: string; temperature?: number; taskKey?: string; styleSource?: string }; result: string }
  'ai:complete-abort': { params: { taskKey?: string } | undefined; result: void }
  'ai:transcribe': { params: { audioData: string; mimeType?: string; fileName?: string; model?: string; language?: string }; result: { success: boolean; text?: string; error?: string } }
  'ai:get-system-prompt': { params: undefined; result: string }
  'ai:set-system-prompt': { params: { prompt: string }; result: void }
  'ai:infer-links': { params: { vaultPath: string; filePaths: string[] }; result: { success: boolean; added?: number; error?: string } }
  'ai:infer-global-links': { params: { vaultPath: string }; result: { success: boolean; added?: number; error?: string } }
  'db:auto-infer-tfidf-links': { params: { vaultPath: string; force?: boolean }; result: { success: boolean; added?: number; skipped?: boolean; error?: string } }
  'ai:generate-memories': { params: { vaultPath: string }; result: { success: boolean; generated: number; skipped: number; failed: number; total: number; totalNotes?: number; limited?: boolean; error?: string } }
  'ai:list-ollama-models': { params: { baseUrl?: string }; result: string[] }
  'ai:suggest-tags': { params: { content: string; existingTags: string[]; language?: AppLanguage }; result: string[] }
  'ai:summarize': { params: { content: string; language?: AppLanguage }; result: string }
  'ai:generate-flashcards': { params: { content: string; title?: string; maxCards?: number; language?: AppLanguage }; result: { success: boolean; cards: GeneratedFlashcard[]; markdown?: string; error?: string } }
  'ai:detect-local-config': { params: undefined; result: { importable: number; imported: number; existing: number; skipped?: string[] } }
  'ai:fetch-models': { params: FetchModelsParams; result: FetchModelsResult }
  'ai:edit': { params: { instruction: string; fileContent: string; filePath: string; images?: string[]; history?: string[]; language?: AppLanguage }; result: { success: boolean; content?: string; beforeHash?: string; error?: string } }
  'ai:apply-edit': { params: { filePath: string; content: string; vaultPath?: string; expectedBeforeHash?: string; allowCreate?: boolean }; result: AiApplyEditResult }
  'ai:generate-graph': { params: { filePaths: string[]; vaultPath: string; language?: AppLanguage }; result: { success: boolean; content?: string; error?: string } }
  'ai:plan-note-batches': { params: { instruction: string; existingDirs?: string[]; language?: AppLanguage }; result: { success: boolean; batches: GeneratedNoteBatchPlanItem[]; error?: string } }
  'ai:generate-notes': { params: { instruction: string; vaultPath: string; targetDir?: string; requestId?: number; language?: AppLanguage }; result: { success: boolean; files: string[]; failed: number; total: number; failedItems: GeneratedNoteFailure[]; error?: string } }
  'file:import-obsidian': { params: { vaultPath: string }; result: { imported: number; converted: number; indexed: number; canceled?: boolean } }
  'file:import-readwise': { params: { sourcePath?: string; vaultPath: string }; result: { imported: number; skipped: number; indexed: number; canceled?: boolean } }
  'file:import-pocket': { params: { sourcePath?: string; vaultPath: string }; result: { imported: number; skipped: number; indexed: number; canceled?: boolean } }
  'file:import-notion': { params: { sourcePath?: string; vaultPath: string }; result: { imported: number; converted: number; indexed: number; assets: number; skipped: number; canceled?: boolean } }
  'template:daily-note': { params: { vaultPath: string }; result: string }
  'template:get-templates': { params: undefined; result: NoteTemplate[] }
  'template:save-templates': { params: { templates: NoteTemplate[] }; result: void }
  'template:get-local-pack': { params: undefined; result: TemplateLocalPackItem[] }
  'template:install-local-pack': { params: { templateId: string }; result: { installed: number; templates: NoteTemplate[] } }
  'template:install-local-pack-bundle': { params: undefined; result: { installed: number; templates: NoteTemplate[] } }
  'template:get-marketplace': { params: undefined; result: TemplateLocalPackItem[] }
  'template:install-marketplace': { params: { templateId: string }; result: { installed: number; templates: NoteTemplate[] } }
  'template:install-marketplace-pack': { params: undefined; result: { installed: number; templates: NoteTemplate[] } }
  'template:list-community': { params: { vaultPath: string }; result: TemplateLocalPackItem[] }
  'template:install-community-pack': { params: { vaultPath: string }; result: { installed: number; templates: NoteTemplate[] } }
  'template:create-from': { params: { vaultPath: string; templateId: string; title: string }; result: string | null }
  'plugins:list': { params: { vaultPath: string }; result: LocalPlugin[] }
  'plugins:get-local-pack': { params: { vaultPath: string }; result: PluginLocalPackItem[] }
  'plugins:install-local-pack': { params: { vaultPath: string; pluginId: string }; result: { installed: number; plugins: LocalPlugin[] } }
  'plugins:install-local-pack-bundle': { params: { vaultPath: string }; result: { installed: number; plugins: LocalPlugin[] } }
  'plugins:get-marketplace': { params: { vaultPath: string }; result: PluginLocalPackItem[] }
  'plugins:install-marketplace': { params: { vaultPath: string; pluginId: string }; result: { installed: number; plugins: LocalPlugin[] } }
  'plugins:install-marketplace-pack': { params: { vaultPath: string }; result: { installed: number; plugins: LocalPlugin[] } }
  'snippets:list': { params: { vaultPath: string }; result: CssSnippet[] }
  'themes:list': { params: { vaultPath: string }; result: ThemePackage[] }
  'cloud:get-sync-health': { params: { vaultPath?: string } | undefined; result: CloudSyncHealth }
  'cloud:sync': { params: { vaultPath: string }; result: { total: number; pushed: number; pulled: number; conflicts: CloudSyncConflict[]; errors: string[] } }
  'cloud:push-file': { params: { vaultPath: string; filePath: string }; result: boolean }
  'cloud:pull-file': { params: { vaultPath: string; relPath: string }; result: boolean }
  'cloud:pull-all': { params: { vaultPath: string }; result: { total: number; pushed: number; pulled: number; conflicts: CloudSyncConflict[]; errors: string[] } }
  'cloud:get-sync-provider': { params: undefined; result: string }
  'cloud:set-sync-provider': { params: { provider: string }; result: void }
  'cloud:get-all-providers': { params: undefined; result: { type: string; name: string; configured: boolean }[] }
  'cloud:test-connection': { params: { provider: string }; result: { ok: boolean; error?: string } }
  'cloud:onedrive-auth': { params: { clientId: string }; result: { success: boolean; error?: string } }
  'cloud:get-onedrive-config': { params: undefined; result: { clientId: string; folder: string; hasToken: boolean } | null }
  'cloud:save-onedrive-config': { params: { clientId: string; folder: string }; result: void }
  'cloud:get-webdav-config': { params: undefined; result: { url: string; username?: string; folder: string; hasPassword: boolean } }
  'cloud:save-webdav-config': { params: { url: string; username?: string; password?: string; folder: string }; result: void }
  'cloud:get-s3-config': { params: undefined; result: { endpoint: string; region: string; bucket: string; prefix?: string; hasAccessKeyId: boolean; hasSecretAccessKey: boolean } }
  'cloud:save-s3-config': { params: { endpoint: string; region: string; bucket: string; accessKeyId: string; secretAccessKey: string; prefix?: string }; result: void }
  'cloud:get-icloud-path': { params: undefined; result: string | null }
  'cloud:set-icloud-path': { params: { path: string }; result: void }
  'cloud:push-index': { params: { vaultPath: string }; result: boolean }
  'cloud:pull-index': { params: { vaultPath: string }; result: boolean }
  'cloud:sync-index': { params: { vaultPath: string }; result: { pushed: boolean; pulled: boolean; conflict: boolean } }
  'cloud:resolve-conflict': { params: { vaultPath: string; path: string; resolution: 'local' | 'remote' }; result: boolean }
  'cloud:get-sync-exclude': { params: undefined; result: string[] }
  'cloud:set-sync-exclude': { params: { paths: string[] }; result: void }
  'cloud:set-online': { params: { online: boolean }; result: void }
  'updater:check': { params: undefined; result: { available: boolean; version?: string } }
  'updater:download': { params: undefined; result: void }
  'updater:install': { params: undefined; result: void }
  'app:get-version': { params: undefined; result: string }
  'app:set-language': { params: { language?: AppLanguage }; result: { language: AppLanguage } }
  'app:open-external': { params: { url: string }; result: void }
  'telemetry:get-prefs': { params: undefined; result: { enabled: boolean } }
  'telemetry:set-prefs': { params: { enabled: boolean }; result: { enabled: boolean } }
  'proactive:list': {
    params: {
      vaultPath: string
      status?: ProactiveSuggestionStatus[]
      entityType?: ProactiveEntityType | null
      entityId?: string | null
      limit?: number
      sinceSeconds?: number
    }
    result: ProactiveSuggestion[]
  }
  'proactive:respond': {
    params: {
      vaultPath: string
      id: string
      status: 'shown' | 'opened' | 'snoozed' | 'dismissed'
      snoozeUntil?: number | null
    }
    result: ProactiveSuggestion | null
  }
  'proactive:respond-all': {
    params: {
      vaultPath: string
      status: 'opened' | 'dismissed'
    }
    result: { changed: number }
  }
  'proactive:get-prefs': { params: undefined; result: ProactiveUserPrefs }
  'proactive:set-prefs': { params: { prefs: Partial<ProactiveUserPrefs> }; result: ProactiveUserPrefs }
  'proactive:debug-run-cycle': {
    params: {
      vaultPath: string
      entityType: ProactiveEntityType
      entityId: string
      trigger: ProactiveTriggerKind
      now?: number
      context?: Record<string, unknown>
      userPrefs?: Partial<ProactiveUserPrefs>
    }
    result: {
      evaluated: number
      emitted: number
      suggestions: ProactiveSuggestion[]
      skippedReasons: Record<string, number>
    }
  }
  'ai:run-tool': {
    params: {
      vaultPath: string
      toolName: string
      args?: Record<string, unknown>
      currentFilePath?: string | null
    }
    result: ToolSurfaceRunResult
  }
  'ai:list-tool-surface': {
    params: undefined
    result: { entries: ToolSurfaceEntry[] }
  }
  'maintenance:get-queue': {
    params: {
      vaultPath: string
      type?: KnowledgeMaintenanceType
      query?: string
      limit?: number
      minCharacters?: number
      upcomingDays?: number
      requiredProperties?: string[]
      scanGroups?: MaintenanceScanGroup[]
      language?: AppLanguage
    }
    result: {
      items: KnowledgeMaintenanceItem[]
      total: number
      counts: Record<KnowledgeMaintenanceType, number>
      scan: MaintenanceScanStatus
    }
  }
  'maintenance:apply-fix': {
    params: {
      vaultPath: string
      item: KnowledgeMaintenanceItem
      action: MaintenanceApplyAction
      mode?: MaintenanceApplyMode
      payload?: Record<string, unknown>
      language?: AppLanguage
    }
    result: MaintenanceApplyResult
  }
  'maintenance:record-feedback': {
    params: {
      vaultPath: string
      item: KnowledgeMaintenanceItem
      status: MaintenanceFeedbackStatus
      snoozeUntil?: number | null
    }
    result: MaintenanceFeedbackResult
  }
  'maintenance:get-feedback-summary': {
    params: { vaultPath: string }
    result: MaintenanceFeedbackSummary
  }
  'maintenance:get-overview': {
    params: {
      vaultPath: string
      language?: AppLanguage
    }
    result: MaintenanceOverview
  }
  'maintenance:start-session': {
    params: {
      vaultPath: string
      packageId: string
      language?: AppLanguage
    }
    result: MaintenanceSession
  }
  'maintenance:get-session': {
    params: {
      vaultPath: string
      sessionId: string
    }
    result: MaintenanceSession | null
  }
  'maintenance:session-next-item': {
    params: {
      vaultPath: string
      sessionId: string
    }
    result: KnowledgeMaintenanceItem | null
  }
  'maintenance:session-record-action': {
    params: {
      vaultPath: string
      sessionId: string
      item: KnowledgeMaintenanceItem
      action: MaintenanceFeedbackStatus
    }
    result: { ok: boolean }
  }
  'maintenance:complete-session': {
    params: {
      vaultPath: string
      sessionId: string
    }
    result: MaintenanceSessionSummary
  }
  'agent:plan': {
    params: { vaultPath: string; goal: string; description?: string; context?: Record<string, unknown>; dryRun?: boolean }
    result: { runId: string; plan: AgentPlanStep[]; rationale: string }
  }
  'agent:update-plan': {
    params: { vaultPath: string; runId: string; plan: AgentPlanStep[] }
    result: void
  }
  'agent:start': {
    params: { vaultPath: string; runId: string; dryRun?: boolean }
    result: void
  }
  'agent:pause': { params: { vaultPath: string; runId: string }; result: void }
  'agent:resume': { params: { vaultPath: string; runId: string }; result: void }
  'agent:cancel': { params: { vaultPath: string; runId: string }; result: void }
  'agent:retry-step': { params: { vaultPath: string; runId: string; stepIndex: number; overrideContent?: string }; result: void }
  'agent:skip-step': { params: { vaultPath: string; runId: string; stepIndex: number }; result: void }
  'agent:rollback-step': { params: { vaultPath: string; runId: string; stepIndex: number }; result: { ok: boolean; error?: string } }
  'agent:rollback-run': { params: { vaultPath: string; runId: string }; result: { ok: boolean; rolledBack: number; errors: string[] } }
  'agent:get-run': { params: { vaultPath: string; runId: string }; result: { run: AgentRunSummary; steps: AgentStepSummary[] } | null }
  'agent:list-runs': { params: { vaultPath: string; status?: AgentRunStatus[]; limit?: number }; result: AgentRunSummary[] }
  'agent:reflect': { params: { vaultPath: string; runId: string }; result: AgentReflectResult }
  'demo:get-sample-vaults': { params: undefined; result: SampleVault[] }
  'demo:run-transformation': { params: { vaultPath: string; vaultId: string }; result: TransformationResult }
  'demo:get-stats': { params: { vaultPath: string }; result: VaultStats }
  'memory:get-timeline': { params: { vaultPath: string }; result: MemoryCard[] }
  'memory:update-card': { params: { vaultPath: string; id: string; actions: MemoryCardUpdate }; result: void }
  'memory:explain-card': { params: { vaultPath: string; id: string }; result: string }
  'settings:get-sync-status': { params: undefined; result: SettingsSyncStatus }
  'settings:configure-sync': { params: SettingsSyncConfig; result: { ok: boolean } }
  'settings:get-installed-plugins': { params: undefined; result: SettingsPlugin[] }
  'settings:toggle-plugin': { params: { id: string; enabled: boolean }; result: { ok: boolean } }
  'settings:get-proactive-config': { params: undefined; result: ProactiveConfig }
  'settings:save-proactive-config': { params: ProactiveConfig; result: { ok: boolean } }
  'settings:get-keybindings': { params: undefined; result: KeybindingEntry[] }
  'settings:set-keybinding': { params: { id: string; key: string }; result: { ok: boolean; error?: string } }
  'settings:reset-keybinding': { params: { id: string }; result: { ok: boolean } }
  'settings:get-memory-config': { params: undefined; result: MemoryConfig }
  'settings:save-memory-config': { params: MemoryConfig; result: { ok: boolean } }
}

export type IPCChannel = keyof IPCChannelMap

export type AgentRunStatus = 'pending' | 'planning' | 'awaiting_user' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled'
export type AgentStepKind =
  | 'tool_call'
  | 'file_write'
  | 'file_create'
  | 'task_update'
  | 'note_edit'
  | 'move_file'
  | 'rename_file'
  | 'delete_file'
  | 'apply_tag'
  | 'update_frontmatter'
  | 'create_link'
  | 'merge_notes'
export type AgentStepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped' | 'rolled_back'

export interface AgentPlanStep {
  index: number
  kind: AgentStepKind
  toolName?: string
  args: Record<string, unknown>
  description: string
  expectedEffect: string
  dependsOn: number[]
}

export interface AgentRunSummary {
  id: string
  vaultPath: string
  goal: string
  description: string
  status: AgentRunStatus
  plan: AgentPlanStep[]
  rationale: string
  dryRun: boolean
  currentStepIndex: number
  totalSteps: number
  resultSummary: string | null
  error: string | null
  createdAt: number
  updatedAt: number
  startedAt: number | null
  completedAt: number | null
}

export interface AgentStepSummary {
  id: string
  runId: string
  stepIndex: number
  kind: AgentStepKind
  toolName: string | null
  args: Record<string, unknown>
  description: string
  expectedEffect: string
  dependsOn: number[]
  status: AgentStepStatus
  preview: string | null
  resultContent: string | null
  error: string | null
  hasRollback: boolean
  startedAt: number | null
  completedAt: number | null
}

export interface AgentStepUpdateEvent {
  runId: string
  stepIndex: number
  status: AgentStepStatus
  preview?: string | null
  error?: string | null
}

export interface AgentReflectResult {
  goalAchieved: boolean
  succeededSteps: number
  failedSteps: number
  unmetExpectations: string[]
  suggestions: string[]
}

// ============================================================================
// Demo Transformation
// ============================================================================

export interface SampleVault {
  id: string
  name: string
  description: string
  noteCount: number
  scenario: 'research' | 'developer' | 'writer'
  path?: string
}

export interface TransformationFix {
  type: 'resolve-link' | 'connect-island' | 'add-property' | 'organize-folder'
  count: number
  examples: string[]
}

export interface VaultStats {
  noteCount: number
  linkCount: number
  unresolvedLinkCount: number
  orphanCount: number
  duplicateTitleCount: number
  missingPropertyCount: number
  healthScore: number
}

export interface TransformationResult {
  vaultId: string
  status: 'running' | 'completed' | 'failed'
  progress: number
  beforeStats: VaultStats
  afterStats?: VaultStats
  fixes: TransformationFix[]
  durationMs?: number
  error?: string
}

// ============================================================================
// Memory Timeline
// ============================================================================

export interface MemoryCard {
  id: string
  title: string
  period: { start: number; end: number }
  sources: Array<{ noteId: string; title: string; filePath: string; relevance: number }>
  tier: 'Hot' | 'Warm' | 'Cold'
  confidence: number
  userActions: {
    archived: boolean
    pinned: boolean
  }
  createdAt: number
  updatedAt: number
}

export interface MemoryCardUpdate {
  archived?: boolean
  pinned?: boolean
}

// ============================================================================
// Settings
// ============================================================================

export interface KeybindingEntry {
  id: string
  label: string
  key: string
  description: string
}

export interface MemoryConfig {
  enabled: boolean
  autoGenerate: boolean
  retentionDays: number
  maxTokens: number
}
