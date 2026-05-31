import type { AppLanguage } from '@shared/types/ipc'

export function getAiOutputLanguageName(language: AppLanguage): string {
  return language === 'zh-CN' ? 'Simplified Chinese' : 'English'
}

export function getAiOutputLanguageInstruction(language: AppLanguage): string {
  return `Write all user-visible generated content in ${getAiOutputLanguageName(language)} unless the user explicitly asks for another language.`
}

export function getJsonValueLanguageInstruction(language: AppLanguage): string {
  return `JSON keys must stay exactly as requested, but user-visible JSON string values must be written in ${getAiOutputLanguageName(language)} unless the user explicitly asks for another language.`
}
