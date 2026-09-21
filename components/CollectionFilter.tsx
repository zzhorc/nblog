import { IoCheckmark } from '@react-icons/all-files/io5/IoCheckmark'
import { IoClose } from '@react-icons/all-files/io5/IoClose'
import { IoFilterOutline } from '@react-icons/all-files/io5/IoFilterOutline'
import { IoSearchOutline } from '@react-icons/all-files/io5/IoSearchOutline'
import cs from 'classnames'
import * as React from 'react'
import { createPortal } from 'react-dom'

import type { CollectionFilterOption } from '@/lib/collection-filter'

import styles from './styles.module.css'

interface CollectionFilterContextValue {
  options: CollectionFilterOption[]
  selectedKeys: ReadonlySet<string>
  matchingArticleCount: number
  toggleOption: (key: string) => void
  clearOptions: () => void
}

const CollectionFilterContext = React.createContext<
  CollectionFilterContextValue | undefined
>(undefined)

export function CollectionFilterProvider({
  children,
  value
}: {
  children: React.ReactNode
  value: CollectionFilterContextValue
}) {
  return (
    <CollectionFilterContext.Provider value={value}>
      {children}
    </CollectionFilterContext.Provider>
  )
}

export function CollectionFilterButton() {
  const filter = React.useContext(CollectionFilterContext)
  const triggerRef = React.useRef<HTMLButtonElement>(null)
  const popoverRef = React.useRef<HTMLDivElement>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [isOpen, setIsOpen] = React.useState(false)
  const [query, setQuery] = React.useState('')
  const [popoverPosition, setPopoverPosition] = React.useState({
    top: 0,
    left: 0
  })

  const updatePopoverPosition = React.useCallback(() => {
    const trigger = triggerRef.current
    if (!trigger) return

    const rect = trigger.getBoundingClientRect()
    const width = Math.min(360, window.innerWidth - 24)
    setPopoverPosition({
      top: rect.bottom + 8,
      left: Math.min(
        Math.max(12, rect.right - width),
        window.innerWidth - width - 12
      )
    })
  }, [])

  React.useEffect(() => {
    if (!isOpen) return

    updatePopoverPosition()
    inputRef.current?.focus()

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (
        !triggerRef.current?.contains(target) &&
        !popoverRef.current?.contains(target)
      ) {
        setIsOpen(false)
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false)
        triggerRef.current?.focus()
      }
    }

    window.addEventListener('resize', updatePopoverPosition)
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)

    return () => {
      window.removeEventListener('resize', updatePopoverPosition)
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [isOpen, updatePopoverPosition])

  if (!filter?.options.length) return null

  const selectedCount = filter.selectedKeys.size
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const visibleOptions = filter.options.filter((option) =>
    option.value.toLocaleLowerCase().includes(normalizedQuery)
  )
  const selectedOptions = filter.options.filter((option) =>
    filter.selectedKeys.has(option.key)
  )
  const categoryOptions = visibleOptions.filter(
    (option) => option.kind === 'category'
  )
  const tagOptions = visibleOptions.filter((option) => option.kind === 'tag')

  return (
    <>
      <button
        ref={triggerRef}
        type='button'
        className={cs(
          'breadcrumb',
          'button',
          styles.collectionFilterTrigger,
          selectedCount > 0 && styles.collectionFilterTriggerActive
        )}
        onClick={() => setIsOpen((open) => !open)}
        title={
          selectedCount
            ? `已选 ${selectedCount} 个筛选条件`
            : '按分类和标签筛选'
        }
        aria-label={
          selectedCount
            ? `筛选文章，已选 ${selectedCount} 项`
            : '按分类和标签筛选文章'
        }
        aria-haspopup='dialog'
        aria-expanded={isOpen}
      >
        <IoFilterOutline aria-hidden='true' />
        {selectedCount > 0 && (
          <span className={styles.collectionFilterCount}>{selectedCount}</span>
        )}
      </button>

      {isOpen &&
        createPortal(
          <div
            ref={popoverRef}
            className={styles.collectionFilterPopover}
            style={popoverPosition}
            role='dialog'
            aria-label='筛选文章'
          >
            <div className={styles.collectionFilterHeading}>
              <div>
                <strong>筛选文章</strong>
                <span>多个选项按“或”匹配</span>
              </div>
              {selectedCount > 0 && (
                <button
                  type='button'
                  className={styles.collectionFilterClear}
                  onClick={filter.clearOptions}
                >
                  清空
                </button>
              )}
            </div>

            {selectedOptions.length > 0 && (
              <div
                className={styles.collectionFilterSelected}
                aria-label='已选筛选条件'
              >
                {selectedOptions.map((option) => (
                  <button
                    type='button'
                    className={styles.collectionFilterChip}
                    data-color={option.color}
                    key={option.key}
                    onClick={() => filter.toggleOption(option.key)}
                    title={`移除 ${option.value}`}
                  >
                    <span>{option.value}</span>
                    <IoClose aria-hidden='true' />
                  </button>
                ))}
              </div>
            )}

            <label className={styles.collectionFilterSearch}>
              <IoSearchOutline aria-hidden='true' />
              <input
                ref={inputRef}
                type='search'
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder='搜索分类或标签'
                aria-label='搜索分类或标签'
              />
            </label>

            <div className={styles.collectionFilterResults}>
              {categoryOptions.length > 0 && (
                <FilterOptionGroup
                  label='分类'
                  options={categoryOptions}
                  selectedKeys={filter.selectedKeys}
                  onToggle={filter.toggleOption}
                />
              )}
              {tagOptions.length > 0 && (
                <FilterOptionGroup
                  label='标签'
                  options={tagOptions}
                  selectedKeys={filter.selectedKeys}
                  onToggle={filter.toggleOption}
                />
              )}
              {!visibleOptions.length && (
                <div className={styles.collectionFilterEmpty}>
                  没有匹配的分类或标签
                </div>
              )}
            </div>

            <div className={styles.collectionFilterFooter} aria-live='polite'>
              {selectedCount > 0
                ? `匹配 ${filter.matchingArticleCount} 篇文章`
                : `共 ${filter.matchingArticleCount} 篇文章`}
            </div>
          </div>,
          document.body
        )}
    </>
  )
}

function FilterOptionGroup({
  label,
  options,
  selectedKeys,
  onToggle
}: {
  label: string
  options: CollectionFilterOption[]
  selectedKeys: ReadonlySet<string>
  onToggle: (key: string) => void
}) {
  return (
    <section className={styles.collectionFilterGroup} aria-label={label}>
      <div className={styles.collectionFilterGroupLabel}>{label}</div>
      {options.map((option) => {
        const isSelected = selectedKeys.has(option.key)

        return (
          <button
            type='button'
            className={cs(
              styles.collectionFilterOption,
              isSelected && styles.collectionFilterOptionSelected
            )}
            key={option.key}
            onClick={() => onToggle(option.key)}
            aria-pressed={isSelected}
          >
            <span
              className={styles.collectionFilterOptionColor}
              data-color={option.color}
              aria-hidden='true'
            />
            <span className={styles.collectionFilterOptionName}>
              {option.value}
            </span>
            <span className={styles.collectionFilterOptionTotal}>
              {option.articleCount}
            </span>
            <span className={styles.collectionFilterOptionCheck}>
              {isSelected && <IoCheckmark aria-hidden='true' />}
            </span>
          </button>
        )
      })}
    </section>
  )
}
