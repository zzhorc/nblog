import { type Block } from 'notion-types'
import { defaultMapImageUrl } from 'notion-utils'

import { defaultPageCover, defaultPageIcon, isServer } from './config'

// The Notion root page icon attachment URL.
// This specific attachment fails to load externally, so we replace it
// with the local /logo.png file. Update this if you change your
// Notion page icon.
const ROOT_PAGE_ICON_ATTACHMENT =
  'attachment:b49c0d70-303b-4c64-9635-5196dc4eb149:0_image_25F.png'

// Collection covers are rendered as relatively small cards. Asking Notion for
// a thumbnail avoids downloading multi-megabyte originals for the article list.
const COLLECTION_COVER_WIDTH = 640

export const mapImageUrl = (url: string | undefined, block: Block) => {
  if (!url) {
    return undefined
  }

  if (url === defaultPageCover || url === defaultPageIcon) {
    return url
  }

  // Replace the root page icon attachment with local logo
  if (url === ROOT_PAGE_ICON_ATTACHMENT) {
    return '/logo.png'
  }

  const mappedUrl = defaultMapImageUrl(url, block)

  // Browser requests to notion.so/image can hang in some networks. Keep
  // server-side consumers on the original URL and proxy browser requests
  // through our own origin instead.
  if (!isServer && mappedUrl && shouldProxyNotionImage(mappedUrl)) {
    const imageUrl = new URL(mappedUrl)

    if (isCollectionCover(url, block)) {
      imageUrl.searchParams.set('width', String(COLLECTION_COVER_WIDTH))
    }

    return `/api/notion-image?url=${encodeURIComponent(imageUrl.toString())}`
  }

  return mappedUrl
}

function isCollectionCover(url: string, block: Block): boolean {
  return (
    block.type === 'page' &&
    block.parent_table === 'collection' &&
    block.format?.page_cover === url
  )
}

function shouldProxyNotionImage(url: string): boolean {
  try {
    const parsedUrl = new URL(url)
    return (
      parsedUrl.protocol === 'https:' &&
      ['www.notion.so', 'notion.so'].includes(parsedUrl.hostname) &&
      parsedUrl.pathname.startsWith('/image/')
    )
  } catch {
    return false
  }
}
