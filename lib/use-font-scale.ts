import * as React from 'react'

const STORAGE_KEY = 'nblog-font-scale'
const DEFAULT_SCALE = 1
const MIN_SCALE = 0.875
const MAX_SCALE = 1.25
const STEP = 0.0625

function clampFontScale(scale: number) {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale))
}

function readStoredFontScale() {
  if (typeof window === 'undefined') {
    return DEFAULT_SCALE
  }

  const storedValue = window.localStorage.getItem(STORAGE_KEY)

  if (!storedValue) {
    return DEFAULT_SCALE
  }

  const storedScale = Number(storedValue)

  return Number.isFinite(storedScale)
    ? clampFontScale(storedScale)
    : DEFAULT_SCALE
}

export function useFontScale() {
  const [fontScale, setFontScale] = React.useState(readStoredFontScale)

  React.useEffect(() => {
    document.documentElement.style.setProperty(
      '--notion-font-scale',
      fontScale.toString()
    )
    window.localStorage.setItem(STORAGE_KEY, fontScale.toString())
  }, [fontScale])

  const decreaseFontScale = React.useCallback(() => {
    setFontScale((scale) => clampFontScale(scale - STEP))
  }, [])

  const increaseFontScale = React.useCallback(() => {
    setFontScale((scale) => clampFontScale(scale + STEP))
  }, [])

  return {
    fontScale,
    canDecreaseFontScale: fontScale > MIN_SCALE,
    canIncreaseFontScale: fontScale < MAX_SCALE,
    decreaseFontScale,
    increaseFontScale
  }
}
