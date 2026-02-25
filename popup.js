document.addEventListener('DOMContentLoaded', () => {
  const richtext = document.getElementById('richtext');
  const output = document.getElementById('output');
  const copyMdBtn = document.getElementById('copy-md-btn');
  const copyHtmlBtn = document.getElementById('copy-html-btn');
  const clearBtn = document.getElementById('clear-btn');
  const toast = document.getElementById('toast');
  const tabBtns = document.querySelectorAll('.tab-btn');

  // Flag to prevent circular updates
  let isUpdating = false;
  let outputMode = 'markdown'; // 'markdown' or 'html'
  let currentMarkdown = '';
  let currentHTML = '';

  // Initialize Turndown with GFM plugin
  const turndownService = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
    emDelimiter: '_',
    strongDelimiter: '**',
  });

  // Disable Turndown's escaping so literal >, *, _ etc. are not backslash-escaped
  turndownService.escape = (str) => str;

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

  // Convert markdown to rendered HTML
  function convertMarkdownToHTML(md) {
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
      text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      text = text.replace(/_([^_]+)_/g, '<em>$1</em>');
      text = text.replace(/~~([^~]+)~~/g, '<del>$1</del>');
      text = text.replace(/`([^`]+)`/g, '<code>$1</code>');
      text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
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

  function updateOutput() {
    if (outputMode === 'html') {
      output.value = currentHTML;
      output.readOnly = true;
      output.placeholder = 'HTML output will appear here...';
    } else {
      output.value = currentMarkdown;
      output.readOnly = false;
      output.placeholder = 'Type or paste markdown here...';
    }
    copyMdBtn.disabled = !currentMarkdown;
    copyHtmlBtn.disabled = !currentHTML;
  }

  // --- Rich Text → Markdown ---
  function onRichTextChange() {
    if (isUpdating) return;
    isUpdating = true;

    const html = richtext.innerHTML;
    if (html && html !== '<br>' && html !== '<div><br></div>') {
      const md = turndownService.turndown(html);
      currentMarkdown = compactMarkdown(md.trim());
      currentHTML = convertMarkdownToHTML(currentMarkdown);
    } else {
      currentMarkdown = '';
      currentHTML = '';
    }

    updateOutput();
    saveState();
    isUpdating = false;
  }

  // --- Markdown → Rich Text ---
  function onMarkdownChange() {
    if (isUpdating) return;
    isUpdating = true;

    const md = output.value;
    currentMarkdown = md;
    if (md.trim()) {
      currentHTML = convertMarkdownToHTML(md);
      richtext.innerHTML = currentHTML;
    } else {
      currentHTML = '';
      richtext.innerHTML = '';
    }

    updateOutput();
    saveState();
    isUpdating = false;
  }

  // Tab click handlers
  tabBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      tabBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      outputMode = btn.dataset.tab;
      updateOutput();
      saveState();
    });
  });

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

  // Handle input in output area (only when in markdown mode)
  output.addEventListener('input', () => {
    if (outputMode === 'markdown') {
      onMarkdownChange();
    }
  });

  // Handle paste in output area (plain text only, markdown mode)
  output.addEventListener('paste', (e) => {
    if (outputMode !== 'markdown') return;
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    const start = output.selectionStart;
    const end = output.selectionEnd;
    output.value = output.value.substring(0, start) + text + output.value.substring(end);
    output.selectionStart = output.selectionEnd = start + text.length;
    onMarkdownChange();
  });

  // Copy MD button handler
  copyMdBtn.addEventListener('click', async () => {
    if (!currentMarkdown) return;
    try {
      await navigator.clipboard.writeText(currentMarkdown);
      showToast('Markdown copied!');
    } catch (err) {
      fallbackCopy(currentMarkdown);
      showToast('Markdown copied!');
    }
  });

  // Copy HTML button handler
  copyHtmlBtn.addEventListener('click', async () => {
    if (!currentHTML) return;
    try {
      await navigator.clipboard.writeText(currentHTML);
      showToast('HTML copied!');
    } catch (err) {
      fallbackCopy(currentHTML);
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
    currentMarkdown = '';
    currentHTML = '';
    updateOutput();
    richtext.focus();
    saveState();
  });

  // Save state to chrome.storage.local
  function saveState() {
    chrome.storage.local.set({
      richTextHTML: richtext.innerHTML,
      currentMarkdown,
      currentHTML,
      outputMode,
    });
  }

  // Restore state from chrome.storage.local
  function restoreState() {
    chrome.storage.local.get(
      ['richTextHTML', 'currentMarkdown', 'currentHTML', 'outputMode'],
      (result) => {
        if (result.currentMarkdown) {
          currentMarkdown = result.currentMarkdown;
        }
        if (result.currentHTML) {
          currentHTML = result.currentHTML;
        }
        if (result.richTextHTML) {
          richtext.innerHTML = result.richTextHTML;
        }
        if (result.outputMode) {
          outputMode = result.outputMode;
          tabBtns.forEach((btn) => {
            btn.classList.toggle('active', btn.dataset.tab === outputMode);
          });
        }
        updateOutput();

        if (!richtext.innerHTML && !currentMarkdown) {
          richtext.focus();
        }
      }
    );
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
