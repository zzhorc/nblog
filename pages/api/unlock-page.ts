import { createHash, timingSafeEqual } from 'node:crypto'

import { type NextApiRequest, type NextApiResponse } from 'next'
import { getPageProperty, parsePageId } from 'notion-utils'

import * as acl from '@/lib/acl'
import { site } from '@/lib/config'
import { getPage } from '@/lib/notion'
import {
  getPagePassword,
  getRootPageBlock,
  sanitizeRecordMap
} from '@/lib/password-protection'
import {
  beginPasswordAttempt,
  clearPasswordFailures,
  recordPasswordFailure
} from '@/lib/password-rate-limit'

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '2kb'
    }
  }
}

export default async function unlockPage(
  req: NextApiRequest,
  res: NextApiResponse
) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0')
  res.setHeader('Pragma', 'no-cache')

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ message: 'Method not allowed' })
  }

  const pageId = parsePageId(
    typeof req.body?.pageId === 'string' ? req.body.pageId : ''
  )
  const password =
    typeof req.body?.password === 'string' ? req.body.password : ''

  if (!pageId || !password || password.length > 256) {
    return res.status(400).json({ message: '请输入文章密码' })
  }

  const rateLimit = await beginPasswordAttempt(req, pageId)
  if (!rateLimit.allowed) {
    res.setHeader('Retry-After', String(rateLimit.retryAfter))
    return res.status(429).json({
      message: rateLimit.locked
        ? '错误次数过多，请稍后再试'
        : '操作过于频繁，请稍后再试',
      retryAfter: rateLimit.retryAfter,
      locked: rateLimit.locked
    })
  }

  try {
    const recordMap = await getPage(pageId)
    const aclError = await acl.pageAcl({ site, recordMap, pageId })
    const block = getRootPageBlock(recordMap, pageId)
    const isPublic =
      block &&
      (getPageProperty<boolean | null>('Public', block, recordMap) ?? true)
    const expectedPassword = getPagePassword(recordMap, pageId)

    if (aclError?.error || !block || !isPublic || !expectedPassword) {
      return res.status(404).json({ message: '文章不存在或无需解锁' })
    }

    if (!passwordsMatch(password, expectedPassword)) {
      const failure = await recordPasswordFailure(req, pageId)
      if (failure.retryAfter) {
        res.setHeader('Retry-After', String(failure.retryAfter))
        return res.status(429).json({
          message: '密码错误次数过多，已锁定 5 分钟',
          retryAfter: failure.retryAfter,
          locked: true,
          attemptsRemaining: 0
        })
      }

      return res.status(401).json({
        message: '密码错误',
        attemptsRemaining: failure.attemptsRemaining
      })
    }

    await clearPasswordFailures(req, pageId)
    return res.status(200).json({
      recordMap: sanitizeRecordMap(recordMap, { unlockedPageId: pageId })
    })
  } catch (err) {
    console.error('unlock page error', pageId, err)
    return res.status(500).json({ message: '暂时无法验证，请稍后再试' })
  }
}

function passwordsMatch(actual: string, expected: string): boolean {
  const actualHash = createHash('sha256').update(actual).digest()
  const expectedHash = createHash('sha256').update(expected).digest()
  return timingSafeEqual(actualHash, expectedHash)
}
