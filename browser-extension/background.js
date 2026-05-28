const CLIPPER_URL = 'http://127.0.0.1:17321/clip'

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'save-page',
    title: 'Save page to Nexusky',
    contexts: ['page']
  })
  chrome.contextMenus.create({
    id: 'save-selection',
    title: 'Save selection to Nexusky',
    contexts: ['selection']
  })
})

async function getPagePayload(tab, selectionText = '') {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => ({
      title: document.title,
      url: location.href,
      text: document.body?.innerText?.slice(0, 60000) || '',
      html: document.body?.innerHTML?.slice(0, 120000) || ''
    })
  })
  return {
    title: result?.title || tab.title || 'Untitled Web Clip',
    url: result?.url || tab.url || '',
    selection: selectionText,
    text: selectionText || result?.text || '',
    html: selectionText ? '' : result?.html || ''
  }
}

async function saveClip(payload) {
  const response = await fetch(CLIPPER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Nexusky-Clipper': 'extension'
    },
    body: JSON.stringify(payload)
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok || !result.ok) {
    throw new Error(result.error || 'Nexusky clipper is not available')
  }
  return result
}

chrome.action.onClicked.addListener(async (tab) => {
  try {
    await saveClip(await getPagePayload(tab))
  } catch (error) {
    console.error(error)
  }
})

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) return
  try {
    const selection = info.menuItemId === 'save-selection' ? info.selectionText || '' : ''
    await saveClip(await getPagePayload(tab, selection))
  } catch (error) {
    console.error(error)
  }
})
