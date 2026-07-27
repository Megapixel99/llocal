import { Notification, BrowserWindow } from 'electron'
import {
  DEFAULT_NOTIFICATION_PREFS,
  formatNotification,
  shouldNotify,
  type NotificationEvent,
  type NotificationPayload,
  type NotificationPrefs
} from '../../shared/notifications'

/**
 * Native-notification bridge for the main process.
 *
 * The *policy* (whether to notify, and the text) lives in the pure
 * src/shared/notifications.ts. This module applies that policy and then shows an
 * `electron.Notification`. It also caches the latest prefs the renderer pushed,
 * so notifications raised from inside main-process code (e.g. the agent touching
 * a sensitive file in agent-tools.ts) can respect the user's settings without
 * having to thread prefs through every call.
 */

let storedPrefs: NotificationPrefs = DEFAULT_NOTIFICATION_PREFS

/** Cache the renderer's current notification prefs for main-side triggers. */
export function setNotificationPrefs(prefs: NotificationPrefs): void {
  if (prefs && typeof prefs.enabled === 'boolean' && prefs.events) {
    storedPrefs = prefs
  }
}

export function getNotificationPrefs(): NotificationPrefs {
  return storedPrefs
}

/**
 * Show a native notification for `event` if the (pure) policy allows it.
 * Falls back to the cached prefs when none are supplied.
 *
 * `agent-complete` is only shown when the main window is NOT focused — there's
 * no point pinging the OS about a run the user is already watching. The focus
 * check needs live window state, so it lives here rather than in the pure core.
 *
 * Returns whether a notification was actually shown.
 */
export function showNotification(
  event: NotificationEvent,
  payload: NotificationPayload = {},
  prefs: NotificationPrefs = storedPrefs
): boolean {
  if (!shouldNotify(event, prefs)) return false

  if (event === 'agent-complete') {
    const win = BrowserWindow.getAllWindows()[0]
    if (win && win.isFocused()) return false
  }

  if (!Notification.isSupported()) return false

  const { title, body } = formatNotification(event, payload)
  const notification = new Notification({ title, body })
  notification.on('click', () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })
  notification.show()
  return true
}
