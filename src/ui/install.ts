import { useEffect, useState } from 'react'

/**
 * "Add to Home Screen" support.
 *
 * - Android / Chromium browsers fire `beforeinstallprompt`; we keep the event and call
 *   `prompt()` from our own button, which opens the browser's real install dialog.
 * - iPhone / iPad Safari can't be installed programmatically, so we show the steps.
 * - In-app browsers (Gmail, Instagram, Facebook…) can't install at all; we suggest Safari / Chrome.
 * - Nothing is shown once the app runs installed (standalone display mode).
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferred: BeforeInstallPromptEvent | null = null
let installed = false
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

/** Call once at startup, before React renders: the event can fire very early. */
export function captureInstallPrompt() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferred = e as BeforeInstallPromptEvent
    emit()
  })
  window.addEventListener('appinstalled', () => {
    installed = true
    deferred = null
    emit()
  })
}

export type InstallPlatform = 'android' | 'ios' | 'ios-other-browser' | 'in-app' | 'desktop' | 'unsupported'

export function isStandalone(): boolean {
  return (
    installed ||
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

export function detectPlatform(): InstallPlatform {
  const ua = navigator.userAgent
  const iPadOS = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1
  const ios = /iPhone|iPad|iPod/.test(ua) || iPadOS
  const inApp = /FBAN|FBAV|Instagram|Line\/|GSA\/|LinkedInApp|Snapchat|Twitter|TikTok/.test(ua) || (ios && !/Safari\//.test(ua))
  if (inApp) return 'in-app'
  if (ios) return /CriOS|FxiOS|EdgiOS/.test(ua) ? 'ios-other-browser' : 'ios'
  if (/Android/.test(ua)) return 'android'
  return deferred ? 'desktop' : 'unsupported'
}

export const isPhoneOrTablet = () => {
  const p = detectPlatform()
  return p === 'android' || p === 'ios' || p === 'ios-other-browser' || p === 'in-app'
}

export function useInstall() {
  const [, force] = useState(0)
  useEffect(() => {
    const l = () => force((n) => n + 1)
    listeners.add(l)
    const mq = window.matchMedia('(display-mode: standalone)')
    mq.addEventListener('change', l)
    return () => {
      listeners.delete(l)
      mq.removeEventListener('change', l)
    }
  }, [])
  return {
    standalone: isStandalone(),
    platform: detectPlatform(),
    canPrompt: !!deferred,
    async prompt(): Promise<boolean> {
      if (!deferred) return false
      const e = deferred
      await e.prompt()
      const { outcome } = await e.userChoice
      deferred = null
      emit()
      return outcome === 'accepted'
    },
  }
}

const DISMISS_KEY = 'install-banner-dismissed-at'
const SNOOZE_DAYS = 14

export function isBannerSnoozed(): boolean {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY) ?? 0)
    return Date.now() - at < SNOOZE_DAYS * 86400000
  } catch {
    return false
  }
}

export function snoozeBanner() {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()))
  } catch {
    /* ignore */
  }
}
