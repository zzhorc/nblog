import ExpiryMap from 'expiry-map'
import { type ExtendedRecordMap } from 'notion-types'
import { getPageTweetIds } from 'notion-utils'
import pMap from 'p-map'
import pMemoize from 'p-memoize'
import { getTweet as getTweetData } from 'react-tweet/api'

import type { ExtendedTweetRecordMap } from './types'
import { isrRevalidateSeconds } from './config'
import { db } from './db'

// Keep tweet data fresh whenever ISR regenerates a page. This applies to both
// the shared Keyv cache and the warm-server memoization cache below.
const tweetCacheTtl = Math.max(isrRevalidateSeconds, 1) * 1000

export async function getTweetsMap(
  recordMap: ExtendedRecordMap
): Promise<void> {
  const tweetIds = getPageTweetIds(recordMap)

  const tweetsMap = Object.fromEntries(
    await pMap(
      tweetIds,
      async (tweetId: string) => {
        return [tweetId, await getTweet(tweetId)]
      },
      {
        concurrency: 8
      }
    )
  )

  ;(recordMap as ExtendedTweetRecordMap).tweets = tweetsMap
}

async function getTweetImpl(tweetId: string): Promise<any> {
  if (!tweetId) return null

  // Version the key so Redis entries written before the TTL was introduced do
  // not keep serving stale tweets after this deploy.
  const cacheKey = `tweet:v2:${tweetId}`

  try {
    try {
      const cachedTweet = await db.get(cacheKey)
      if (cachedTweet || cachedTweet === null) {
        return cachedTweet
      }
    } catch (err: any) {
      // ignore redis errors
      console.warn(`redis error get "${cacheKey}"`, err.message)
    }

    const tweetData = (await getTweetData(tweetId)) || null

    try {
      await db.set(cacheKey, tweetData, tweetCacheTtl)
    } catch (err: any) {
      // ignore redis errors
      console.warn(`redis error set "${cacheKey}"`, err.message)
    }

    return tweetData
  } catch (err: any) {
    console.warn('failed to get tweet', tweetId, err.message)
    return null
  }
}

export const getTweet = pMemoize(getTweetImpl, {
  cache: new ExpiryMap(tweetCacheTtl),
  cacheKey: (...args) => JSON.stringify(args)
})
