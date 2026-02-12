import { type Block } from 'notion-types'
import { defaultMapImageUrl } from 'notion-utils'

import { defaultPageCover, defaultPageIcon } from './config'

// The Notion root page icon attachment URL.
// This specific attachment fails to load externally, so we replace it
// with the local /logo.png file. Update this if you change your
// Notion page icon.
const ROOT_PAGE_ICON_ATTACHMENT =
  'attachment:b49c0d70-303b-4c64-9635-5196dc4eb149:0_image_25F.png'

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

  return defaultMapImageUrl(url, block)
}
