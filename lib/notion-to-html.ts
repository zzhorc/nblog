/**
 * Server-side Notion RecordMap → HTML converter for RSS full-text output.
 *
 * Converts Notion block trees into self-contained HTML that renders correctly
 * in RSS readers (images use absolute URLs, no CSS class dependencies).
 */

import { type Block, type ExtendedRecordMap, type Decoration } from 'notion-types'
import { getTextContent } from 'notion-utils'

import { mapImageUrl } from './map-image-url'
import * as config from './config'

// ---------------------------------------------------------------------------
// Rich-text (Decoration) → HTML
// ---------------------------------------------------------------------------

function decorationsToHtml(decorations?: Decoration[], recordMap?: ExtendedRecordMap): string {
    if (!decorations) return ''

    return decorations
        .map(([text, formats]) => {
            let html = escapeHtml(text)

            if (formats) {
                for (const fmt of formats) {
                    switch (fmt[0]) {
                        case 'b':
                            html = `<strong>${html}</strong>`
                            break
                        case 'i':
                            html = `<em>${html}</em>`
                            break
                        case 's':
                            html = `<del>${html}</del>`
                            break
                        case 'c':
                            html = `<code>${html}</code>`
                            break
                        case 'a':
                            html = `<a href="${escapeAttr(fmt[1] as string)}">${html}</a>`
                            break
                        case 'h':
                            // highlight — wrap in <mark> for RSS readers that support it
                            html = `<mark>${html}</mark>`
                            break
                        case '_':
                            html = `<u>${html}</u>`
                            break
                        case 'p': {
                            // Page mention: ‣ with ['p', 'page-id']
                            const pageId = fmt[1] as string
                            if (pageId && recordMap) {
                                const refBlock = recordMap.block[pageId]?.value
                                const pageTitle = refBlock?.properties?.title
                                    ? getTextContent(refBlock.properties.title as Decoration[])
                                    : 'Untitled'
                                const pageUrl = `${config.host}/${pageId.replace(/-/g, '')}`
                                html = `<a href="${escapeAttr(pageUrl)}">${escapeHtml(pageTitle)}</a>`
                            }
                            break
                        }
                        case 'u': {
                            // User mention — just show the text as-is
                            break
                        }
                    }
                }
            }

            return html
        })
        .join('')
}

// ---------------------------------------------------------------------------
// Block → HTML (recursive)
// ---------------------------------------------------------------------------

function blockToHtml(
    blockId: string,
    recordMap: ExtendedRecordMap,
    depth = 0
): string {
    if (depth > 20) return '' // prevent infinite recursion

    const blockValue = recordMap.block[blockId]?.value
    if (!blockValue) return ''

    const { type, properties, content, format } = blockValue as Block & {
        properties?: Record<string, Decoration[] | undefined>
        content?: string[]
        format?: Record<string, any>
    }

    const title = properties?.title
    const richText = decorationsToHtml(title, recordMap)
    const childHtml = (content || [])
        .map((childId) => blockToHtml(childId, recordMap, depth + 1))
        .join('')

    switch (type) {
        // ---- Text blocks ----
        case 'text':
            if (!richText && !childHtml) return ''
            return `<p>${richText}</p>${childHtml}`

        case 'header':
            return `<h2>${richText}</h2>${childHtml}`

        case 'sub_header':
            return `<h3>${richText}</h3>${childHtml}`

        case 'sub_sub_header':
            return `<h4>${richText}</h4>${childHtml}`

        // ---- Lists ----
        case 'bulleted_list':
            return `<!--UL--><li>${richText}${childHtml}</li><!--/UL-->`

        case 'numbered_list':
            return `<!--OL--><li>${richText}${childHtml}</li><!--/OL-->`

        case 'to_do': {
            const checked = properties?.checked?.[0]?.[0] === 'Yes'
            const checkbox = checked ? '☑ ' : '☐ '
            return `<!--UL--><li>${checkbox}${richText}${childHtml}</li><!--/UL-->`
        }


        // ---- Quote / Callout ----
        case 'quote':
            return `<blockquote>${richText}${childHtml}</blockquote>`

        case 'callout': {
            const icon = format?.page_icon || ''
            return `<div style="padding:12px 16px;border:1px solid #e0e0e0;border-radius:4px;margin:8px 0;">${icon ? `<span style="margin-right:8px;">${escapeHtml(icon)}</span>` : ''}${richText}${childHtml}</div>`
        }

        // ---- Code ----
        case 'code': {
            const language = properties?.language?.[0]?.[0] || ''
            const codeText = getTextContent(title || [])
            return `<pre><code class="language-${escapeAttr(language)}">${escapeHtml(codeText)}</code></pre>`
        }

        // ---- Media ----
        case 'image': {
            const source = format?.display_source || properties?.source?.[0]?.[0]
            if (!source) return ''
            const imgUrl = resolveImageUrl(source, blockValue as Block)
            const caption = properties?.caption
                ? decorationsToHtml(properties.caption, recordMap)
                : ''
            return `<figure style="margin:16px 0;"><img src="${escapeAttr(imgUrl)}" alt="${escapeAttr(getTextContent(properties?.caption || []))}" style="max-width:100%;height:auto;" />${caption ? `<figcaption style="text-align:center;color:#666;font-size:0.9em;margin-top:4px;">${caption}</figcaption>` : ''}</figure>`
        }

        case 'video': {
            const source = format?.display_source || properties?.source?.[0]?.[0]
            if (!source) return ''
            return `<p><a href="${escapeAttr(source)}">${escapeHtml(source)}</a></p>`
        }

        // ---- Embed / Bookmark ----
        case 'bookmark': {
            const link = properties?.link?.[0]?.[0] || ''
            const bookmarkTitle = richText || link
            return `<p>🔗 <a href="${escapeAttr(link)}">${bookmarkTitle || escapeHtml(link)}</a></p>`
        }

        case 'embed':
        case 'maps':
        case 'tweet':
        case 'pdf':
        case 'gist': {
            const src = format?.display_source || properties?.source?.[0]?.[0] || ''
            return src
                ? `<p><a href="${escapeAttr(src)}">${escapeHtml(src)}</a></p>`
                : ''
        }

        // ---- Structural ----
        case 'divider':
            return '<hr />'

        case 'toggle':
            return `<details open><summary>${richText}</summary>${childHtml}</details>`

        case 'column_list':
            return childHtml

        case 'column':
            return childHtml

        // ---- Collection / Database Views ----
        case 'collection_view':
        case 'collection_view_page':
            return '' // skip database views in RSS

        // ---- Page (sub-page link) ----
        case 'page': {
            const pageTitle = richText || 'Untitled'
            return `<p>📄 ${pageTitle}</p>`
        }

        // ---- Table ----
        case 'table':
            return `<table border="1" cellpadding="4" cellspacing="0" style="border-collapse:collapse;">${childHtml}</table>`

        case 'table_row': {
            const cells = (properties as any) || {}
            const cellEntries = Object.keys(cells)
                .sort()
                .map((key) => {
                    const cellContent = decorationsToHtml(cells[key], recordMap)
                    return `<td>${cellContent}</td>`
                })
            return `<tr>${cellEntries.join('')}</tr>`
        }

        default:
            // For unknown block types, just render children if any
            return childHtml
    }
}

// ---------------------------------------------------------------------------
// Merge adjacent same-type list items
// ---------------------------------------------------------------------------

function mergeAdjacentLists(html: string): string {
    // Replace adjacent UL markers with proper <ul> wrapper
    html = html.replace(/(<!--UL--><li>.*?<\/li><!--\/UL-->(?:\s*<!--UL--><li>.*?<\/li><!--\/UL-->)*)/gs, (match) => {
        const items = match.replace(/<!--\/?UL-->/g, '')
        return `<ul>${items}</ul>`
    })
    // Replace adjacent OL markers with proper <ol> wrapper
    html = html.replace(/(<!--OL--><li>.*?<\/li><!--\/OL-->(?:\s*<!--OL--><li>.*?<\/li><!--\/OL-->)*)/gs, (match) => {
        const items = match.replace(/<!--\/?OL-->/g, '')
        return `<ol>${items}</ol>`
    })
    return html
}

// ---------------------------------------------------------------------------
// Image URL resolution
// ---------------------------------------------------------------------------

function resolveImageUrl(url: string, block: Block): string {
    const mapped = mapImageUrl(url, block)
    if (!mapped) return url

    // If the URL is relative, prefix with the site host
    if (mapped.startsWith('/')) {
        return `${config.host}${mapped}`
    }

    return mapped
}

// ---------------------------------------------------------------------------
// HTML escaping
// ---------------------------------------------------------------------------

function escapeHtml(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
}

function escapeAttr(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Convert a Notion page's blocks into a self-contained HTML string suitable
 * for RSS `<content:encoded>`.
 *
 * @param recordMap — The full ExtendedRecordMap for the page
 * @param pageBlockId — The root block ID of the page
 */
export function notionBlocksToHtml(
    recordMap: ExtendedRecordMap,
    pageBlockId: string
): string {
    const pageBlock = recordMap.block[pageBlockId]?.value
    if (!pageBlock) return ''

    const contentIds = (pageBlock as any).content as string[] | undefined
    if (!contentIds || contentIds.length === 0) return ''

    const rawHtml = contentIds
        .map((blockId) => blockToHtml(blockId, recordMap))
        .join('\n')

    return mergeAdjacentLists(rawHtml)
}
