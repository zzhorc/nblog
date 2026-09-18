import cs from 'classnames'
import dynamic from 'next/dynamic'
import Image from 'next/legacy/image'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { type PageBlock } from 'notion-types'
import { formatDate, getBlockTitle, getPageProperty } from 'notion-utils'
import * as React from 'react'
import BodyClassName from 'react-body-classname'
import { type NotionComponents, useNotionContext } from 'react-notion-x'
import { EmbeddedTweet, TweetNotFound, TweetSkeleton } from 'react-tweet'
import { useSearchParam } from 'react-use'

import type * as types from '@/lib/types'
import {
  countMatchingArticles,
  filterRecordMapByOptions,
  getCollectionFilterOptions
} from '@/lib/collection-filter'
import * as config from '@/lib/config'
import { mapImageUrl } from '@/lib/map-image-url'
import { getCanonicalPageUrl, mapPageUrl } from '@/lib/map-page-url'
import { searchNotion } from '@/lib/search-notion'
import { useDarkMode } from '@/lib/use-dark-mode'

import { CollectionFilterProvider } from './CollectionFilter'
import { Footer } from './Footer'
import { Loading } from './Loading'
import { NotionPageHeader } from './NotionPageHeader'
import { Page404 } from './Page404'
import { PageAside } from './PageAside'
import { PageHead } from './PageHead'
import { PasswordGate } from './PasswordGate'
import styles from './styles.module.css'

// -----------------------------------------------------------------------------
// dynamic imports for optional components
// -----------------------------------------------------------------------------

const Code = dynamic(() =>
  import('react-notion-x/build/third-party/code').then(async (m) => {
    // add / remove any prism syntaxes here
    await Promise.allSettled([
      // @ts-expect-error Ignore prisma types
      import('prismjs/components/prism-markup-templating.js'),
      // @ts-expect-error Ignore prisma types
      import('prismjs/components/prism-markup.js'),
      // @ts-expect-error Ignore prisma types
      import('prismjs/components/prism-bash.js'),
      // @ts-expect-error Ignore prisma types
      import('prismjs/components/prism-c.js'),
      // @ts-expect-error Ignore prisma types
      import('prismjs/components/prism-cpp.js'),
      // @ts-expect-error Ignore prisma types
      import('prismjs/components/prism-csharp.js'),
      // @ts-expect-error Ignore prisma types
      import('prismjs/components/prism-docker.js'),
      // @ts-expect-error Ignore prisma types
      import('prismjs/components/prism-java.js'),
      // @ts-expect-error Ignore prisma types
      import('prismjs/components/prism-js-templates.js'),
      // @ts-expect-error Ignore prisma types
      import('prismjs/components/prism-coffeescript.js'),
      // @ts-expect-error Ignore prisma types
      import('prismjs/components/prism-diff.js'),
      // @ts-expect-error Ignore prisma types
      import('prismjs/components/prism-git.js'),
      // @ts-expect-error Ignore prisma types
      import('prismjs/components/prism-go.js'),
      // @ts-expect-error Ignore prisma types
      import('prismjs/components/prism-graphql.js'),
      // @ts-expect-error Ignore prisma types
      import('prismjs/components/prism-handlebars.js'),
      // @ts-expect-error Ignore prisma types
      import('prismjs/components/prism-less.js'),
      // @ts-expect-error Ignore prisma types
      import('prismjs/components/prism-makefile.js'),
      // @ts-expect-error Ignore prisma types
      import('prismjs/components/prism-markdown.js'),
      // @ts-expect-error Ignore prisma types
      import('prismjs/components/prism-objectivec.js'),
      // @ts-expect-error Ignore prisma types
      import('prismjs/components/prism-ocaml.js'),
      // @ts-expect-error Ignore prisma types
      import('prismjs/components/prism-python.js'),
      // @ts-expect-error Ignore prisma types
      import('prismjs/components/prism-reason.js'),
      // @ts-expect-error Ignore prisma types
      import('prismjs/components/prism-rust.js'),
      // @ts-expect-error Ignore prisma types
      import('prismjs/components/prism-sass.js'),
      // @ts-expect-error Ignore prisma types
      import('prismjs/components/prism-scss.js'),
      // @ts-expect-error Ignore prisma types
      import('prismjs/components/prism-solidity.js'),
      // @ts-expect-error Ignore prisma types
      import('prismjs/components/prism-sql.js'),
      // @ts-expect-error Ignore prisma types
      import('prismjs/components/prism-stylus.js'),
      // @ts-expect-error Ignore prisma types
      import('prismjs/components/prism-swift.js'),
      // @ts-expect-error Ignore prisma types
      import('prismjs/components/prism-wasm.js'),
      // @ts-expect-error Ignore prisma types
      import('prismjs/components/prism-yaml.js')
    ])
    return m.Code
  })
)

const Collection = dynamic(() =>
  import('react-notion-x/build/third-party/collection').then(
    (m) => m.Collection
  )
)
const Equation = dynamic(() =>
  import('react-notion-x/build/third-party/equation').then((m) => m.Equation)
)
const Pdf = dynamic(
  () => import('react-notion-x/build/third-party/pdf').then((m) => m.Pdf),
  {
    ssr: false
  }
)
const Modal = dynamic(
  () =>
    import('react-notion-x/build/third-party/modal').then((m) => {
      m.Modal.setAppElement('.notion-viewport')
      return m.Modal
    }),
  {
    ssr: false
  }
)

const NotionRenderer = dynamic(
  () => import('react-notion-x').then((m) => m.NotionRenderer),
  {
    ssr: false
  }
)

function Tweet({ id }: { id: string }) {
  const { recordMap } = useNotionContext()
  const tweet = (recordMap as types.ExtendedTweetRecordMap)?.tweets?.[id]

  return (
    <React.Suspense fallback={<TweetSkeleton />}>
      {tweet ? <EmbeddedTweet tweet={tweet} /> : <TweetNotFound />}
    </React.Suspense>
  )
}

const propertyLastEditedTimeValue = (
  { block, pageHeader }: any,
  defaultFn: () => React.ReactNode
) => {
  if (pageHeader && block?.last_edited_time) {
    return `Last updated ${formatDate(block?.last_edited_time, {
      month: 'long'
    })}`
  }

  return defaultFn()
}

const propertyDateValue = (
  { data, schema, pageHeader }: any,
  defaultFn: () => React.ReactNode
) => {
  if (pageHeader && schema?.name?.toLowerCase() === 'published') {
    const publishDate = data?.[0]?.[1]?.[0]?.[1]?.start_date

    if (publishDate) {
      return `${formatDate(publishDate, {
        month: 'long'
      })}`
    }
  }

  return defaultFn()
}

const propertyTextValue = (
  { schema, pageHeader }: any,
  defaultFn: () => React.ReactNode
) => {
  if (pageHeader && schema?.name?.toLowerCase() === 'author') {
    return <b>{defaultFn()}</b>
  }

  return defaultFn()
}

export function NotionPage({
  site,
  recordMap,
  error,
  pageId,
  isPasswordProtected
}: types.PageProps) {
  const router = useRouter()
  const lite = useSearchParam('lite')
  const [unlockedPage, setUnlockedPage] = React.useState<{
    pageId: string
    recordMap: types.ExtendedRecordMap
  }>()

  const unlockedRecordMap =
    unlockedPage && unlockedPage.pageId === pageId
      ? unlockedPage.recordMap
      : undefined
  const isLocked = !!isPasswordProtected && !unlockedRecordMap
  const activeRecordMap = unlockedRecordMap || recordMap
  const [selectedFilterKeys, setSelectedFilterKeys] = React.useState<
    Set<string>
  >(() => new Set())

  const components = React.useMemo<Partial<NotionComponents>>(
    () => ({
      nextLegacyImage: Image,
      nextLink: Link,
      Code,
      Collection,
      Equation,
      Pdf,
      Modal,
      Tweet,
      Header: NotionPageHeader,
      propertyLastEditedTimeValue,
      propertyTextValue,
      propertyDateValue
    }),
    []
  )

  // lite mode is for oembed
  const isLiteMode = lite === 'true'

  const [hasMounted, setHasMounted] = React.useState(false)
  const { isDarkMode } = useDarkMode()

  React.useEffect(() => {
    setHasMounted(true)
  }, [])

  const siteMapPageUrl = React.useMemo(() => {
    const params: any = {}
    if (lite) params.lite = lite

    const searchParams = new URLSearchParams(params)
    return site ? mapPageUrl(site, activeRecordMap!, searchParams) : undefined
  }, [site, activeRecordMap, lite])

  const keys = Object.keys(activeRecordMap?.block || {})
  const block = activeRecordMap?.block?.[keys[0]!]?.value

  // const isRootPage =
  //   parsePageId(block?.id) === parsePageId(site?.rootNotionPageId)
  const isBlogPost =
    block?.type === 'page' && block?.parent_table === 'collection'

  const showTableOfContents = !!isBlogPost && !isLocked
  const minTableOfContentsItems = 3

  const pageAside = React.useMemo(
    () =>
      !isLocked && activeRecordMap ? (
        <PageAside
          block={block!}
          recordMap={activeRecordMap}
          isBlogPost={isBlogPost}
        />
      ) : undefined,
    [block, activeRecordMap, isBlogPost, isLocked]
  )

  const footer =
    isLocked && pageId ? (
      <PasswordGate
        pageId={pageId}
        onUnlock={(unlockedMap) =>
          setUnlockedPage({ pageId, recordMap: unlockedMap })
        }
      />
    ) : (
      <Footer />
    )

  const collectionFilterOptions = React.useMemo(
    () =>
      activeRecordMap && pageId === site?.rootNotionPageId
        ? getCollectionFilterOptions(activeRecordMap)
        : [],
    [activeRecordMap, pageId, site?.rootNotionPageId]
  )
  const filteredRecordMap = React.useMemo(
    () =>
      activeRecordMap
        ? filterRecordMapByOptions(
            activeRecordMap,
            collectionFilterOptions,
            selectedFilterKeys
          )
        : undefined,
    [activeRecordMap, collectionFilterOptions, selectedFilterKeys]
  )
  const matchingArticleCount = React.useMemo(
    () =>
      activeRecordMap
        ? countMatchingArticles(
            activeRecordMap,
            collectionFilterOptions,
            selectedFilterKeys
          )
        : 0,
    [activeRecordMap, collectionFilterOptions, selectedFilterKeys]
  )
  const toggleFilterOption = React.useCallback((key: string) => {
    setSelectedFilterKeys((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])
  const clearFilterOptions = React.useCallback(() => {
    setSelectedFilterKeys(new Set())
  }, [])
  const collectionFilterValue = React.useMemo(
    () => ({
      options: collectionFilterOptions,
      selectedKeys: selectedFilterKeys,
      matchingArticleCount,
      toggleOption: toggleFilterOption,
      clearOptions: clearFilterOptions
    }),
    [
      clearFilterOptions,
      collectionFilterOptions,
      matchingArticleCount,
      selectedFilterKeys,
      toggleFilterOption
    ]
  )

  if (router.isFallback) {
    return <Loading />
  }

  if (error || !site || !block || !activeRecordMap) {
    return <Page404 site={site} pageId={pageId} error={error} />
  }

  const title = getBlockTitle(block, activeRecordMap) || site.name

  const canonicalPageUrl = config.isDev
    ? undefined
    : getCanonicalPageUrl(site, activeRecordMap)(pageId)

  const socialImage = mapImageUrl(
    getPageProperty<string>('Social Image', block, activeRecordMap) ||
      (block as PageBlock).format?.page_cover ||
      config.defaultPageCover,
    block
  )

  const socialDescription =
    getPageProperty<string>('Description', block, activeRecordMap) ||
    config.description

  return (
    <>
      <PageHead
        pageId={pageId}
        site={site}
        title={title}
        description={socialDescription}
        image={socialImage}
        url={canonicalPageUrl}
        isBlogPost={isBlogPost}
      />

      {isLiteMode && <BodyClassName className='notion-lite' />}
      {hasMounted && isDarkMode && <BodyClassName className='dark-mode' />}

      <CollectionFilterProvider value={collectionFilterValue}>
        <NotionRenderer
          bodyClassName={cs(
            styles.notion,
            pageId === site.rootNotionPageId && 'index-page'
          )}
          darkMode={hasMounted && isDarkMode}
          components={components}
          recordMap={filteredRecordMap!}
          rootPageId={site.rootNotionPageId}
          rootDomain={site.domain}
          fullPage={!isLiteMode}
          previewImages={!!activeRecordMap.preview_images}
          showCollectionViewDropdown={false}
          showTableOfContents={showTableOfContents}
          minTableOfContentsItems={minTableOfContentsItems}
          defaultPageIcon={config.defaultPageIcon}
          defaultPageCover={config.defaultPageCover}
          defaultPageCoverPosition={config.defaultPageCoverPosition}
          mapPageUrl={siteMapPageUrl}
          mapImageUrl={mapImageUrl}
          searchNotion={config.isSearchEnabled ? searchNotion : undefined}
          pageAside={pageAside}
          footer={footer}
        />
      </CollectionFilterProvider>
    </>
  )
}
