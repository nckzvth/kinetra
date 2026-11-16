/**
 * Tracks the *visible* viewport. On iPhone the on-screen keyboard shrinks only the visual
 * viewport (and may scroll it), not the layout, so fixed overlays end up under the keyboard.
 * We expose its height and offset as CSS variables (--vvh, --vvt) so sheets can sit above it,
 * and keep whatever field has focus in view as the keyboard opens.
 */
export function trackVisualViewport() {
  const vv = window.visualViewport
  if (!vv) return
  const root = document.documentElement
  let raf = 0
  const update = () => {
    cancelAnimationFrame(raf)
    raf = requestAnimationFrame(() => {
      root.style.setProperty('--vvh', `${vv.height}px`)
      root.style.setProperty('--vvt', `${vv.offsetTop}px`)
      // Keyboard counts as "open" when it hides a meaningful part of the screen.
      root.classList.toggle('kb-open', window.innerHeight - vv.height > 120)
      const el = document.activeElement as HTMLElement | null
      if (el && el.closest('.sheet') && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) el.scrollIntoView({ block: 'nearest' })
    })
  }
  vv.addEventListener('resize', update)
  vv.addEventListener('scroll', update)
  update()
}
