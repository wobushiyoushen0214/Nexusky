const activeControllers = new Map<number, AbortController>()

export function startAiTask(windowId: number): AbortController {
  const previous = activeControllers.get(windowId)
  if (previous) previous.abort()

  const controller = new AbortController()
  activeControllers.set(windowId, controller)
  return controller
}

export function finishAiTask(windowId: number, controller: AbortController): void {
  if (activeControllers.get(windowId) === controller) {
    activeControllers.delete(windowId)
  }
}

export function abortAiTask(windowId: number): boolean {
  const controller = activeControllers.get(windowId)
  if (!controller) return false

  controller.abort()
  activeControllers.delete(windowId)
  return true
}
