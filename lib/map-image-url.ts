import { type Block } from 'notion-types'
import { defaultMapImageUrl } from 'notion-utils'

import { defaultPageCover, defaultPageIcon } from './config'

export const mapImageUrl = (url: string | undefined, block: Block) => {
  if (!url) {
    return undefined
  }

  if (url === defaultPageCover || url === defaultPageIcon) {
    return url
  }

  // Notion attachment URLs often fail to load (require auth / expire).
  // Replace them with the local logo image.
  if (url.includes('attachment%3A') || url.includes('attachment:')) {
    return '/logo.png'
  }

  return defaultMapImageUrl(url, block)
}
