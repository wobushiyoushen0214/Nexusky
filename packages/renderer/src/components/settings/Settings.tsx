import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { SettingsSidebar, type SettingsTab } from './SettingsSidebar'
import { AppearanceSettings } from './pages/AppearanceSettings'
import { AIProviderSettings } from './AIProviderSettings'
import { KeysSettings } from './pages/KeysSettings'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog'
import { Button } from '../ui/button'
import { ScrollArea } from '../ui/scroll-area'
import { Tabs, TabsContent } from '../ui/tabs'
import './Settings.css'

interface SettingsProps {
  open: boolean
  onClose: () => void
}

export function Settings({ open, onClose }: SettingsProps) {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState<SettingsTab>('appearance')

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) onClose()
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="settings-dialog"
        overlayClassName="settings-overlay"
        showCloseButton={false}
      >
        <DialogHeader className="settings-dialog__header">
          <DialogTitle className="settings-dialog__title">{t('settings.title')}</DialogTitle>
          <DialogClose asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="settings-dialog__close"
              aria-label={t('common.close')}
            >
              <svg
                className="settings-dialog__close-icon"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Button>
          </DialogClose>
        </DialogHeader>

        <Tabs
          value={activeTab}
          orientation="vertical"
          onValueChange={(value) => setActiveTab(value as SettingsTab)}
          className="settings-dialog__tabs"
        >
          <div className="settings-dialog__body">
            <SettingsSidebar />

            <main className="settings-dialog__content-shell" aria-label={t(`settings.tabs.${activeTab}`)}>
              <ScrollArea className="settings-dialog__content">
                <TabsContent value="appearance" className="settings-dialog__tab-panel">
                  <AppearanceSettings />
                </TabsContent>
                <TabsContent value="ai" className="settings-dialog__tab-panel">
                  <AIProviderSettings />
                </TabsContent>
                <TabsContent value="keys" className="settings-dialog__tab-panel">
                  <KeysSettings />
                </TabsContent>
              </ScrollArea>
            </main>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
