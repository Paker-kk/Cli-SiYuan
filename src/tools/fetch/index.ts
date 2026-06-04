import type { SiYuanClient } from '../../api/client';
import type { CategoryToolConfig, FetchAction } from '../../core/config';
import { FETCH_ACTION_HINTS, FETCH_GUIDANCE } from '../../core/help';
import type { PermissionManager } from '../../core/permissions';
import {
    FetchActionSchema,
    FetchSchema,
} from '../../core/types';
import { defineTool } from '../internal/define-tool';
import { createJsonResult, createZodActionVariant, type ActionVariant, type ToolResult } from '../internal/shared';

export const FETCH_TOOL_NAME = 'fetch';

export const FETCH_VARIANTS: ActionVariant<FetchAction>[] = [
    createZodActionVariant('fetch', FetchSchema, 'Fetch a web page and return its content as Markdown or raw HTML.'),
];

const DEFAULT_USER_AGENT = 'SiYuan-MCP-Sisyphus/1.0';

function htmlToMarkdown(html: string, baseUrl: string): string {
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
    const body = bodyMatch ? bodyMatch[1] : html;

    let text = body
        .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '')
        .replace(/<template[^>]*>[\s\S]*?<\/template>/gi, '')
        .replace(/<svg[^>]*>[\s\S]*?<\/svg>/gi, '')
        .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
        .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
        .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '');

    text = text.replace(/<br\s*\/?>/gi, '\n');
    text = text.replace(/<\/p>/gi, '\n\n');
    text = text.replace(/<\/h[1-6]>/gi, '\n\n');
    text = text.replace(/<\/li>/gi, '\n');
    text = text.replace(/<\/(div|section|article|main|aside)>/gi, '\n');
    text = text.replace(/<\/(table|tr)>/gi, '\n');
    text = text.replace(/<\/(blockquote|pre)>/gi, '\n\n');

    text = text.replace(/<a\s+[^>]*href\s*=\s*["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, href, content) => {
        try {
            const resolved = new URL(href, baseUrl).href;
            return `[${content.trim()}](${resolved})`;
        } catch {
            return `[${content.trim()}](${href})`;
        }
    });

    text = text.replace(/<img\s+[^>]*src\s*=\s*["']([^"']*)["'][^>]*alt\s*=\s*["']([^"']*)["'][^>]*>/gi,
        (_, src, alt) => { try { return `![${alt}](${new URL(src, baseUrl).href})`; } catch { return `![${alt}](${src})`; } });
    text = text.replace(/<img\s+[^>]*alt\s*=\s*["']([^"']*)["'][^>]*src\s*=\s*["']([^"']*)["'][^>]*>/gi,
        (_, alt, src) => { try { return `![${alt}](${new URL(src, baseUrl).href})`; } catch { return `![${alt}](${src})`; } });
    text = text.replace(/<img\s+[^>]*src\s*=\s*["']([^"']*)["'][^>]*>/gi,
        (_, src) => { try { return `![](${new URL(src, baseUrl).href})`; } catch { return `![](${src})`; } });

    text = text.replace(/<\/?(strong|b)>/gi, '**');
    text = text.replace(/<\/?(em|i)>/gi, '*');

    text = text.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, (_, c) => `\n# ${c.trim()}\n`);
    text = text.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, (_, c) => `\n## ${c.trim()}\n`);
    text = text.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, (_, c) => `\n### ${c.trim()}\n`);
    text = text.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, (_, c) => `\n#### ${c.trim()}\n`);
    text = text.replace(/<h5[^>]*>([\s\S]*?)<\/h5>/gi, (_, c) => `\n##### ${c.trim()}\n`);
    text = text.replace(/<h6[^>]*>([\s\S]*?)<\/h6>/gi, (_, c) => `\n###### ${c.trim()}\n`);

    text = text.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_, c) => `- ${c.trim()}`);
    text = text.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi,
        (_, c) => `\n${c.trim().split('\n').map((l: string) => `> ${l}`).join('\n')}\n`);

    text = text.replace(/<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi, (_, c) => `\n\`\`\`\n${c.replace(/<[^>]*>/g, '')}\n\`\`\`\n`);
    text = text.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, (_, c) => `\`${c.replace(/<[^>]*>/g, '')}\``);

    text = text.replace(/<hr\s*\/?>/gi, '\n---\n');

    text = text.replace(/<[^>]+>/g, '');

    text = text.replace(/&amp;/g, '&');
    text = text.replace(/&lt;/g, '<');
    text = text.replace(/&gt;/g, '>');
    text = text.replace(/&quot;/g, '"');
    text = text.replace(/&#x27;/g, "'");
    text = text.replace(/&#39;/g, "'");
    text = text.replace(/&nbsp;/g, ' ');

    text = text.replace(/\n{3,}/g, '\n\n');
    text = text.replace(/^[ \t]+/gm, '');
    text = text.trim();

    return text;
}

const fetchTool = defineTool<FetchAction>({
    name: FETCH_TOOL_NAME,
    description: '🌐 Fetch a web page and return its content as clean Markdown (default) or raw HTML. Use to read web content context for AI operations.',
    variants: FETCH_VARIANTS,
    actionSchema: FetchActionSchema,
    aggregateOptions: {
        guidance: FETCH_GUIDANCE,
        actionHints: FETCH_ACTION_HINTS,
    },
    handlers: {
        fetch: async ({ rawArgs }) => {
            const parsed = FetchSchema.parse(rawArgs);
            const { url, maxLength, startIndex, raw } = parsed;

            const response = await fetch(url, {
                headers: { 'User-Agent': DEFAULT_USER_AGENT },
            });

            if (!response.ok) {
                return createJsonResult({
                    error: `Failed to fetch ${url} — HTTP ${response.status} ${response.statusText}`,
                });
            }

            const contentType = response.headers.get('content-type') || '';
            const text = await response.text();
            const isHtml = text.toLowerCase().includes('<html') || contentType.includes('text/html');

            let content: string;
            if (raw || !isHtml) {
                content = text;
            } else {
                content = htmlToMarkdown(text, url);
            }

            const limit = maxLength ?? 5000;
            const offset = startIndex ?? 0;
            const totalLength = content.length;

            let truncated = false;
            if (totalLength > limit) {
                content = content.substring(offset, offset + limit);
                truncated = true;
            }

            return createJsonResult({
                url,
                contentType,
                isHtml,
                raw,
                totalLength,
                displayStart: offset,
                displayEnd: offset + content.length,
                ...(truncated ? { truncated: true, hint: `Use startIndex=${offset + limit} to get more content when paginating.` } : {}),
                content,
            });
        },
    },
});

export function listFetchTools(config: CategoryToolConfig<FetchAction>) {
    return fetchTool.listTools(config);
}

export async function callFetchTool(
    client: SiYuanClient,
    args: Record<string, unknown> | undefined,
    config: CategoryToolConfig<FetchAction>,
    permMgr: PermissionManager,
): Promise<ToolResult> {
    return fetchTool.callTool(client, args, config, permMgr);
}
