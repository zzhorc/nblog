import * as React from 'react'

import {
  getArticleSearchLines,
  getMatchRange,
  type SearchLine
} from '@/lib/page-search'

import styles from './ArticleSearch.module.css'

export function ArticleSearch() {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState('')
  const [lines, setLines] = React.useState<SearchLine[]>([])
  const dialogRef = React.useRef<HTMLDialogElement>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const highlightRef = React.useRef<HTMLElement>(null)
  const timerRef = React.useRef<ReturnType<typeof setTimeout>>(undefined)
  const frameRef = React.useRef<number>(undefined)
  const resultId = React.useId()
  const keyword = query.trim()
  const matches = React.useMemo(
    () =>
      keyword
        ? lines.filter((line) =>
            line.text.toLowerCase().includes(keyword.toLowerCase())
          )
        : [],
    [keyword, lines]
  )

  const clearHighlight = React.useCallback(() => {
    clearTimeout(timerRef.current)
    highlightRef.current?.classList.remove(styles.target!)
    highlightRef.current = null
    if (typeof CSS !== 'undefined' && 'highlights' in CSS) {
      CSS.highlights.delete('article-search-match')
    }
  }, [])

  React.useEffect(() => {
    if (!open) return
    clearHighlight()
    setLines(getArticleSearchLines())
    dialogRef.current?.showModal()
    inputRef.current?.focus()
  }, [open, clearHighlight])

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setOpen(true)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      clearHighlight()
      if (frameRef.current !== undefined) cancelAnimationFrame(frameRef.current)
    }
  }, [clearHighlight])

  const jumpToLine = (line: SearchLine) => {
    const range = getMatchRange(line, keyword)
    dialogRef.current?.close()
    clearHighlight()
    frameRef.current = requestAnimationFrame(() => {
      if (!line.element.isConnected) return
      const rect =
        range?.getBoundingClientRect() || line.element.getBoundingClientRect()
      // Center the matching text itself, even in a paragraph taller than the screen.
      window.scrollTo({
        top:
          window.scrollY + rect.top - window.innerHeight / 2 + rect.height / 2,
        behavior: 'instant'
      })
      line.element.classList.add(styles.target!)
      highlightRef.current = line.element
      if (range && typeof Highlight !== 'undefined' && 'highlights' in CSS) {
        CSS.highlights.set('article-search-match', new Highlight(range))
      }
      timerRef.current = setTimeout(clearHighlight, 4000)
    })
  }

  return (
    <>
      {/* The build's CSS parser does not support Custom Highlight selectors.
          Let the browser parse this progressive enhancement directly. */}
      <style>{`::highlight(article-search-match) {
        background: #ffe08a;
        color: #342400;
      }`}</style>
      <button
        type='button'
        className={`breadcrumb button notion-search-button ${styles.trigger}`}
        aria-label='页内搜索'
        title='页内搜索'
        onClick={() => setOpen(true)}
      >
        <svg
          className='searchIcon'
          viewBox='0 0 24 24'
          fill='none'
          aria-hidden='true'
        >
          <circle
            cx='10.5'
            cy='10.5'
            r='7.5'
            stroke='currentColor'
            strokeWidth='2'
          />
          <path
            d='m16 16 5 5'
            stroke='currentColor'
            strokeWidth='2'
            strokeLinecap='round'
          />
        </svg>
      </button>
      <dialog
        ref={dialogRef}
        className={styles.dialog}
        aria-label='页内搜索'
        onClose={() => setOpen(false)}
        onPointerDown={(event) => {
          if (event.target === event.currentTarget) dialogRef.current?.close()
        }}
      >
        <div className={styles.content}>
          <div className={styles.header}>
            <label htmlFor={`${resultId}-input`}>页内搜索</label>
            <button
              type='button'
              aria-label='关闭页内搜索'
              onClick={() => dialogRef.current?.close()}
            >
              ×
            </button>
          </div>
          <input
            ref={inputRef}
            id={`${resultId}-input`}
            className={styles.input}
            type='search'
            placeholder='查找当前文章中的关键词'
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (
                event.key === 'Enter' &&
                !event.nativeEvent.isComposing &&
                matches[0]
              ) {
                event.preventDefault()
                jumpToLine(matches[0])
              }
            }}
            aria-describedby={resultId}
          />
          <p id={resultId} className={styles.status} role='status'>
            {keyword
              ? `找到 ${matches.length} 行匹配结果`
              : '输入关键词，即时查找当前文章正文'}
          </p>
          <ol className={styles.results}>
            {matches.map((line, index) => (
              <li key={index}>
                <button type='button' onClick={() => jumpToLine(line)}>
                  <span className={styles.number}>{index + 1}</span>
                  <span>
                    <MatchedText text={line.text} keyword={keyword} />
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </div>
      </dialog>
    </>
  )
}

function MatchedText({ text, keyword }: { text: string; keyword: string }) {
  const parts: React.ReactNode[] = []
  const lowerText = text.toLowerCase()
  const lowerKeyword = keyword.toLowerCase()
  let offset = 0
  let index = lowerText.indexOf(lowerKeyword)
  while (index !== -1) {
    parts.push(text.slice(offset, index))
    parts.push(
      <mark key={index}>{text.slice(index, index + keyword.length)}</mark>
    )
    offset = index + keyword.length
    index = lowerText.indexOf(lowerKeyword, offset)
  }
  parts.push(text.slice(offset))
  return <>{parts}</>
}
