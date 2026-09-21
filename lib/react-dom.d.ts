declare module 'react-dom' {
  import type { Key, ReactNode, ReactPortal } from 'react'

  export function createPortal(
    children: ReactNode,
    container: Element | DocumentFragment,
    key?: Key | null
  ): ReactPortal
}
