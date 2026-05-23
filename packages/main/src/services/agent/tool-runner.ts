export interface ToolRunnerResult {
  content: string
  sources?: { title: string; filePath: string; chunk: string; score: number }[]
}

export type ToolRunner = (
  toolName: string,
  args: Record<string, unknown>,
  vaultPath: string,
  currentFilePath?: string | null
) => Promise<ToolRunnerResult>

let activeRunner: ToolRunner | null = null

export function setAgentToolRunner(runner: ToolRunner): void {
  activeRunner = runner
}

export async function runAgentTool(
  toolName: string,
  args: Record<string, unknown>,
  vaultPath: string,
  currentFilePath?: string | null
): Promise<ToolRunnerResult> {
  if (!activeRunner) {
    return { content: 'Agent tool runner is not initialized yet.' }
  }
  return activeRunner(toolName, args, vaultPath, currentFilePath)
}
