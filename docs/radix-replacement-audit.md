# Radix / shadcn Component Replacement Audit

Date: 2026-06-12

Scope: `packages/renderer/src`

Constraint: `ActivityBar` visual style must remain unchanged. If its menu logic is ever migrated, keep the existing left rail layout, sizing, colors, icons, hover behavior, and active state intact.

## Current State

The renderer is a Vite React app with Tailwind v4 and a mostly custom component layer. The shadcn CLI detects this repository as a `Manual` project, not an initialized shadcn project. There is no `components.json`, no standard alias such as `@/components/ui`, and no existing shadcn registry component set.

Because of that, the safest direction is:

1. Do not run `shadcn init` unless we explicitly decide to adopt its project config.
2. Keep using local wrappers under `packages/renderer/src/components/ui`.
3. Use `radix-ui` primitives behind those wrappers.
4. Expose shadcn-compatible public CSS tokens and map them onto the existing Nexusky theme variables, so copied shadcn-style components can use `--background`, `--foreground`, `--card`, `--popover`, `--primary`, `--secondary`, `--muted`, `--border`, `--input`, `--ring`, and `--radius` without replacing the current glass theme.
5. Keep the existing Nexusky `--accent` as the app's primary theme color because ActivityBar and many existing surfaces already depend on that meaning. Tailwind's shadcn `bg-accent` semantic maps through `--color-accent` to the compatibility accent surface instead of redefining the legacy app token.

Already added:

- `radix-ui` dependency.
- `cmdk` dependency.
- `Button`, `Badge`, `Dialog`, `ScrollArea`, `AlertDialog`, `Alert`, `Tabs`, `Command`, `DropdownMenu`, `ContextMenu`, `Sheet`, `Popover`, `Tooltip`, `Input`, `Textarea`, `Slider`, `Progress`, `Skeleton`, `Spinner`, `Empty`, and `Card` wrappers.
- The shared `Button` wrapper now forwards refs so it can be used safely as a Radix `asChild` trigger/action.
- `MemoryTimelinePanel` now uses those wrappers, including shared `Badge` for tier/count labels, shared `Tooltip` for source hints, shared `Spinner` for its loading state, and shared `Empty` for its empty state.
- `ConfirmModal` now uses `AlertDialog`.
- Settings shell now uses `Dialog`, `ScrollArea`, and shared `Button` for the Radix close action.
- Settings sidebar now uses `Tabs`.
- AI provider editor now uses `Dialog`, `Button`, `Badge`, `Input`, and `Select`.
- Publish scope dialog now uses `Dialog`, `ScrollArea`, `Button`, `ToggleGroup`, `Input`, `Badge`, `Tooltip`, `Empty`, `Spinner`, and the shared `ConfirmModal`, including the preview and issue list scroll regions.
- Settings page controls now use local `Switch`, `Checkbox`, `RadioGroup`, `Select`, `ToggleGroup`, `Input`, `Button`, `Spinner`, `Empty`, and `Card` where appropriate.
- `GraphGenerator`, `TrashPanel`, `Onboarding`, and `SearchPanel` now use `Dialog`/`ScrollArea` and shared controls for their overlay shells/actions; `Onboarding` uses `DialogDescription` for step copy, `TrashPanel` also uses shared `Empty`, and `GraphGenerator` also uses shared `Badge` for selected-file chips, shared `Spinner` for generation status, and shared `ScrollArea` for generated code output.
- `CommandPalette` and `QuickSwitcher` now use `Dialog` + `Command` instead of custom overlay/input/list keyboard handling.
- `NotificationCenter` snooze actions now use `DropdownMenu`.
- The shared coordinate-based `ContextMenu` compatibility layer now uses the local Radix `ContextMenu` wrapper while keeping the old `{ x, y, items, onClose }` caller API.
- `NotificationCenter` drawer now uses the local `Sheet` wrapper with the existing lightweight non-modal visual treatment.
- `AIWritingMenu` preview now uses `Dialog` and shared `ScrollArea` panes; its selection action bar now uses a coordinate-anchored `Popover`; preview close/footer actions and selection action buttons now use shared `Button`; selection action hints use shared `Tooltip`; preview streaming status uses shared `Spinner` while preserving streaming cancellation and editor replace/append/copy behavior.
- `RelatedContextPanel` context-pack summary and tiers now use shared `Button`/`Tabs`; panel counts, pack summary counts, tier counts, and relation labels use shared `Badge`; pack tier items and related context cards now use shared `Card`; pack tier empty state uses shared `Empty`; panel navigation/refresh icon actions and related context card title/open/feedback actions use shared `Tooltip`; loading placeholders use shared `Skeleton`; error state uses shared `Alert`.
- `GraphPanel` side controls now use shared `Input`, `Button`, `Select`, `Switch`, and `Tooltip` wrappers for graph search, panel actions, scope/group hints, minimum-link filtering, group visibility, display toggles, and edge-type toggles. Graph canvas interaction layers remain custom.
- `GraphView` zoom toolbar actions now use shared `Button` and `Tooltip`, and the no-data state uses shared `Empty`, while preserving the graph canvas node buttons, pan/zoom math, drag behavior, and raster renderer as custom interaction layers.
- `GraphMaintenanceNudge` now uses shared `Button` and `Tooltip` for focus pills, clear, collapse, and expand controls while preserving graph canvas behavior.
- `AgentRunPanel` goal/description and plan edit fields now use shared `Textarea`/`Input`, action controls and history row open actions use shared `Button`, dry-run option uses shared `Checkbox`, history rows and plan/execute step rows use shared `Card`, plan count and plan/execute step labels use shared `Badge`, and empty states use shared `Empty`; the existing agent workflow layout remains custom.
- `ToolResultPanel` now uses non-modal shared `Sheet`, shared `Button` for copy/close/source actions, shared `Tooltip` for close/source hints, and `ScrollArea` for the result body while keeping the right-bottom result drawer behavior.
- `HistoryPanel` now uses shared `Button` for preview/restore/navigation actions, shared `Badge` for the history count, `ScrollArea` for history and preview scrolling, and `Empty` for no-file/no-history states.
- `TagsPanel` now uses shared `Card` for the current-file tag section, plus shared `Input`, `Button`, `Badge`, `ScrollArea`, `Tooltip`, and `Empty`; current tags, tag counts, tag chip/list styles were moved into token-based local CSS.
- `VaultHealthScreen` action controls now use shared `Button` for skip and next-step actions, status/kicker chips use shared `Badge`, state/hero/driver/metric/next-step panels use shared `Card`, and the no-issue driver state uses shared `Empty`, with styling aligned to shared tokens.
- `ErrorBoundary` now uses shared `Card` for the fallback surface, shared `Alert` for the error callout, and shared `Button` for retry, with the fallback layout kept in token-based local CSS.
- `ChatSourceRow` now uses shared `Card` for citation lookup explanation/result sections, shared `Button`, `Popover`, `Tooltip`, `ScrollArea`, `Spinner`, and compact `Empty` feedback for citation lookup controls instead of custom absolute-positioned popovers, document listeners, native title hints, and ad hoc loading/empty text.
- `LongContextDebugPanel` now uses shared `Card` for inspector/metrics/tuning sections, pack items, and metric tiles; shared `Tabs` for pack tier switching; shared `Slider` for tuning controls; shared `Button` for tuning actions; shared `Badge` for tier/token count feedback; shared `Tooltip` for metric trend hints; and shared `Empty`/`Spinner` for empty and loading states, with local observability styles mapped to shadcn semantic tokens.
- `ProactivePreferences` now uses shared `Card` for preference groups, shared `Input`, `Slider`, `Checkbox`, `Button`, `Spinner`, and `Empty` controls, with the settings form/loading styling moved from inline objects into token-based proactive CSS.
- `LongContextSettings` numeric fields, the Appearance custom accent text field, and the Keys key-capture field now use shared `Input` while preserving the existing save flow and settings layout.
- `AppearanceSettings` theme, accent, and language option surfaces now read from shadcn-compatible `--card`, `--border`, `--primary`, `--secondary`, and radius tokens while retaining the existing `RadioGroup` selection behavior.
- Settings tab sections now use a shared `SettingsSection` composed with the local `Card` wrapper, so panel border/radius/background styling reads from shadcn-compatible `--card`, `--border`, and `--radius-*` tokens.
- `CloudSyncSettings`, `PluginsSettings`, `ProactiveSettings`, and `LongContextSettings` loading states now use a shared `SettingsLoadingState` composed with shared `Empty`/`Spinner` primitives and compact settings-local spacing.
- `ProactiveSettings` category option rows now use shared `Card`, and its frequency/category option surfaces read from shadcn-compatible color and radius tokens.
- `CloudSyncSettings` sync error state now uses shared `Alert` instead of custom error markup.
- `CloudSyncSettings` info/config/status panels and `PluginsSettings` plugin rows now use shared `Card`, and plugin version labels now use shared `Badge`.
- `PluginsSettings` and `KeysSettings` empty states now use shared `Empty` primitives instead of custom empty-state markup.
- `KeysSettings` keybinding rows now use shared `Card` while retaining the compact two-column settings layout and existing key capture/reset controls.
- Settings CSS no longer carries legacy native checkbox selectors for `form-toggle` and `category-item`; those settings controls now rely on shared `Switch`/`Checkbox` token styling.
- Removed the unmounted legacy `Settings.old.tsx` implementation so the active settings surface no longer carries a parallel custom-control copy.
- `WelcomeScreen` now uses shared `Input` for vault-name creation, shared `Button` for demo, open/create, recent vault, and sample vault actions, and shared `Tooltip` for recent vault path hints while preserving its existing entry-page styling.
- `TimelineView` now uses shared `ScrollArea` for the main content scroll, shared `Input` for timeline search, shared `ToggleGroup` for updated/created mode switching, shared `Button` for refresh and row actions, shared `Badge` for tag chips, and shared `Empty` for no-result state while preserving the custom timeline row grid/marker layout.
- `NotificationCenter` now uses shared `Button` for bell, bulk actions, close, open, snooze, and dismiss controls; bell and drawer close icon actions use shared `Tooltip`; suggestion items use shared `Card`; bell count, drawer count, and suggestion kind labels use shared `Badge`; drawer empty state uses shared `Empty`; notification button styling now reads from shadcn semantic tokens.
- `DemoTransformationFlow` now uses shared `Dialog` for the demo modal shell, shared `Card` for sample cards, issue rows, comparison columns, and fixes summary, shared `Button` for close, sample selection, fix, and done actions, shared `Spinner` for the scan state, and shared `Badge` for scenario/problem count labels.
- `MessageBubble` now uses shared `Button` and `Tooltip` for assistant copy, continue, and regenerate actions, and shared `Spinner` for in-progress plan rows, with hover/loading styling moved into local token-based CSS.
- `ChatMessages` now uses shared `Button` for empty-state prompt hints and shared `Spinner` for streaming/tool status, with hover/loading styling moved into local token-based CSS.
- `SearchPanel` search input now uses shared `Input`, result rows use shared `Button`, local search-index progress uses shared `Progress`, and result-area loading/empty states use shared `Spinner`/`Empty`, while preserving the existing transparent search slot, keyboard navigation, async search, and result selection behavior.
- `Toast` notification close controls now use shared `Button` and `Tooltip` while keeping the lightweight local toast store and compact glass popover styling.
- `VaultOverview` header refresh action now uses shared `Button` while leaving overview card/chart glass styling untouched.
- `BasesView` toolbar search, inline property edit fields, toolbar actions, tag/sort filters, column picker actions, column picker checkbox items, tag lens controls, note title actions, inline edit targets, property pills, inline edit hints, main content scrolling, and main empty/loading state now use shared `Input`, `Button`, `Select`, `DropdownMenu`, `Badge`, `Tooltip`, `ScrollArea`, `Empty`, and `Spinner`.
- `ChatPanel` outbound preview actions, chat header actions, session list actions, batch-plan controls, folder picker actions, edit preview actions, mention result rows, attached note/document chips, attachment removal controls, and composer icon actions now use shared `Button`/`ToggleGroup`/`Input`/`Badge` where appropriate while preserving the compact glass chat layout and existing hover colors.
- `FindReplace` editor popover fields now use shared `Input`, actions use shared `Button`, and icon actions use shared `Tooltip`, while preserving the compact floating editor tool layout and existing find/replace logic.
- `PropertiesPanel` frontmatter fields now use shared `Input`/`Textarea`, save/reset actions use shared `Button`, panel scrolling uses shared `ScrollArea`, and the no-current-file state uses shared `Empty`, while preserving the existing frontmatter parsing and save flow.
- `BacklinksPanel` now uses shared `Button` for the collapse header, outgoing row jumps, target open/create actions, and unlinked-mention conversion actions while preserving its compact link overview layout.
- `OutlinePanel` now uses shared `ScrollArea`, `Button`, and `Tooltip` for heading navigation rows while preserving heading-level indentation, compact row sizing, and editor jump events.
- `TagBar` now uses shared `Input` for inline tag entry, shared `Button` for tag removal/add-tag controls, and shared `Tooltip` for icon action hints while preserving its compact chip layout and frontmatter update behavior.
- `EditorTabs` close actions now use shared `Button` and `Tooltip` while preserving the custom tab drag/reorder, middle-click close, and coordinate context menu behavior.
- `SlashCommandMenu` command rows now use shared `Button`, and the floating command list now uses shared `ScrollArea`, while preserving the existing slash trigger positioning, keyboard navigation, filtering, and command execution logic.
- `Editor` shell actions now use shared `Button` for empty-state quick actions, split-pane close, and sync status, with shared `Tooltip` for sync status hints, while preserving the TipTap editor surface and markdown rendering behavior.
- `EditorToolbar` formatting, insert, voice, preview, side-panel, history, and export actions now use shared `Button` and `Tooltip`, and voice transcription now uses shared `Spinner`, while preserving compact toolbar sizing and TipTap command behavior.
- `Sidebar` shell controls now use shared `Input` for create/filter fields, shared `DropdownMenu` for the vault switcher, shared `Button` for create actions, sort/expand controls, favorites, and file-error recovery, and shared `Tooltip` for shell action hints while preserving the existing file tree and virtual scrolling behavior.
- `FileTree` and `VirtualFileTree` rename/create inputs now use shared `Input`, row/more-action controls use shared `Button`, and more-action hints use shared `Tooltip`, while preserving tree drag/drop, expand/collapse, context menu coordinates, row height, selection, virtual scrolling, and active-file behavior.
- `ActivityBar` rail and settings buttons now use shared `Button` as a thin control wrapper while preserving the existing rail sizing, liquid active indicator, icon styling, hover colors, and active-state logic.
- `ActivityBar` keeps `Overview` pinned as the first primary item, and the workspace default-layout migration now re-applies the overview-first landing state for existing local layouts.
- App shell right-panel close action now uses shared `Button`; native `TitleBar` window controls remain intentionally custom.
- Renderer root now mounts the shared `TooltipProvider` around the app shell so all local `Tooltip` usages satisfy Radix provider requirements.
- `globals.css` now exposes a shadcn-compatible token bridge on top of the existing Nexusky theme variables, including Tailwind v4 `@theme inline` color/radius mappings.
- `components/ui/ui.css` now consumes shadcn public semantic tokens for shared component color, ring, border, panel background, and radius while preserving Nexusky glass blur/shadow variables.

Reference docs checked through `pnpm dlx shadcn@latest docs`:

- `button`, `badge`, `dialog`, `scroll-area`
- `alert-dialog`, `context-menu`, `dropdown-menu`, `tabs`
- `command`, `sheet`, `popover`, `tooltip`
- `select`, `switch`, `checkbox`, `radio-group`, `toggle-group`
- `input`, `textarea`
- `slider`
- `progress`
- `skeleton`
- `spinner`
- `empty`
- `alert`
- `card`

## Replacement Principles

Use Radix where it removes hard manual interaction work:

- Focus trapping, Escape handling, overlay dismissal.
- Keyboard navigation in menus, tabs, command lists, radio groups.
- ARIA roles and state attributes.
- Controlled/uncontrolled state consistency.
- Portal and stacking behavior.

Do not use Radix where native behavior is tightly coupled to custom logic:

- Editor scrolling and cursor visibility.
- Virtualized file trees that depend on exact `scrollTop`.
- Graph/canvas interactions.
- Native titlebar/window controls.

Use local wrappers rather than raw Radix imports in feature code. This keeps tokens, sizes, focus rings, and density consistent.

For styling new shared components, prefer the shadcn semantic token layer first:

- Surface: `--background`, `--card`, `--popover`, `--secondary`, `--muted`
- Text: `--foreground`, `--card-foreground`, `--popover-foreground`, `--secondary-foreground`, `--muted-foreground`
- Action/state: `--primary`, `--primary-foreground`, `--destructive`, `--destructive-foreground`, `--ring`
- Structure: `--border`, `--input`, `--radius`, `--radius-sm`, `--radius-md`, `--radius-lg`, `--radius-xl`

Keep Nexusky glass-specific tokens for the glass effect itself:

- Blur/shadow/highlight: `--glass-blur`, `--glass-blur-strong`, `--glass-panel-border`, `--glass-panel-edge-shadow`, `--shadow-popover`

Do not repurpose ActivityBar's active-state variables through shadcn tokens. Its visual style is intentionally independent.

## Priority Matrix

### P0: High-Value, Low-Risk

These replace duplicated modal/menu logic and improve accessibility immediately.

| Area | Current file | Current pattern | Recommended primitive | Notes |
| --- | --- | --- | --- | --- |
| Confirm dialogs | `components/ConfirmModal.tsx` | Custom overlay, manual Escape/Enter, inline buttons | `AlertDialog` + `Button` | Best first migration. Used by delete/restore flows. |
| Settings shell | `components/settings/Settings.tsx` | Custom dialog, manual focus, manual Escape | `Dialog` + `ScrollArea` | Preserve current CSS shape, replace interaction shell. |
| Settings tabs | `components/settings/SettingsSidebar.tsx` | Manual `role="tablist"` buttons | `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` | Good keyboard win: arrows, Home/End if implemented by Radix. |
| AI provider editor | `components/settings/AIProviderSettings.tsx` | Custom provider modal | `Dialog` + `Button` + `Badge` + `Input` + `Select` | Done for editor shell, provider fields, model field, provider type/model selects, and provider actions. Request/probing logic remains domain-specific. |
| Publish dialog | `components/PublishScopeDialog.tsx` | Custom `role="dialog"`, manual focus/overlay | `Dialog` + `ScrollArea`; nested destructive confirm via `AlertDialog` | Good candidate but larger file, split into steps. |
| Memory timeline | `components/memory/MemoryTimelinePanel.tsx` | Already migrated partly | Already uses `Dialog`, `ScrollArea`, `Button`, `Badge`, `Tooltip`, `Spinner`, `Empty` for modal shell, timeline actions, tier/count labels, source hints, loading, and empty states. |

### P1: Strong Candidates, Moderate Effort

These have more custom keyboard behavior or more UI branches.

| Area | Current file | Current pattern | Recommended primitive | Notes |
| --- | --- | --- | --- | --- |
| Command palette | `components/CommandPalette.tsx` | Custom overlay, input, selected index, scrollIntoView | `Dialog` + `Command` | shadcn `Command` uses `cmdk`; requires adding `cmdk`. High UX value. |
| Quick switcher | `components/QuickSwitcher.tsx` | Custom modal list, keyboard index handling | `Dialog` + `Command` | Similar to command palette, likely share a common command surface. |
| Search panel | `components/SearchPanel.tsx` | Custom overlay, search input, mode buttons, result list keyboard | `Dialog` + `Input` + `ToggleGroup` + `ScrollArea` + `Button` + `Progress` + `Empty` + `Spinner` | Done for shell, search input, mode controls, result rows, local index progress, and result-area loading/empty states. Full `Command` may be too restrictive due async search modes. |
| Context menus | `components/ContextMenu.tsx` | Manual fixed menu, manual outside click/Escape | `ContextMenu` or `DropdownMenu` | Good, but coordinate-based callers need a careful bridge. |
| Graph generator modal | `components/GraphGenerator.tsx` | Custom glass overlay/modal | `Dialog` + `ScrollArea` + `Badge` + `Spinner` | Done for modal shell, selected-file chips, generation status, and generated code output scrolling. Streaming graph generation content remains domain-specific. |
| Trash modal | `components/TrashPanel.tsx` | Custom overlay/list | `Dialog` + `ScrollArea` + `AlertDialog` + `Empty` | Done for dialog shell, scroll area, empty state, and destructive confirmation through shared `ConfirmModal`. |
| Onboarding modal | `components/Onboarding.tsx` | Custom overlay/popover | `Dialog` | Done for the modal shell, title, step description, and step actions. Step illustrations remain custom SVG content. |
| AI writing preview | `components/editor/AIWritingMenu.tsx` | Custom modal + floating menu | `Dialog`, `ScrollArea`, `Popover`, `Button`, `Tooltip`, `Spinner` | Done for preview shell, preview scroll panes, floating selection action bar, preview close/footer actions, inline action buttons, action hints, and preview streaming status. Streaming cancellation and editor replace/append/copy behavior remain custom. |

### P2: Useful, But Should Wait

These need design cleanup or affect many small controls.

| Area | Current file | Recommended primitive | Notes |
| --- | --- | --- | --- |
| Notification center | `components/proactive/NotificationCenter.tsx` | `Sheet`, `DropdownMenu`, `Card`, `Button`, `Badge`, `Empty`, `Tooltip` | Done for drawer shell, snooze menu, suggestion item cards, bell, bulk actions, close, open, snooze, dismiss controls, bell/close tooltips, drawer/bell/kind badges, and empty state. |
| Related context tabs | `components/long-context/RelatedContextPanel.tsx` | `Tabs`, `ScrollArea`, `Card`, `Button`, `Badge`, `Skeleton`, `Alert`, `Empty`, `Tooltip` | Done for pack summary/tier tabs, pack item cards, count badges, controls, compact pack empty state, panel navigation/refresh tooltips, loading placeholders, and error alert. Native list scrolling remains to preserve side/page layout sizing. |
| Long context badges | `components/long-context/LongContextBadge.tsx` | `Badge` | Done. Uses local Badge with existing class styling. |
| Long context debug panel | `components/observability/LongContextDebugPanel.tsx` | `Card`, `Tabs`, `Slider`, `Button`, `Badge`, `Tooltip`, `Empty`, `Spinner` | Done for inspector/metrics/tuning section cards, pack item cards, metric tiles, pack tier switching, tuning sliders, tuning actions, tier/token count feedback, metric trend hints, empty states, and loading states. |
| Related context card actions | `components/long-context/RelatedContextCard.tsx` | `Card`, `Button` with `variant="ghost"` and `size="icon"`, `Tooltip` | Done for card surfaces, title/open, and icon feedback actions. Icon feedback actions now use shared tooltip content with aria-labels retained. |
| Graph side panel controls | `components/graph/GraphPanel.tsx` | `Input`, `Button`, `Select`, `Switch`, `Tooltip` | Done for graph search, side-panel controls, scope hints, and group visibility hints. Graph canvas, pan/zoom, and node interaction layers remain custom. |
| Graph canvas toolbar | `components/graph/GraphView.tsx` | `Button`, `Tooltip`, `Empty` | Done for zoom out, reset, zoom in, fit-view toolbar actions and hints, plus the no-data empty state. Graph node buttons and canvas interaction layers remain custom. |
| Graph maintenance nudge | `components/graph/GraphMaintenanceNudge.tsx` | `Button`, `Tooltip` | Done for focus, clear, collapse, and expand controls plus action hints. Graph canvas interaction layers remain custom. |
| Agent run controls | `components/agent/AgentRunPanel.tsx` | `Input`, `Textarea`, `Button`, `Checkbox`, `Card`, `Badge`, `Empty` | Done for goal/description fields, plan edit fields, action buttons, history row open actions, dry-run checkbox, history rows, plan/execute step cards, plan count, plan/execute step labels, and empty states. Execution workflow layout remains custom. |
| Bases controls | `components/bases/BasesView.tsx` | `Input`, `Button`, `Select`, `DropdownMenu`, `Badge`, `Tooltip`, `ScrollArea`, `Empty`, `Spinner` | Done for toolbar search, inline property edit fields, toolbar actions, tag/sort filters, column picker dropdown/actions, column picker checkbox items, tag lens controls, note title actions, inline double-click edit targets, property pills, inline edit hints, main content scrolling, and main empty/loading state. |
| Settings page controls | `components/settings/pages/*` | `Switch`, `Checkbox`, `RadioGroup`, `Select`, `Input`, `Button`, `Card`, `Spinner`, `Empty`, `Alert` | Done for core switch/select/button controls, `LongContextSettings` numeric inputs, the Appearance custom accent text field and tokenized option surfaces, Proactive category row cards and tokenized option surfaces, the Keys key-capture field and keybinding row cards, shared settings page loading states, plugin/keybinding empty states, and CloudSync sync errors. Remaining native inputs are specialized native color picker only. |
| Proactive preferences | `components/proactive/ProactivePreferences.tsx` | `Card`, `Input`, `Slider`, `Checkbox`, `Button`, `Spinner`, `Empty` | Done for preference group cards, silent-hour fields, threshold sliders, enable/per-kind options, loading state, and debug/reset actions while preserving save-on-change behavior. |

### P3: Optional / Polish

These are lower impact or more visual than behavioral.

| Area | Candidate primitive | Notes |
| --- | --- | --- |
| Tool result panel | `Sheet`, `Card`, `Button`, `Tooltip`, `ScrollArea` | Done with `modal={false}` and no overlay. Source sections now use shared Card; it keeps the right-bottom non-modal result drawer behavior, close/source tooltips, and prevents outside interactions from dismissing it. |
| Vault health actions | `Button`, `Badge`, `Empty`, `Card`, `Progress` | Button migration done for skip and next-step actions. Badge migration done for scan steps, hero signals, and next-step kickers. Empty migration done for no-issue driver state. Card migration done for state, hero, drivers, metrics, and next-step panels. Progress remains optional visual polish. |
| Overview cards | `Card`, `Badge` | Header refresh action now uses shared `Button`. Be careful: user has been tuning glass/hover details manually. |
| History panel | `Card`, `Button`, `Badge`, `ScrollArea`, `Empty` | Done. Snapshot rows now use shared Card; kept the lightweight side-panel behavior and moved inline/count/empty styles into local token-based CSS. |
| Tags panel | `Card`, `Input`, `Button`, `Badge`, `ScrollArea`, `Tooltip`, `Empty` | Done. Current-file tag section, current tag input, tags, tag count badges, tag action tooltips, tag cloud, empty state, and filtered note list now use shared components with local token-based CSS. |
| Error boundary | `Card`, `Alert`, `Button` | Done. Fallback surface uses shared Card, error callout uses shared Alert, retry action uses shared Button, and fallback layout remains token-based local CSS. |
| Citation source row | `Card`, `Button`, `Popover`, `Tooltip`, `ScrollArea`, `Spinner` | Done. Citation lookup explanation/results now use shared Card sections inside a shared Popover with token-based local CSS, shared action hints, and shared loading feedback. |
| Welcome screen | `Input`, `Button`, `Tooltip` | Done for vault-name creation input plus demo, open/create, recent vault, sample vault actions, and recent vault path hints. Existing entry-page layout and visual classes remain in place. |
| Timeline view controls | `ScrollArea`, `Input`, `ToggleGroup`, `Button`, `Badge`, `Empty` | Done for main content scrolling, search, mode switching, refresh, row actions, tag chips, and empty state. Timeline rows still keep custom grid and marker layout through local styles. |
| Demo flow | `Dialog`, `Card`, `Button`, `Badge`, `Spinner`, `Progress` | Dialog/Button migration done for modal shell, close, sample selection, fix, and done actions. Card migration done for sample cards, issue rows, comparison columns, and fixes summary. Scenario/problem count labels now use shared `Badge`; scan loading uses shared `Spinner`; progress remains custom. |
| Message bubble actions | `Button`, `Tooltip`, `Spinner` | Done for assistant copy, continue, and regenerate controls with shared tooltips, plus in-progress plan row spinner. Message body layout remains inline because it is role/content dependent. |
| Chat message prompt hints | `Button`, `Spinner` | Done for empty-state prompt hint actions and streaming/tool status feedback. Streaming message layout remains custom. |
| Chat panel actions and batch inputs | `Button`, `ToggleGroup`, `Input`, `Badge` | Done for outbound preview actions, chat header actions, session list actions, batch-plan controls, batch-plan directory/topic/count inputs, folder picker actions, folder-picker new-directory input, edit preview actions, mention result rows, attached note/document chips, attachment removal controls, and composer icon actions. ChatPanel no longer uses raw `<button>` elements. Composer textarea and hidden file input remain native by design. |
| Find/replace controls | `Input`, `Button`, `Tooltip` | Done for find/replace fields, case sensitivity, previous/next, close, replace, replace-all actions, and icon action hints. Editor text selection and search logic remain custom. |
| Properties panel controls | `Input`, `Textarea`, `Button`, `ScrollArea`, `Empty` | Done for title, aliases, tags, cssclasses, save, reset, panel scrolling, and no-current-file empty state. Frontmatter parsing and save-to-editor behavior remain custom. |
| Backlinks panel actions | `Button` | Done for collapse, outgoing row jumps, target open/create, batch convert, item jump, and single mention conversion actions. The list layout remains custom. |
| Outline panel rows | `ScrollArea`, `Button`, `Tooltip` | Done for panel scrolling, heading navigation rows, and truncated heading hints. Heading parsing and editor jump events remain custom. |
| Tag bar controls | `Input`, `Button`, `Tooltip` | Done for inline tag entry, remove-tag, add-tag controls, and icon action hints. Frontmatter update flow remains custom. |
| Editor tab close actions | `Button`, `Tooltip` | Done for per-tab close controls and close tooltips. The draggable tab container and context menu remain custom. |
| Slash command rows | `ScrollArea`, `Button` | Done for command list scrolling and row actions. The TipTap slash trigger, filtering, active-index keyboard handling, and fixed popover positioning remain custom. |
| Editor shell actions | `Button`, `Tooltip` | Done for empty-state quick actions, split-pane close, sync status, and sync status hints. TipTap content, markdown rendering, and editor scrolling remain custom. |
| Editor toolbar actions | `Button`, `Tooltip`, `Spinner` | Done for formatting, insert, voice input, preview, side-panel, history, export actions, and toolbar action hints. Voice transcription uses shared Spinner. TipTap command wiring and compact toolbar sizing remain custom. |
| Publish scope inputs | `Input`, `Badge`, `Tooltip`, `ScrollArea`, `Empty`, `Spinner` | Done for folder, tag, property key, property value filters, current target path hints, and preview/issue list scrolling while preserving native `datalist` suggestions and publish preview/publish flow. Preview panel loading/empty states, child-list empty states, and status badge now use shared feedback primitives. |
| Sidebar shell controls | `Input`, `DropdownMenu`, `Button`, `Tooltip` | Done for create/filter fields, vault switcher dropdown, create file/folder actions, sort/collapse/expand controls, favorites, file-error recovery, and shell action hints. File tree row rendering and virtual scrolling remain custom. |
| File tree rows | `Input`, `Button`, `Tooltip` | Done for `FileTree` and `VirtualFileTree` rename/create inputs, row and more-action controls, and more-action hints. Drag/drop, context menu coordinates, expand/collapse, active row state, multi-select, and virtual scroll math remain custom. |
| ActivityBar controls | `Button` | Done as a thin wrapper only. Existing rail layout, liquid indicator, dimensions, hover colors, and active-state logic remain custom and visually unchanged. Overview remains the pinned first item and the default landing view. |
| App shell panel actions | `Button` | Done for right-panel close action. `TitleBar` native window controls remain custom by design. |
| Toast system | Radix `Toast` or `sonner` | Close action now uses shared `Button` and `Tooltip`. Bigger architecture move remains optional because the current local toast store is lightweight. |

## Components to Add Next

Recommended local wrappers under `packages/renderer/src/components/ui`:

1. `alert-dialog.tsx` - done
   - Wrap `radix-ui` `AlertDialog`.
   - Use existing `Button`.
   - Needed by `ConfirmModal`.

2. `tabs.tsx` - done
   - Wrap `radix-ui` `Tabs`.
   - Add CSS classes for vertical settings layout and compact horizontal tabs.
   - Needed by Settings and long-context packs.

3. `context-menu.tsx` - done
   - Wrap `radix-ui` `ContextMenu`.
   - Support item shape: `label`, `icon`, `danger`, `disabled`, `onSelect`.
   - Needed by `ContextMenu.tsx` replacement.

4. `dropdown-menu.tsx`
   - Done.
   - Used by `NotificationCenter` snooze actions.
   - Also used by the sidebar vault switcher.
   - Also used by the Bases column picker.
   - Still useful for small action menus.

5. `toggle-group.tsx` - done
   - Wrap `radix-ui` `ToggleGroup`.
   - Needed by Search mode controls and appearance option groups.

6. `switch.tsx`, `checkbox.tsx`, `radio-group.tsx`, `select.tsx`, `input.tsx`, `textarea.tsx`, `slider.tsx`, `progress.tsx`, `skeleton.tsx`, `spinner.tsx`, `card.tsx` - done
   - Needed for settings pages.
   - Should be introduced after the settings shell is migrated.

7. `popover.tsx`, `tooltip.tsx` - done
   - Needed for small floating menus and icon-only controls.

8. `command.tsx`
   - Done with local `cmdk` wrapper.
   - Used by `CommandPalette` and `QuickSwitcher`.

9. `sheet.tsx` - done
   - Wrap `radix-ui` `Dialog` with side-aware content.
   - Used by the proactive notification drawer.

10. `empty.tsx` - done
   - Provides shadcn-compatible empty state composition.
   - Used by settings plugin/keybinding, memory timeline, history panel, tags panel, notification drawer, agent run panel, and long-context debug empty states.

11. `alert.tsx` - done
   - Provides shadcn-compatible feedback/error state composition.
   - Used by related context and CloudSync error states.

## Detailed Migration Plan

### Phase 1: Foundation

Keep `ActivityBar` untouched.

Tasks:

1. Add wrappers:
   - `alert-dialog`
   - `tabs`
   - `context-menu`
   - `dropdown-menu`
   - `toggle-group`
2. Extend `ui.css` with shared state styles:
   - `[data-state="open"]`
   - `[data-state="active"]`
   - `[data-disabled]`
   - danger item styles
3. Add shadcn-compatible public CSS token mappings in `globals.css`.
4. Avoid global reset or shadcn theme import.

Validation:

- `pnpm run build`
- `git diff --check`
- Manual smoke test: open/close modal, Escape, outside click, Tab focus.

### Phase 2: Replace ConfirmModal

Current problem:

- Manual Escape and Enter handling.
- Manual overlay pointer tracking.
- No built-in focus trap.
- Inline styling makes design consistency hard.

Target:

```tsx
<AlertDialog open={open} onOpenChange={(next) => !next && onCancel()}>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>{title}</AlertDialogTitle>
      <AlertDialogDescription>{message}</AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>{cancelText}</AlertDialogCancel>
      <AlertDialogAction>{confirmText}</AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

Consumers:

- `TrashPanel.tsx`
- `sidebar/FileTree.tsx`
- `sidebar/VirtualFileTree.tsx`
- `PublishScopeDialog.tsx`
- `GraphView.tsx`
- `ChatPanel.tsx`

Risk:

- Enter-to-confirm behavior may change. Radix does not automatically confirm on Enter unless focus is on the action. This is usually safer.

### Phase 3: Replace Settings Shell

Current files:

- `settings/Settings.tsx`
- `settings/SettingsSidebar.tsx`
- `settings/Settings.css`

Target:

- Outer shell: `Dialog`.
- Sidebar tabs: `Tabs`.
- Content region: `TabsContent`.
- Content scroll: `ScrollArea`.
- Close button: existing `Button`.

Design constraint:

- Preserve current visual proportions and close hover behavior.
- Do not reintroduce left active border on tabs.
- Do not enlarge buttons.

Benefits:

- Focus trap.
- Escape handling.
- Better tab semantics.
- Less custom modal code.

### Phase 4: Replace Local ContextMenu

Current file:

- `components/ContextMenu.tsx`

Current usage:

- `sidebar/FileTree.tsx`
- `sidebar/VirtualFileTree.tsx`
- `sidebar/Sidebar.tsx`
- `editor/Editor.tsx`
- `sidebar/ActivityBar.tsx`

Important constraint:

- `ActivityBar` style remains unchanged. If migrated, only the menu primitive changes; the rail button rendering stays exactly as-is.

Recommended approach:

1. Create a compatibility wrapper first:
   - Keep props `{ x, y, items, onClose }`.
   - Internally render a Radix `ContextMenu` or `DropdownMenu` anchored to a virtual trigger.
2. If virtual positioning becomes awkward, use Radix `DropdownMenu` with a fixed-position wrapper first.
3. Migrate callers one by one.

Risk:

- Radix `ContextMenu` is trigger-oriented. Current code opens menus from explicit mouse coordinates. A bridge layer is needed.
- Virtualized file tree context menus need careful close behavior.

Current progress:

- `components/ui/context-menu.tsx` added.
- `components/ContextMenu.tsx` now acts as a compatibility bridge for existing coordinate-based callers.
- `ActivityBar` continues to use the shared compatibility component; its button rendering and rail styling were not migrated.
- The compatibility bridge inherits shared menu radius/color/ring tokens from `components/ui/ui.css`.

### Phase 5: Command Surfaces

Current files:

- `CommandPalette.tsx`
- `QuickSwitcher.tsx`
- `SearchPanel.tsx`

Recommended split:

- `CommandPalette` and `QuickSwitcher`: `Dialog` + shadcn `Command`.
- `SearchPanel`: `Dialog` + `ToggleGroup` + `ScrollArea` first. Consider `Command` later only for result list behavior.

Why:

- CommandPalette and QuickSwitcher are classic command-list UIs.
- SearchPanel is not only command selection; it has async search modes, index status, progress, history, and result preview.

Dependency:

- shadcn `Command` uses `cmdk`; added for `CommandPalette` and `QuickSwitcher`.

Current progress:

- `CommandPalette`: migrated to `Dialog` + `Command`.
- `QuickSwitcher`: migrated to `Dialog` + `Command`.
- `SearchPanel`: remains on `Dialog` + `ToggleGroup` + `ScrollArea`; result rows now use shared `Button`, but keep custom async search/result behavior unless its preview model is redesigned.

### Phase 6: Settings Controls

Candidate controls:

- Appearance color theme: `RadioGroup` or `ToggleGroup`.
- Binary settings: `Switch`.
- Provider enable/active states: `Button`, `Badge`, maybe `RadioGroup` only if a single active provider must be explicit.
- Select fields: `Select`.
- Checkboxes: `Checkbox`.

Rule:

- Do not convert every input at once. Start with one settings page and establish density, label layout, error states, and disabled states.

Current progress:

- Current settings pages use local `Switch`, `Checkbox`, `RadioGroup`, `Select`, `ToggleGroup`, `Button`, and `Card` wrappers where applicable.
- Shared settings controls now inherit shadcn-compatible radius and semantic color tokens through `components/ui/ui.css`.
- Shared settings section panels now inherit shadcn-compatible card, border, and radius tokens through `SettingsSection` and `components/ui/card.tsx`.
- Legacy native checkbox selectors were removed from `Settings.css` after the active settings pages moved to shared controls.
- The legacy unmounted `Settings.old.tsx` copy has been removed. `ProactivePreferences` and `LongContextDebugPanel` now use shared wrappers for their active controls and compact feedback labels, except for domain-specific rendering and layout.

## Do Not Replace Yet

### ActivityBar

Do not alter visual rendering. The user explicitly asked to keep it unchanged.

Possible future safe change:

- Replace only the right-click menu internals with the shared context menu wrapper.
- Keep `ActivityBar.tsx` button DOM/styling stable.
- Keep `Overview` pinned first; opening the file sidebar should activate `Files`, not leave `Overview` highlighted.

### VirtualFileTree Scroll Container

Do not replace the main scroll container with Radix `ScrollArea` right now.

Reason:

- It relies on exact `scrollTop`, item height, overscan, and keyboard scrolling.
- Radix wraps content in a viewport. It can work, but requires a careful ref rewrite and regression testing.

### Editor Scroll Container

Do not replace editor scroll with Radix `ScrollArea`.

Reason:

- Tiptap selection and cursor scroll logic depend on DOM container behavior.
- Editor has explicit scroll-to-cursor and context menu handling.

### Chat Composer and Upload Inputs

Do not replace the ChatPanel composer textarea or hidden file input yet.

Reason:

- The composer textarea owns auto-height, paste handling, Enter-to-send, Escape-to-dismiss, and mention-list keyboard behavior.
- The hidden file input is a native upload trigger with file type filtering and multiple attachment handling.
- Regular ChatPanel batch-plan and folder-picker fields are safe to migrate and now use the shared `Input` wrapper.

### Graph Canvas / GraphView

Do not replace graph interaction layers with Radix.

Reason:

- Canvas/pointer/zoom interactions are domain-specific.
- Radix is useful for surrounding menus/dialogs, not the graph core.

### TitleBar

Do not replace native window controls.

Reason:

- It controls Electron window behavior and platform-like hit targets.

## Suggested Implementation Order

1. `AlertDialog` wrapper and `ConfirmModal` replacement.
2. `Dialog` migration for Settings shell.
3. `Tabs` migration for SettingsSidebar.
4. `Dialog` migration for `AIProviderSettings` editor modal.
5. `Dialog` migration for `PublishScopeDialog`.
6. Shared `ContextMenu` wrapper.
7. Command palette and quick switcher. - done
8. Search panel controls.
9. Settings form controls.
10. Proactive notification sheet/dropdowns. - done

## Quality Checklist

For every migration:

- Escape closes overlays.
- Outside click behavior matches current behavior.
- Focus returns to the trigger when possible.
- Tab order is predictable.
- Arrow-key behavior works for menus/tabs/lists.
- Dialog has a visible or screen-reader `Title`.
- No ActivityBar visual changes.
- No new hardcoded raw colors in feature components.
- `pnpm run build` passes.
- `pnpm run typecheck` result is checked.

## Current Known Typecheck Issue

None. The previous `"bases"` / `MainView` mismatch has been resolved by making `bases` a real main view and rendering `BasesView` from the app shell.
