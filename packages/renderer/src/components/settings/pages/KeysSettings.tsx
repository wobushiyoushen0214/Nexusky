import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import type { KeybindingEntry } from '@shared/types/ipc'
import { toast } from '../../../stores/toast-store'
import { Button } from '../../ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card'
import { Empty, EmptyHeader, EmptyTitle } from '../../ui/empty'
import { Input } from '../../ui/input'
import { SettingsSection } from '../SettingsSection'
import './KeysSettings.css'

export function KeysSettings() {
  const { t } = useTranslation()
  const [bindings, setBindings] = useState<KeybindingEntry[]>([])
  const [editing, setEditing] = useState<string | null>(null)

  useEffect(() => {
    loadBindings()
  }, [])

  const loadBindings = async () => {
    try {
      const result = await window.api.invoke('settings:get-keybindings', undefined)
      setBindings(result)
    } catch (error) {
      console.error('Failed to load keybindings:', error)
    }
  }

  const handleKeyPress = async (id: string, event: React.KeyboardEvent) => {
    event.preventDefault()
    const key = `${event.metaKey ? 'Cmd+' : ''}${event.ctrlKey ? 'Ctrl+' : ''}${event.altKey ? 'Alt+' : ''}${event.shiftKey ? 'Shift+' : ''}${event.key}`

    try {
      await window.api.invoke('settings:set-keybinding', { id, key })
      await loadBindings()
      setEditing(null)
      toast(t('settings.keys.saved'), 'success')
    } catch (error) {
      toast(t('settings.keys.saveFailed'), 'error')
    }
  }

  const handleReset = async (id: string) => {
    try {
      await window.api.invoke('settings:reset-keybinding', { id })
      await loadBindings()
      toast(t('settings.keys.reset'), 'success')
    } catch (error) {
      toast(t('settings.keys.resetFailed'), 'error')
    }
  }

  return (
    <div className="keys-settings">
      <SettingsSection>
        <div className="section-header">
          <h2>{t('settings.keys.title')}</h2>
          <p>{t('settings.keys.description')}</p>
        </div>

        {bindings.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>{t('settings.keys.comingSoon')}</EmptyTitle>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="keybindings-list">
            {bindings.map((binding) => (
              <Card key={binding.id} asChild className="keybinding-item">
                <article>
                  <CardHeader className="keybinding-info">
                    <CardTitle className="keybinding-title">{binding.label}</CardTitle>
                    <CardDescription className="keybinding-description">{binding.description}</CardDescription>
                  </CardHeader>
                  <CardContent className="keybinding-actions">
                    {editing === binding.id ? (
                      <Input
                        type="text"
                        className="keybinding-input"
                        placeholder={t('settings.keys.pressKey')}
                        onKeyDown={(e) => handleKeyPress(binding.id, e)}
                        onBlur={() => setEditing(null)}
                        autoFocus
                      />
                    ) : (
                      <>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="keybinding-display"
                          onClick={() => setEditing(binding.id)}
                        >
                          {binding.key || t('settings.keys.notSet')}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="btn-reset"
                          onClick={() => handleReset(binding.id)}
                        >
                          {t('common.reset')}
                        </Button>
                      </>
                    )}
                  </CardContent>
                </article>
              </Card>
            ))}
          </div>
        )}
      </SettingsSection>
    </div>
  )
}
