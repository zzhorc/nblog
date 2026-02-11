'use client'

import useDarkModeImpl from '@fisch0920/use-dark-mode'

// Create a safe storage provider that works in both SSR and client environments
const createSafeLocalStorage = () => {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage
  }

  // Mock localStorage for SSR
  return {
    getItem: () => null,
    setItem: () => { },
    removeItem: () => { },
    clear: () => { },
    key: () => null,
    length: 0
  }
}

export function useDarkMode() {
  const darkMode = useDarkModeImpl(false, {
    classNameDark: 'dark-mode',
    storageKey: 'darkMode',
    storageProvider: createSafeLocalStorage() as any
  })

  return {
    isDarkMode: darkMode.value,
    toggleDarkMode: darkMode.toggle
  }
}
