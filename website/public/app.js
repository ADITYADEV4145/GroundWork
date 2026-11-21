const steps = {
  navigate: {
    comment: '# A symbol, not a wall of text.',
    command: '$ gw symbols formatPrice',
    output: 'src/utils/money.ts:12\nexport function formatPrice(cents: number): string\n\nCallers\n  src/checkout/summary.ts:28\n  src/components/Price.tsx:9\n\n',
    result: '→ One symbol. The context you need.',
  },
  reuse: {
    comment: '# Before a new helper, check what exists.',
    command: '$ gw similar "format a price in cents"',
    output: 'Existing candidate\n  src/utils/money.ts:12\n  formatPrice(cents: number): string\n\nAgent decision\n  REUSE formatPrice — same input, same job.\n\n',
    result: '→ Less new code. More of the right code.',
  },
  ground: {
    comment: '# Check the change against real exports.',
    command: '$ gw check',
    output: "BLOCK grounding (unknown-export): label.ts:1\n\n'formatCurrency' is not exported in money.ts.\nDid you mean formatPrice?\n\nFix: Use formatPrice(cents: number): string.\n\n",
    result: '→ Catch the invented call before review.',
  },
};
const tabs = [...document.querySelectorAll('[data-step]')];
const panel = document.querySelector('#workflow-panel');
function selectStep(tab, focus = false) {
  const step = steps[tab.dataset.step];
  for (const item of tabs) {
    item.setAttribute('aria-selected', String(item === tab));
    item.tabIndex = item === tab ? 0 : -1;
  }
  panel.setAttribute('aria-labelledby', tab.id);
  panel.querySelector('.terminal-comment').textContent = step.comment;
  panel.querySelector('.terminal-command').textContent = step.command;
  const output = panel.querySelector('pre');
  const result = document.createElement('span');
  result.className = 'terminal-success';
  result.textContent = step.result;
  output.replaceChildren(document.createTextNode(step.output), result);
  if (focus) tab.focus();
}
tabs.forEach((tab, index) => {
  tab.addEventListener('click', () => selectStep(tab));
  tab.addEventListener('keydown', (event) => {
    let next;
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') next = (index + 1) % tabs.length;
    if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = tabs.length - 1;
    if (next !== undefined) {
      event.preventDefault();
      selectStep(tabs[next], true);
    }
  });
});
document.querySelectorAll('[data-copy]').forEach((button) => {
  let reset;
  button.addEventListener('click', async () => {
    const source = document.getElementById(button.dataset.copy);
    const status = document.querySelector('#copy-status');
    clearTimeout(reset);
    try {
      await navigator.clipboard.writeText(source.textContent.trim());
      button.textContent = 'Copied ✓';
      status.textContent = 'Commands copied to clipboard.';
    } catch {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(source);
      selection.removeAllRanges();
      selection.addRange(range);
      button.textContent = 'Selected';
      status.textContent = 'Clipboard unavailable. Commands selected; use your device’s copy command.';
    }
    reset = setTimeout(() => { button.textContent = 'Copy ⧉'; }, 2500);
  });
});
