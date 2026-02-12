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

  // Replace page icon attachment URLs with local logo.
  // Only matches when the URL IS the page icon (not regular content attachments).
  const pageIcon = (block as any)?.format?.page_icon
  if (pageIcon && pageIcon.startsWith('attachment:') && url === pageIcon) {
    return '/logo.png'
  }

  return defaultMapImageUrl(url, block)
}
