import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from '../../../stores/toast-store'
import './KeysSettings.css'

interface KeyBinding {
  id: string
  label: string
  key: string
  description: string
}

export function KeysSettings() {
  const { t } = useTranslation()
  const [bindings, setBindings] = useState<KeyBinding[]>([])
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
      <section className="settings-section">
        <div className="section-header">
          <h2>{t('settings.keys.title')}</h2>
          <p>{t('settings.keys.description')}</p>
        </div>

        <div className="keybindings-list">
          {bindings.map((binding) => (
            <div key={binding.id} className="keybinding-item">
              <div className="keybinding-info">
                <h4>{binding.label}</h4>
                <p>{binding.description}</p>
              </div>
              <div className="keybinding-actions">
                {editing === binding.id ? (
                  <input
                    type="text"
                    className="keybinding-input"
                    placeholder={t('settings.keys.pressKey')}
                    onKeyDown={(e) => handleKeyPress(binding.id, e)}
                    onBlur={() => setEditing(null)}
                    autoFocus
                  />
                ) : (
                  <>
                    <button
                      className="keybinding-display"
                      onClick={() => setEditing(binding.id)}
                    >
                      {binding.key || t('settings.keys.notSet')}
                    </button>
                    <button
                      className="btn-reset"
                      onClick={() => handleReset(binding.id)}
                    >
                      {t('common.reset')}
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
