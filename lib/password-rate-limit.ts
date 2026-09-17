import { createHash } from 'node:crypto'

import { type NextApiRequest } from 'next'

import { db } from './db'

const minimumAttemptIntervalMs = 1000
const maximumFailures = 5
const lockDurationMs = 5 * 60_000
const stateTtlMs = 10 * 60_000

interface PasswordAttemptState {
  failures: number
  lastAttemptAt: number
  lockedUntil: number
}

export interface RateLimitResult {
  allowed: boolean
  retryAfter: number
  locked: boolean
}

export async function beginPasswordAttempt(
  req: NextApiRequest,
  pageId: string
): Promise<RateLimitResult> {
  const key = getRateLimitKey(req, pageId)
  const now = Date.now()
  const state = await getState(key)

  if (state.lockedUntil > now) {
    return {
      allowed: false,
      retryAfter: secondsUntil(state.lockedUntil, now),
      locked: true
    }
  }

  if (now - state.lastAttemptAt < minimumAttemptIntervalMs) {
    return {
      allowed: false,
      retryAfter: secondsUntil(
        state.lastAttemptAt + minimumAttemptIntervalMs,
        now
      ),
      locked: false
    }
  }

  await db.set(
    key,
    { ...state, lastAttemptAt: now, lockedUntil: 0 },
    stateTtlMs
  )

  return { allowed: true, retryAfter: 0, locked: false }
}

export async function recordPasswordFailure(
  req: NextApiRequest,
  pageId: string
): Promise<{ attemptsRemaining: number; retryAfter: number }> {
  const key = getRateLimitKey(req, pageId)
  const now = Date.now()
  const state = await getState(key)
  const failures = state.failures + 1
  const shouldLock = failures >= maximumFailures
  const lockedUntil = shouldLock ? now + lockDurationMs : 0

  await db.set(
    key,
    {
      failures,
      lastAttemptAt: state.lastAttemptAt || now,
      lockedUntil
    },
    shouldLock ? lockDurationMs : stateTtlMs
  )

  return {
    attemptsRemaining: Math.max(0, maximumFailures - failures),
    retryAfter: shouldLock ? secondsUntil(lockedUntil, now) : 0
  }
}

export async function clearPasswordFailures(
  req: NextApiRequest,
  pageId: string
): Promise<void> {
  await db.delete(getRateLimitKey(req, pageId))
}

function getRateLimitKey(req: NextApiRequest, pageId: string): string {
  const ip = getClientIp(req)
  const ipHash = createHash('sha256').update(ip).digest('hex')
  const normalizedPageId = pageId.replaceAll('-', '').toLowerCase()
  return `password-attempt:${normalizedPageId}:${ipHash}`
}

function getClientIp(req: NextApiRequest): string {
  const forwarded =
    req.headers['x-vercel-forwarded-for'] || req.headers['x-forwarded-for']
  const value = Array.isArray(forwarded) ? forwarded[0] : forwarded

  return value?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown'
}

async function getState(key: string): Promise<PasswordAttemptState> {
  return (
    (await db.get(key)) || {
      failures: 0,
      lastAttemptAt: 0,
      lockedUntil: 0
    }
  )
}

function secondsUntil(timestamp: number, now: number): number {
  return Math.max(1, Math.ceil((timestamp - now) / 1000))
}
