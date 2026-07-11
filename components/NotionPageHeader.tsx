import type * as types from 'notion-types'
import { IoMoonSharp } from '@react-icons/all-files/io5/IoMoonSharp'
import { IoSunnyOutline } from '@react-icons/all-files/io5/IoSunnyOutline'
import cs from 'classnames'
import * as React from 'react'
import { Header, Search, useNotionContext } from 'react-notion-x'

import { isSearchEnabled, navigationLinks, navigationStyle } from '@/lib/config'
import { useDarkMode } from '@/lib/use-dark-mode'
import { useFontScale } from '@/lib/use-font-scale'

import styles from './styles.module.css'

function ToggleThemeButton() {
  const [hasMounted, setHasMounted] = React.useState(false)
  const { isDarkMode, toggleDarkMode } = useDarkMode()

  React.useEffect(() => {
    setHasMounted(true)
  }, [])

  const onToggleTheme = React.useCallback(() => {
    toggleDarkMode()
  }, [toggleDarkMode])

  return (
    <div
      className={cs('breadcrumb', 'button', !hasMounted && styles.hidden)}
      onClick={onToggleTheme}
    >
      {hasMounted && isDarkMode ? <IoMoonSharp /> : <IoSunnyOutline />}
    </div>
  )
}

function FontScaleControls() {
  const {
    canDecreaseFontScale,
    canIncreaseFontScale,
    decreaseFontScale,
    increaseFontScale
  } = useFontScale()

  return (
    <div className={styles.fontScaleControls} aria-label='调整字体大小'>
      <button
        type='button'
        className={cs('breadcrumb', 'button', styles.fontScaleButton)}
        onClick={decreaseFontScale}
        disabled={!canDecreaseFontScale}
        title='Decrease font size'
        aria-label='Decrease font size'
      >
        -
      </button>
      <span className={styles.fontScaleLabel} aria-hidden='true'>
        字
      </span>
      <button
        type='button'
        className={cs('breadcrumb', 'button', styles.fontScaleButton)}
        onClick={increaseFontScale}
        disabled={!canIncreaseFontScale}
        title='Increase font size'
        aria-label='Increase font size'
      >
        +
      </button>
    </div>
  )
}

export function NotionPageHeader({
  block
}: {
  block: types.CollectionViewPageBlock | types.PageBlock
}) {
  const { components, mapPageUrl } = useNotionContext()

  if (navigationStyle === 'default') {
    return <Header block={block} />
  }

  return (
    <header className='notion-header'>
      <div className='notion-nav-header'>
        <div
          className='breadcrumb button'
          style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
        >
          <a
            href='/'
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              textDecoration: 'none',
              color: 'inherit'
            }}
          >
            <img
              src='/logo.png'
              alt='Logo'
              style={{ width: '24px', height: '24px', borderRadius: '50%' }}
            />
          </a>
        </div>

        <div className='notion-nav-header-rhs breadcrumbs'>
          {navigationLinks
            ?.map((link, index) => {
              if (!link?.pageId && !link?.url) {
                return null
              }

              if (link.pageId) {
                return (
                  <components.PageLink
                    href={mapPageUrl(link.pageId)}
                    key={index}
                    className={cs(styles.navLink, 'breadcrumb', 'button')}
                  >
                    {link.title}
                  </components.PageLink>
                )
              } else {
                return (
                  <components.Link
                    href={link.url}
                    key={index}
                    className={cs(styles.navLink, 'breadcrumb', 'button')}
                  >
                    {link.title}
                  </components.Link>
                )
              }
            })
            .filter(Boolean)}

          <ToggleThemeButton />
          <FontScaleControls />

          {isSearchEnabled && <Search block={block} title={null} />}
        </div>
      </div>
    </header>
  )
}
