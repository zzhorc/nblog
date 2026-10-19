import { type ExtendedRecordMap, type PageBlock } from 'notion-types'
import { getPageTableOfContents, uuidToId } from 'notion-utils'
import * as React from 'react'

import styles from './FloatingTableOfContents.module.css'

const idleDelay = 5000

export function FloatingTableOfContents({
  block,
  recordMap,
  minSidebarItems
}: {
  block: PageBlock
  recordMap: ExtendedRecordMap
  minSidebarItems: number
}) {
  const items = React.useMemo(
    () => getPageTableOfContents(block, recordMap),
    [block, recordMap]
  )
  const [open, setOpen] = React.useState(false)
  const [docked, setDocked] = React.useState(false)
  const [dragOffset, setDragOffset] = React.useState(0)
  const rootRef = React.useRef<HTMLDivElement>(null)
  const buttonRef = React.useRef<HTMLButtonElement>(null)
  const timerRef = React.useRef<ReturnType<typeof setTimeout>>(undefined)
  const dragRef = React.useRef<{ x: number; moved: boolean }>(null)
  const panelId = React.useId()

  const clearTimer = React.useCallback(() => {
    clearTimeout(timerRef.current)
  }, [])

  const close = React.useCallback(() => {
    clearTimer()
    if (rootRef.current?.contains(document.activeElement)) {
      buttonRef.current?.focus({ preventScroll: true })
    }
    setOpen(false)
  }, [clearTimer])

  const resetTimer = React.useCallback(() => {
    clearTimer()
    timerRef.current = setTimeout(close, idleDelay)
  }, [clearTimer, close])

  React.useEffect(() => {
    if (!open) return

    resetTimer()
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) close()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    // Match the renderer's sidebar breakpoint, including short viewports.
    const wideScreen = window.matchMedia(
      '(min-width: 1300px) and (min-height: 300px)'
    )
    wideScreen.addEventListener('change', close)
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      clearTimer()
      wideScreen.removeEventListener('change', close)
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, resetTimer, close, clearTimer])

  if (!items.length) return null

  return (
    <div
      ref={rootRef}
      className={styles.root}
      data-desktop={
        !!block.format?.page_full_width || items.length < minSidebarItems
      }
      data-docked={docked && !open}
      onKeyDown={open ? resetTimer : undefined}
    >
      {open && (
        <nav
          id={panelId}
          className={styles.panel}
          aria-label='文章目录'
          onPointerMove={resetTimer}
          onPointerDown={clearTimer}
          onPointerUp={resetTimer}
          onPointerCancel={resetTimer}
          onScroll={resetTimer}
          onWheel={resetTimer}
          onFocus={resetTimer}
        >
          <div className={styles.header}>
            <span>文章目录</span>
            <button type='button' onClick={close} aria-label='收起目录'>
              ×
            </button>
          </div>
          <ol className={styles.list}>
            {items.map((item) => (
              <li key={item.id}>
                <a
                  href={`#${uuidToId(item.id)}`}
                  style={{ paddingLeft: 12 + item.indentLevel * 16 }}
                  onClick={resetTimer}
                >
                  {item.text}
                </a>
              </li>
            ))}
          </ol>
        </nav>
      )}
      <button
        ref={buttonRef}
        type='button'
        className={styles.trigger}
        style={{ transform: `translateX(${dragOffset}px)` }}
        aria-label={open ? '收起目录' : '展开目录（向右拖动可贴边收起）'}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={(event) => {
          if (event.detail > 0 && dragRef.current?.moved) {
            dragRef.current = null
            return
          }
          if (open) close()
          else setOpen(true)
        }}
        onPointerDown={(event) => {
          if (event.button !== 0 || open) return
          dragRef.current = { x: event.clientX, moved: false }
          event.currentTarget.setPointerCapture(event.pointerId)
        }}
        onPointerMove={(event) => {
          const drag = dragRef.current
          if (
            !drag ||
            !event.currentTarget.hasPointerCapture(event.pointerId)
          ) {
            return
          }
          const delta = event.clientX - drag.x
          if (Math.abs(delta) > 8) drag.moved = true
          setDragOffset(Math.max(-36, Math.min(36, delta)))
        }}
        onPointerUp={(event) => {
          const drag = dragRef.current
          if (
            !drag ||
            !event.currentTarget.hasPointerCapture(event.pointerId)
          ) {
            return
          }
          const delta = event.clientX - drag.x
          if (delta > 24) setDocked(true)
          else if (delta < -24) setDocked(false)
          setDragOffset(0)
          event.currentTarget.releasePointerCapture(event.pointerId)
        }}
        onPointerCancel={() => {
          dragRef.current = null
          setDragOffset(0)
        }}
      >
        <svg
          width='20'
          height='20'
          viewBox='0 0 24 24'
          fill='none'
          aria-hidden='true'
        >
          <path
            d='M8 6h12M8 12h12M8 18h12M3 6h.01M3 12h.01M3 18h.01'
            stroke='currentColor'
            strokeWidth='2'
            strokeLinecap='round'
          />
        </svg>
      </button>
    </div>
  )
}
