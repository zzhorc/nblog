export type SearchLine = {
  text: string
  offset: number
  nodes: Text[]
  element: HTMLElement
}

// Read rendered article text only. Group inline formatting into the same line,
// and keep text nodes so matches can be located without rewriting Notion's DOM.
export function getArticleSearchLines(): SearchLine[] {
  const article = document.querySelector('.notion-page-content-inner')
  if (!article) return []

  const groups = new Map<HTMLElement, Text[]>()
  const walker = document.createTreeWalker(article, NodeFilter.SHOW_TEXT)
  const selector =
    '.notion-text, .notion-h, li, blockquote, pre, td, th, figcaption, .notion-callout-text, summary'

  while (walker.nextNode()) {
    const node = walker.currentNode as Text
    const parent = node.parentElement
    if (
      !node.data ||
      !parent ||
      parent.closest(
        'button, nav, aside, script, style, .notion-table-of-contents, .notion-hash-link, .katex-mathml'
      ) ||
      !parent.getClientRects().length
    ) {
      continue
    }

    const element = parent.closest<HTMLElement>(selector)
    if (!element) continue
    const nodes = groups.get(element) || []
    nodes.push(node)
    groups.set(element, nodes)
  }

  const lines: SearchLine[] = []
  for (const [element, nodes] of groups) {
    const text = nodes.map((node) => node.data).join('')
    let offset = 0
    for (const line of text.split('\n')) {
      if (line.trim()) lines.push({ text: line, offset, nodes, element })
      offset += line.length + 1
    }
  }
  return lines
}

export function getMatchRange(line: SearchLine, query: string): Range | null {
  const index = line.text.toLowerCase().indexOf(query.toLowerCase())
  if (index === -1) return null

  const start = line.offset + index
  const end = start + query.length
  const range = document.createRange()
  let offset = 0
  let hasStart = false

  for (const node of line.nodes) {
    if (!node.isConnected) return null
    const nextOffset = offset + node.length
    if (!hasStart && start < nextOffset) {
      range.setStart(node, start - offset)
      hasStart = true
    }
    if (hasStart && end <= nextOffset) {
      range.setEnd(node, end - offset)
      return range
    }
    offset = nextOffset
  }
  return null
}
