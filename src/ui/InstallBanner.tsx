import { useState, type ReactNode } from 'react'
import { Icon } from './Icon'
import { isBannerSnoozed, isPhoneOrTablet, snoozeBanner, useInstall, type InstallPlatform } from './install'

const ShareGlyph = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-label="Share" style={{ verticalAlign: '-3px' }}>
    <path d="M12 3v12M8 7l4-4 4 4M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
  </svg>
)
const MoreGlyph = () => <span aria-label="More" style={{ fontWeight: 700, letterSpacing: 1 }}>•••</span>
const KebabGlyph = () => <span aria-label="Menu" style={{ fontWeight: 700 }}>⋮</span>

function steps(platform: InstallPlatform): ReactNode[] {
  switch (platform) {
    case 'ios':
      return [
        <>Tap <ShareGlyph /> <b>Share</b> in Safari's toolbar. On iOS 26, tap <MoreGlyph /> first.</>,
        <>Scroll down and tap <b>Add to Home Screen</b>.</>,
        <>Tap <b>Add</b>. Kinetra opens full screen from your home screen.</>,
      ]
    case 'ios-other-browser':
      return [
        <>Tap <ShareGlyph /> <b>Share</b> next to the address bar.</>,
        <>Tap <b>Add to Home Screen</b>, then <b>Add</b>.</>,
      ]
    case 'in-app':
      return [
        <>This screen is inside another app, which can't install Kinetra.</>,
        <>Tap <MoreGlyph /> or <ShareGlyph /> and choose <b>Open in Safari</b> (or your browser).</>,
        <>Then use <b>Share → Add to Home Screen</b> there.</>,
      ]
    case 'android':
      return [
        <>Tap <KebabGlyph /> in the browser's top corner.</>,
        <>Tap <b>Install app</b> or <b>Add to Home screen</b>.</>,
      ]
    default:
      return [<>Use your browser's menu and choose <b>Install</b> or <b>Add to Home Screen</b>.</>]
  }
}

/** The install pitch + action, shared by the Today banner and the You page. */
export function InstallContent({ compact, onDone }: { compact?: boolean; onDone?: () => void }) {
  const install = useInstall()
  const [open, setOpen] = useState(!compact)
  const oneTap = install.canPrompt

  if (install.standalone)
    return (
      <div className="row" style={{ gap: 10 }}>
        <Icon name="check" className="link" />
        <span>Kinetra is installed on this device.</span>
      </div>
    )

  return (
    <>
      <div className="row" style={{ gap: 12, alignItems: 'center' }}>
        <span className="app-glyph" style={{ width: 44, height: 44, borderRadius: 11, marginBottom: 0, flexShrink: 0 }}>
          <Icon name="barbell" size={24} />
        </span>
        <div className="grow">
          <div style={{ fontWeight: 600 }}>Add Kinetra to your home screen</div>
          <div className="small muted">Opens full screen, starts faster and works offline at the gym.</div>
        </div>
      </div>
      <div className="row" style={{ gap: 8, marginTop: 12 }}>
        {oneTap ? (
          <button className="btn tint sm" onClick={async () => { if (await install.prompt()) onDone?.() }}>Install</button>
        ) : (
          <button className="btn tint sm" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            {open ? 'Hide steps' : 'Show me how'}
          </button>
        )}
      </div>
      {!oneTap && open && (
        <ol className="install-steps">
          {steps(install.platform).map((s, i) => <li key={i}>{s}</li>)}
        </ol>
      )}
    </>
  )
}

/** Collapsible banner at the top of Today, phones and tablets only, until installed or dismissed. */
export function InstallBanner() {
  const install = useInstall()
  const [hidden, setHidden] = useState(isBannerSnoozed)
  if (hidden || install.standalone || !isPhoneOrTablet()) return null
  return (
    <div className="card card-pad install-banner" style={{ marginBottom: 18, position: 'relative' }}>
      <button
        className="icon-btn"
        style={{ position: 'absolute', top: 6, right: 6 }}
        aria-label="Not now"
        onClick={() => {
          snoozeBanner()
          setHidden(true)
        }}
      >
        <Icon name="x" size={18} />
      </button>
      <InstallContent compact onDone={() => setHidden(true)} />
    </div>
  )
}
