import * as React from 'react'

import { api } from '@/lib/config'
import { type ExtendedRecordMap } from '@/lib/types'

import styles from './PasswordGate.module.css'

interface UnlockResponse {
  recordMap?: ExtendedRecordMap
  message?: string
  retryAfter?: number
  attemptsRemaining?: number
  locked?: boolean
}

export function PasswordGate({
  pageId,
  onUnlock
}: {
  pageId: string
  onUnlock: (recordMap: ExtendedRecordMap) => void
}) {
  const [password, setPassword] = React.useState('')
  const [message, setMessage] = React.useState('')
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [blockedUntil, setBlockedUntil] = React.useState(0)
  const [now, setNow] = React.useState(() => Date.now())

  const remainingSeconds = Math.max(0, Math.ceil((blockedUntil - now) / 1000))
  const isBlocked = remainingSeconds > 0

  React.useEffect(() => {
    if (!isBlocked) return

    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [isBlocked])

  React.useEffect(() => {
    setPassword('')
    setMessage('')
    setBlockedUntil(0)
    setNow(Date.now())
  }, [pageId])

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!password || isSubmitting || isBlocked) return

    setIsSubmitting(true)
    setMessage('')
    const requestStartedAt = Date.now()
    setBlockedUntil(requestStartedAt + 1000)
    setNow(requestStartedAt)

    try {
      const response = await fetch(api.unlockPage, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pageId, password })
      })
      const result = (await response.json()) as UnlockResponse

      if (response.ok && result.recordMap) {
        onUnlock(result.recordMap)
        setPassword('')
        return
      }

      const retryAfter = Number(result.retryAfter || 0)
      if (retryAfter > 0) {
        const blockedAt = Date.now()
        setBlockedUntil(blockedAt + retryAfter * 1000)
        setNow(blockedAt)
      }

      if (typeof result.attemptsRemaining === 'number') {
        setMessage(
          `${result.message || '密码错误'}，还可尝试 ${result.attemptsRemaining} 次`
        )
      } else {
        setMessage(result.message || '验证失败，请稍后再试')
      }
    } catch {
      setMessage('网络异常，请稍后再试')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section className={styles.wrapper} aria-labelledby='password-gate-title'>
      <div className={styles.card}>
        <div className={styles.lock} aria-hidden='true'>
          锁
        </div>
        <h2 id='password-gate-title' className={styles.title}>
          这篇文章已加密
        </h2>
        <p className={styles.description}>输入密码后即可继续阅读</p>

        <form className={styles.form} onSubmit={onSubmit}>
          <label className={styles.label} htmlFor='article-password'>
            文章密码
          </label>
          <div className={styles.controls}>
            <input
              id='article-password'
              className={styles.input}
              type='password'
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete='current-password'
              maxLength={256}
              disabled={isSubmitting || isBlocked}
              aria-describedby={message ? 'password-gate-message' : undefined}
              autoFocus
            />
            <button
              className={styles.button}
              type='submit'
              disabled={!password || isSubmitting || isBlocked}
            >
              {isSubmitting ? '验证中…' : '解锁'}
            </button>
          </div>
        </form>

        <div
          id='password-gate-message'
          className={styles.message}
          aria-live='polite'
        >
          {isBlocked && remainingSeconds > 1
            ? `请等待 ${formatDuration(remainingSeconds)} 后再试`
            : message}
        </div>
      </div>
    </section>
  )
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds} 秒`

  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  return remainder ? `${minutes} 分 ${remainder} 秒` : `${minutes} 分钟`
}
