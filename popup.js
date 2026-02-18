document.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('input');
  const output = document.getElementById('output');
  const copyMdBtn = document.getElementById('copy-md-btn');
  const copyHtmlBtn = document.getElementById('copy-html-btn');
  const clearBtn = document.getElementById('clear-btn');
  const toast = document.getElementById('toast');
  const tabBtns = document.querySelectorAll('.tab-btn');

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

  // Convert markdown to clean HTML
  function convertMarkdownToHTML(markdown) {
    const lines = markdown.split('\n');
    const htmlParts = [];
    let listType = null; // 'ul' or 'ol'

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
      // Inline code: `text`
      text = text.replace(/`([^`]+)`/g, '<code>$1</code>');
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

      // Skip horizontal rules (* * *, ---, ___)
      if (/^((\* ){2,}\*|(-\s*){3,}|_{3,})$/.test(trimmed)) {
        continue;
      }

      // Heading (## or ###, etc.)
      const headingMatch = trimmed.match(/^#{1,6}\s+(.+)$/);
      if (headingMatch) {
        closeList();
        const headingText = processInline(headingMatch[1]);
        htmlParts.push(`<p><strong>${headingText}</strong></p>`);
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
        htmlParts.push(`  <li>${processInline(ulMatch[1])}</li>`);
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
        htmlParts.push(`  <li>${processInline(olMatch[1])}</li>`);
        continue;
      }

      // Empty line — close any open list
      if (trimmed === '') {
        closeList();
        continue;
      }

      // Regular paragraph
      closeList();
      htmlParts.push(`<p>${processInline(trimmed)}</p>`);
    }

    closeList();
    return htmlParts.join('\n');
  }

  // Output mode state
  let outputMode = 'markdown';
  let currentMarkdown = '';
  let currentHTML = '';

  function updateOutput() {
    if (outputMode === 'html') {
      output.value = currentHTML;
    } else {
      output.value = currentMarkdown;
    }
    copyMdBtn.disabled = !currentMarkdown;
    copyHtmlBtn.disabled = !currentHTML;
  }

  // Save state to chrome.storage.local
  function saveState() {
    chrome.storage.local.set({
      inputHTML: input.innerHTML,
      currentMarkdown,
      currentHTML,
      outputMode,
    });
  }

  // Restore state from chrome.storage.local
  function restoreState() {
    chrome.storage.local.get(
      ['inputHTML', 'currentMarkdown', 'currentHTML', 'outputMode'],
      (result) => {
        if (result.inputHTML) {
          input.innerHTML = result.inputHTML;
        }
        if (result.currentMarkdown) {
          currentMarkdown = result.currentMarkdown;
        }
        if (result.currentHTML) {
          currentHTML = result.currentHTML;
        }
        if (result.outputMode) {
          outputMode = result.outputMode;
          tabBtns.forEach((btn) => {
            btn.classList.toggle('active', btn.dataset.tab === outputMode);
          });
        }
        updateOutput();

        // Focus input only if empty
        if (!input.innerHTML) {
          input.focus();
        }
      }
    );
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

  // Handle paste event - auto-convert
  input.addEventListener('paste', (e) => {
    e.preventDefault();

    // Get HTML content from clipboard
    const html = e.clipboardData.getData('text/html');
    const plainText = e.clipboardData.getData('text/plain');

    if (html) {
      // Display the rich text in input area
      input.innerHTML = html;

      // Convert to markdown
      const markdown = turndownService.turndown(html);
      currentMarkdown = compactMarkdown(markdown.trim());
      currentHTML = convertMarkdownToHTML(currentMarkdown);
      updateOutput();
    } else if (plainText) {
      // If no HTML, just use plain text
      input.textContent = plainText;
      currentMarkdown = plainText;
      currentHTML = convertMarkdownToHTML(plainText);
      updateOutput();
    }

    saveState();
  });

  // Also handle input changes (for manual typing/editing)
  input.addEventListener('input', () => {
    const html = input.innerHTML;
    if (html && html !== '<br>') {
      const markdown = turndownService.turndown(html);
      currentMarkdown = compactMarkdown(markdown.trim());
      currentHTML = convertMarkdownToHTML(currentMarkdown);
      updateOutput();
    } else {
      currentMarkdown = '';
      currentHTML = '';
      output.value = '';
      copyMdBtn.disabled = true;
      copyHtmlBtn.disabled = true;
    }
    saveState();
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
    input.innerHTML = '';
    output.value = '';
    currentMarkdown = '';
    currentHTML = '';
    copyMdBtn.disabled = true;
    copyHtmlBtn.disabled = true;
    input.focus();
    saveState();
  });

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
