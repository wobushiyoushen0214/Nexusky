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
- `Button`, `Badge`, `Dialog`, `ScrollArea`, `AlertDialog`, `Tabs`, `Command`, `DropdownMenu`, `ContextMenu`, `Sheet`, `Popover`, and `Tooltip` wrappers.
- `MemoryTimelinePanel` now uses those wrappers.
- `ConfirmModal` now uses `AlertDialog`.
- Settings shell now uses `Dialog` and `ScrollArea`.
- Settings sidebar now uses `Tabs`.
- AI provider editor now uses `Dialog`, `Button`, and `Badge`.
- Publish scope dialog now uses `Dialog`, `ScrollArea`, `Button`, and the shared `ConfirmModal`.
- Settings page controls now use local `Switch`, `Checkbox`, `RadioGroup`, `Select`, `ToggleGroup`, and `Button` where appropriate.
- `GraphGenerator`, `TrashPanel`, `Onboarding`, and `SearchPanel` now use `Dialog`/`ScrollArea` and shared controls for their overlay shells/actions.
- `CommandPalette` and `QuickSwitcher` now use `Dialog` + `Command` instead of custom overlay/input/list keyboard handling.
- `NotificationCenter` snooze actions now use `DropdownMenu`.
- The shared coordinate-based `ContextMenu` compatibility layer now uses the local Radix `ContextMenu` wrapper while keeping the old `{ x, y, items, onClose }` caller API.
- `NotificationCenter` drawer now uses the local `Sheet` wrapper with the existing lightweight non-modal visual treatment.
- `AIWritingMenu` preview now uses `Dialog`; its selection action bar now uses a coordinate-anchored `Popover`.
- `RelatedContextPanel` context-pack summary and tiers now use shared `Button`/`Tabs`; related context card actions use shared `Button`; relation labels use shared `Badge`.
- `GraphPanel` side controls now use shared `Button`, `Select`, and `Switch` wrappers for panel actions, minimum-link filtering, group visibility, display toggles, and edge-type toggles. Graph canvas interaction layers remain custom.
- `GraphMaintenanceNudge` now uses shared `Button` for focus pills, clear, collapse, and expand controls while preserving graph canvas behavior.
- `AgentRunPanel` action controls now use shared `Button`, and the dry-run option uses shared `Checkbox`; the existing agent workflow/editor layout remains custom.
- `ToolResultPanel` now uses shared `Button` for copy/close/source actions and `ScrollArea` for the result body while keeping the non-modal result drawer behavior.
- `HistoryPanel` now uses shared `Button` for preview/restore/navigation actions and `ScrollArea` for history and preview scrolling.
- `TagsPanel` now uses shared `Button`, `Badge`, and `ScrollArea`; inline tag chip/list styles were moved into token-based local CSS.
- `VaultHealthScreen` action controls now use shared `Button` for skip and next-step actions, with button styling aligned to shared tokens.
- `ErrorBoundary` now uses shared `Button` for retry, with the inline fallback layout moved into token-based local CSS.
- `ChatSourceRow` now uses shared `Button`, `Popover`, and `ScrollArea` for citation lookup controls instead of custom absolute-positioned popovers and document listeners.
- `LongContextDebugPanel` now uses shared `Tabs` for pack tier switching and shared `Button` for tuning actions, with local observability styles mapped to shadcn semantic tokens.
- `globals.css` now exposes a shadcn-compatible token bridge on top of the existing Nexusky theme variables, including Tailwind v4 `@theme inline` color/radius mappings.
- `components/ui/ui.css` now consumes shadcn public semantic tokens for shared component color, ring, border, panel background, and radius while preserving Nexusky glass blur/shadow variables.

Reference docs checked through `pnpm dlx shadcn@latest docs`:

- `button`, `badge`, `dialog`, `scroll-area`
- `alert-dialog`, `context-menu`, `dropdown-menu`, `tabs`
- `command`, `sheet`, `popover`, `tooltip`
- `select`, `switch`, `checkbox`, `radio-group`, `toggle-group`

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
| AI provider editor | `components/settings/AIProviderSettings.tsx` | Custom provider modal | `Dialog` + `Button` + `Badge` | Keep form markup first; migrate form controls later. |
| Publish dialog | `components/PublishScopeDialog.tsx` | Custom `role="dialog"`, manual focus/overlay | `Dialog` + `ScrollArea`; nested destructive confirm via `AlertDialog` | Good candidate but larger file, split into steps. |
| Memory timeline | `components/memory/MemoryTimelinePanel.tsx` | Already migrated partly | Already uses `Dialog`, `ScrollArea`, `Button`, `Badge` | Keep as reference pattern. |

### P1: Strong Candidates, Moderate Effort

These have more custom keyboard behavior or more UI branches.

| Area | Current file | Current pattern | Recommended primitive | Notes |
| --- | --- | --- | --- | --- |
| Command palette | `components/CommandPalette.tsx` | Custom overlay, input, selected index, scrollIntoView | `Dialog` + `Command` | shadcn `Command` uses `cmdk`; requires adding `cmdk`. High UX value. |
| Quick switcher | `components/QuickSwitcher.tsx` | Custom modal list, keyboard index handling | `Dialog` + `Command` | Similar to command palette, likely share a common command surface. |
| Search panel | `components/SearchPanel.tsx` | Custom overlay, mode buttons, result list keyboard | `Dialog` + `ToggleGroup` + `ScrollArea` + `Button` | Full `Command` may be too restrictive due async search modes. |
| Context menus | `components/ContextMenu.tsx` | Manual fixed menu, manual outside click/Escape | `ContextMenu` or `DropdownMenu` | Good, but coordinate-based callers need a careful bridge. |
| Graph generator modal | `components/GraphGenerator.tsx` | Custom glass overlay/modal | `Dialog` + `ScrollArea` | Straightforward. |
| Trash modal | `components/TrashPanel.tsx` | Custom overlay/list | `Dialog` + `ScrollArea` + `AlertDialog` | Also uses `ConfirmModal`; migrate after ConfirmModal. |
| Onboarding modal | `components/Onboarding.tsx` | Custom overlay/popover | `Dialog` | Simple. |
| AI writing preview | `components/editor/AIWritingMenu.tsx` | Custom modal + floating menu | Preview: `Dialog`; inline menu: `Popover` | Split preview and inline suggestion menu. |

### P2: Useful, But Should Wait

These need design cleanup or affect many small controls.

| Area | Current file | Recommended primitive | Notes |
| --- | --- | --- | --- |
| Notification center | `components/proactive/NotificationCenter.tsx` | `Sheet`, `DropdownMenu` | Drawer shape maps well to Sheet. Snooze menu maps to DropdownMenu. |
| Related context tabs | `components/long-context/RelatedContextPanel.tsx` | `Tabs`, `ScrollArea`, `Button`, `Badge` | Done for pack summary/tier tabs and controls. Native list scrolling remains to preserve side/page layout sizing. |
| Long context badges | `components/long-context/LongContextBadge.tsx` | `Badge` | Done. Uses local Badge with existing class styling. |
| Long context debug panel | `components/observability/LongContextDebugPanel.tsx` | `Tabs`, `Button` | Done for pack tier switching and tuning actions. Sliders remain native range inputs to preserve precise low-level tuning behavior. |
| Related context card icon actions | `components/long-context/RelatedContextCard.tsx` | `Button` with `variant="ghost"` and `size="icon"` | Done. Title/aria-label retained. |
| Graph side panel controls | `components/graph/GraphPanel.tsx` | `Button`, `Select`, `Switch` | Done for side-panel controls only. Graph canvas, pan/zoom, and node interaction layers remain custom. |
| Graph maintenance nudge | `components/graph/GraphMaintenanceNudge.tsx` | `Button` | Done for focus, clear, collapse, and expand controls. Graph canvas interaction layers remain custom. |
| Agent run controls | `components/agent/AgentRunPanel.tsx` | `Button`, `Checkbox` | Done for action buttons and dry-run checkbox. Plan editing and execution views remain custom. |
| Bases controls | `components/bases/BasesView.tsx` | `Button`, `ToggleGroup`, `DropdownMenu`, `Select` | Wait until existing `bases` type errors are resolved. |
| Settings page controls | `components/settings/pages/*` | `Switch`, `Checkbox`, `RadioGroup`, `Select`, `Button` | Do after Settings shell/Tabs so controls inherit a stable structure. |
| Proactive preferences | `components/proactive/ProactivePreferences.tsx` | `Switch`, `Select`, `Button` | Form semantics improve, visual change should be restrained. |

### P3: Optional / Polish

These are lower impact or more visual than behavioral.

| Area | Candidate primitive | Notes |
| --- | --- | --- |
| Tool result panel | `Button`, `ScrollArea`; optional `Dialog` or `Sheet` only if behavior changes | Button and internal scroll migration done. It remains a non-modal result drawer, so do not force Dialog semantics unless product behavior changes. |
| Vault health actions | `Button`, `Card`, `Badge`, `Progress` | Button migration done for skip and next-step actions. Cards/badges/progress remain optional visual polish. |
| Overview cards | `Card`, `Badge` | Be careful: user has been tuning glass/hover details manually. |
| History panel | `Button`, `ScrollArea` | Done. Kept the lightweight side-panel behavior and moved inline styles into local token-based CSS. |
| Tags panel | `Button`, `Badge`, `ScrollArea` | Done. Current tags, tag cloud, and filtered note list now use shared components with local token-based CSS. |
| Error boundary | `Button` | Done. Retry action uses shared Button and fallback layout moved out of inline styles. |
| Citation source row | `Button`, `Popover`, `ScrollArea` | Done. Citation lookup explanation now uses shared Popover with token-based local CSS. |
| Demo flow | `Dialog`, `Button`, `Progress` | Demo-only, lower priority. |
| Toast system | Radix `Toast` or `sonner` | Bigger architectural choice. Current local toast store may be fine. |

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
   - Still useful for column menus, sidebar vault menu, and small action menus.

5. `toggle-group.tsx` - done
   - Wrap `radix-ui` `ToggleGroup`.
   - Needed by Search mode controls and appearance option groups.

6. `switch.tsx`, `checkbox.tsx`, `radio-group.tsx`, `select.tsx` - done
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
- `SearchPanel`: remains on `Dialog` + `ToggleGroup` + `ScrollArea`; keep custom result behavior unless its async search/result preview model is redesigned.

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

- Current settings pages use local `Switch`, `Checkbox`, `RadioGroup`, `Select`, `ToggleGroup`, and `Button` wrappers where applicable.
- Shared settings controls now inherit shadcn-compatible radius and semantic color tokens through `components/ui/ui.css`.
- Legacy `Settings.old.tsx`, `ProactivePreferences.tsx`, and `LongContextDebugPanel.tsx` still contain custom controls but are not mounted by the current Settings shell.

## Do Not Replace Yet

### ActivityBar

Do not alter visual rendering. The user explicitly asked to keep it unchanged.

Possible future safe change:

- Replace only the right-click menu internals with the shared context menu wrapper.
- Keep `ActivityBar.tsx` button DOM/styling stable.

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
- `pnpm run typecheck` result is checked; current unrelated known failure is `"bases"` not assignable to `MainView`.

## Current Known Typecheck Issue

`pnpm run typecheck` currently fails outside the Radix migration work:

- `packages/renderer/src/App.tsx`: `"bases"` is not assignable to `MainView`.
- `packages/renderer/src/stores/ui-store.ts`: `"bases"` is not assignable to `MainView | undefined`.

This should be fixed separately before using typecheck as a clean migration gate.
