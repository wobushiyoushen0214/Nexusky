import type { AIProviderConfig } from '@shared/types/ipc'

export interface VaultToolsAvailability {
  hasEnabledProvider: boolean
  supportsVaultTools: boolean
  providerName: string | null
}

export function getVaultToolsAvailability(providers: AIProviderConfig[] | null | undefined): VaultToolsAvailability {
  const active = providers?.find((provider) => provider.enabled) ?? null
  return {
    hasEnabledProvider: Boolean(active),
    supportsVaultTools: Boolean(active?.capabilities?.toolCalling),
    providerName: active?.name || active?.type || null
  }
}
