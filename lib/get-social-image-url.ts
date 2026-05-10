import { api, host } from './config'

export function getSocialImageUrl(
  pageId: string | undefined,
  baseUrl: string | undefined = host
) {
  try {
    const url = new URL(api.getSocialImage, baseUrl)

    if (pageId) {
      url.searchParams.set('id', pageId)
      return url.toString()
    }
  } catch (err: any) {
    console.warn('error invalid social image url', pageId, err.message)
  }

  return null
}
