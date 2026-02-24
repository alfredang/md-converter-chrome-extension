document.addEventListener('DOMContentLoaded', () => {
  const richtext = document.getElementById('richtext');
  const markdown = document.getElementById('markdown');
  const copyMdBtn = document.getElementById('copy-md-btn');
  const copyHtmlBtn = document.getElementById('copy-html-btn');
  const clearBtn = document.getElementById('clear-btn');
  const toast = document.getElementById('toast');

  // Flag to prevent circular updates
  let isUpdating = false;

  // Initialize Turndown with GFM plugin
  const turndownService = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
    emDelimiter: '_',
    strongDelimiter: '**',
  });

  // Use GFM plugin for tables, strikethrough, and task lists
  turndownService.use(turndownPluginGfm.gfm);

  // Custom rule for better code handling
  turndownService.addRule('codeBlock', {
    filter: (node) => {
      return node.nodeName === 'PRE' && node.querySelector('code');
    },
    replacement: (content, node) => {
      const code = node.querySelector('code');
      const className = code.getAttribute('class') || '';
      const langMatch = className.match(/language-(\w+)/);
      const lang = langMatch ? langMatch[1] : '';
      return `\n\`\`\`${lang}\n${code.textContent.trim()}\n\`\`\`\n`;
    },
  });

  // Strip blockquote markers — render as plain text
  turndownService.addRule('blockquote', {
    filter: 'blockquote',
    replacement: (content) => {
      return '\n' + content.trim() + '\n';
    },
  });

  // Custom rule for compact list items (no extra blank lines)
  turndownService.addRule('listItem', {
    filter: 'li',
    replacement: (content, node, options) => {
      content = content
        .replace(/^\n+/, '')
        .replace(/\n+$/, '\n')
        .replace(/\n/gm, '\n    ');

      let prefix = options.bulletListMarker + ' ';
      const parent = node.parentNode;
      if (parent.nodeName === 'OL') {
        const start = parent.getAttribute('start');
        const index = Array.prototype.indexOf.call(parent.children, node);
        prefix = (start ? Number(start) + index : index + 1) + '. ';
      }

      return prefix + content.trim() + '\n';
    },
  });

  // Post-process to remove blank lines before lists
  function compactMarkdown(md) {
    return md.replace(/\n\n+(-|\d+\.)\s/g, '\n$1 ');
  }

  // Convert markdown to rendered HTML for the rich text panel
  function convertMarkdownToRenderedHTML(md) {
    const lines = md.split('\n');
    const htmlParts = [];
    let listType = null;
    let inCodeBlock = false;
    let codeLines = [];
    let codeLang = '';

    function escapeHTML(text) {
      return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    }

    function processInline(text) {
      text = escapeHTML(text);
      // Bold: **text**
      text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      // Italic: _text_
      text = text.replace(/_([^_]+)_/g, '<em>$1</em>');
      // Strikethrough: ~~text~~
      text = text.replace(/~~([^~]+)~~/g, '<del>$1</del>');
      // Inline code: `text`
      text = text.replace(/`([^`]+)`/g, '<code>$1</code>');
      // Links: [text](url)
      text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
      // Images: ![alt](url)
      text = text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1">');
      return text;
    }

    function closeList() {
      if (listType) {
        htmlParts.push(`</${listType}>`);
        listType = null;
      }
    }

    for (const line of lines) {
      const trimmed = line.trim();

      // Code block fences
      if (trimmed.startsWith('```')) {
        if (!inCodeBlock) {
          closeList();
          inCodeBlock = true;
          codeLang = trimmed.slice(3).trim();
          codeLines = [];
        } else {
          const langAttr = codeLang ? ` class="language-${codeLang}"` : '';
          htmlParts.push(`<pre><code${langAttr}>${escapeHTML(codeLines.join('\n'))}</code></pre>`);
          inCodeBlock = false;
          codeLines = [];
          codeLang = '';
        }
        continue;
      }

      if (inCodeBlock) {
        codeLines.push(line);
        continue;
      }

      // Horizontal rule
      if (/^((\* ){2,}\*|(-\s*){3,}|_{3,})$/.test(trimmed)) {
        closeList();
        htmlParts.push('<hr>');
        continue;
      }

      // Heading
      const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
      if (headingMatch) {
        closeList();
        const level = headingMatch[1].length;
        const headingText = processInline(headingMatch[2]);
        htmlParts.push(`<h${level}>${headingText}</h${level}>`);
        continue;
      }

      // Unordered list item
      const ulMatch = trimmed.match(/^[-*+]\s+(.+)$/);
      if (ulMatch) {
        if (listType !== 'ul') {
          closeList();
          htmlParts.push('<ul>');
          listType = 'ul';
        }
        htmlParts.push(`<li>${processInline(ulMatch[1])}</li>`);
        continue;
      }

      // Ordered list item
      const olMatch = trimmed.match(/^\d+\.\s+(.+)$/);
      if (olMatch) {
        if (listType !== 'ol') {
          closeList();
          htmlParts.push('<ol>');
          listType = 'ol';
        }
        htmlParts.push(`<li>${processInline(olMatch[1])}</li>`);
        continue;
      }

      // Empty line
      if (trimmed === '') {
        closeList();
        continue;
      }

      // Regular paragraph
      closeList();
      htmlParts.push(`<p>${processInline(trimmed)}</p>`);
    }

    // Close any unclosed code block
    if (inCodeBlock) {
      const langAttr = codeLang ? ` class="language-${codeLang}"` : '';
      htmlParts.push(`<pre><code${langAttr}>${escapeHTML(codeLines.join('\n'))}</code></pre>`);
    }

    closeList();
    return htmlParts.join('\n');
  }

  // Convert markdown to clean source HTML (for Copy HTML)
  function convertMarkdownToSourceHTML(md) {
    // Reuse the rendered HTML - it's already clean
    return convertMarkdownToRenderedHTML(md);
  }

  function updateButtons() {
    const md = markdown.value.trim();
    copyMdBtn.disabled = !md;
    copyHtmlBtn.disabled = !md;
  }

  // --- Rich Text → Markdown ---
  function onRichTextChange() {
    if (isUpdating) return;
    isUpdating = true;

    const html = richtext.innerHTML;
    if (html && html !== '<br>' && html !== '<div><br></div>') {
      const md = turndownService.turndown(html);
      markdown.value = compactMarkdown(md.trim());
    } else {
      markdown.value = '';
    }

    updateButtons();
    saveState();
    isUpdating = false;
  }

  // --- Markdown → Rich Text ---
  function onMarkdownChange() {
    if (isUpdating) return;
    isUpdating = true;

    const md = markdown.value;
    if (md.trim()) {
      richtext.innerHTML = convertMarkdownToRenderedHTML(md);
    } else {
      richtext.innerHTML = '';
    }

    updateButtons();
    saveState();
    isUpdating = false;
  }

  // Handle paste in rich text area
  richtext.addEventListener('paste', (e) => {
    e.preventDefault();

    const html = e.clipboardData.getData('text/html');
    const plainText = e.clipboardData.getData('text/plain');

    if (html) {
      richtext.innerHTML = html;
    } else if (plainText) {
      richtext.textContent = plainText;
    }

    onRichTextChange();
  });

  // Handle input in rich text area
  richtext.addEventListener('input', () => {
    onRichTextChange();
  });

  // Handle input in markdown area
  markdown.addEventListener('input', () => {
    onMarkdownChange();
  });

  // Handle paste in markdown area (treat as plain text)
  markdown.addEventListener('paste', (e) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    const start = markdown.selectionStart;
    const end = markdown.selectionEnd;
    markdown.value = markdown.value.substring(0, start) + text + markdown.value.substring(end);
    markdown.selectionStart = markdown.selectionEnd = start + text.length;
    onMarkdownChange();
  });

  // Copy MD button handler
  copyMdBtn.addEventListener('click', async () => {
    const md = markdown.value.trim();
    if (!md) return;
    try {
      await navigator.clipboard.writeText(md);
      showToast('Markdown copied!');
    } catch (err) {
      fallbackCopy(md);
      showToast('Markdown copied!');
    }
  });

  // Copy HTML button handler
  copyHtmlBtn.addEventListener('click', async () => {
    const md = markdown.value.trim();
    if (!md) return;
    const html = convertMarkdownToSourceHTML(md);
    try {
      await navigator.clipboard.writeText(html);
      showToast('HTML copied!');
    } catch (err) {
      fallbackCopy(html);
      showToast('HTML copied!');
    }
  });

  // Fallback copy for older browsers
  function fallbackCopy(text) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
  }

  // Clear button handler
  clearBtn.addEventListener('click', () => {
    richtext.innerHTML = '';
    markdown.value = '';
    copyMdBtn.disabled = true;
    copyHtmlBtn.disabled = true;
    richtext.focus();
    saveState();
  });

  // Save state to chrome.storage.local
  function saveState() {
    chrome.storage.local.set({
      richTextHTML: richtext.innerHTML,
      markdownText: markdown.value,
    });
  }

  // Restore state from chrome.storage.local
  function restoreState() {
    chrome.storage.local.get(['richTextHTML', 'markdownText'], (result) => {
      if (result.markdownText) {
        markdown.value = result.markdownText;
      }
      if (result.richTextHTML) {
        richtext.innerHTML = result.richTextHTML;
      }
      updateButtons();

      if (!richtext.innerHTML && !markdown.value) {
        richtext.focus();
      }
    });
  }

  // Toast notification
  function showToast(message) {
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => {
      toast.classList.remove('show');
    }, 2000);
  }

  // Restore saved state on load
  restoreState();
});
