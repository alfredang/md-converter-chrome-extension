document.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('input');
  const output = document.getElementById('output');
  const copyBtn = document.getElementById('copy-btn');
  const clearBtn = document.getElementById('clear-btn');
  const toast = document.getElementById('toast');

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
      output.value = compactMarkdown(markdown.trim());
      copyBtn.disabled = false;
    } else if (plainText) {
      // If no HTML, just use plain text
      input.textContent = plainText;
      output.value = plainText;
      copyBtn.disabled = plainText.length === 0;
    }
  });

  // Also handle input changes (for manual typing/editing)
  input.addEventListener('input', () => {
    const html = input.innerHTML;
    if (html && html !== '<br>') {
      const markdown = turndownService.turndown(html);
      output.value = compactMarkdown(markdown.trim());
      copyBtn.disabled = false;
    } else {
      output.value = '';
      copyBtn.disabled = true;
    }
  });

  // Copy button handler
  copyBtn.addEventListener('click', async () => {
    const markdown = output.value;
    if (!markdown) return;

    try {
      await navigator.clipboard.writeText(markdown);
      showToast('Copied to clipboard!');
    } catch (err) {
      // Fallback for older browsers
      output.select();
      document.execCommand('copy');
      showToast('Copied to clipboard!');
    }
  });

  // Clear button handler
  clearBtn.addEventListener('click', () => {
    input.innerHTML = '';
    output.value = '';
    copyBtn.disabled = true;
    input.focus();
  });

  // Toast notification
  function showToast(message) {
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => {
      toast.classList.remove('show');
    }, 2000);
  }

  // Focus input on load
  input.focus();
});
