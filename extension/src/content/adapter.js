/*
 * DOM adapter.
 *
 * The host page is a third-party app whose markup can change without notice,
 * so nothing here assumes a single fixed selector. The adapter scores several
 * candidates, lifts the matches to a common sibling level, and reports failure
 * loudly instead of guessing, which is what drives the toolbar error state.
 */
(() => {
  "use strict";
  const NS = (window.__GDH_PAGER__ = window.__GDH_PAGER__ || {});
  if (NS.adapter) return;
  const C = NS.constants;

  function inDocumentOrder(nodes) {
    return nodes.slice().sort((a, b) => {
      if (a === b) return 0;
      const rel = a.compareDocumentPosition(b);
      if (rel & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
      if (rel & Node.DOCUMENT_POSITION_PRECEDING) return 1;
      return 0;
    });
  }

  function ancestorChain(node) {
    const chain = [];
    let current = node;
    while (current) {
      chain.push(current);
      current = current.parentElement;
    }
    return chain;
  }

  /* Deepest element that contains every node; never the node itself. */
  function commonAncestor(nodes) {
    if (!nodes.length) return null;
    let chain = ancestorChain(nodes[0]);
    for (let i = 1; i < nodes.length; i += 1) {
      const others = new Set(ancestorChain(nodes[i]));
      chain = chain.filter((el) => others.has(el));
      if (!chain.length) return null;
    }
    let root = chain[0];
    if (nodes.indexOf(root) !== -1) root = root.parentElement;
    return root;
  }

  /* Map each match up to the child of `root` that contains it. */
  function liftToChildren(nodes, root) {
    const seen = new Set();
    const lifted = [];
    for (const node of nodes) {
      let current = node;
      while (current && current.parentElement !== root) current = current.parentElement;
      if (current && !seen.has(current)) {
        seen.add(current);
        lifted.push(current);
      }
    }
    return inDocumentOrder(lifted);
  }

  function isRenderable(el) {
    if (!el.isConnected) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 || rect.height > 0 || el.textContent.trim().length > 0;
  }

  function evaluate(selector) {
    let matches;
    try {
      matches = Array.prototype.slice.call(document.querySelectorAll(selector));
    } catch (_) {
      return null; /* invalid user-supplied selector */
    }
    matches = matches.filter(isRenderable);
    if (!matches.length) return null;

    const root = commonAncestor(matches);
    if (!root || root === document.body || root === document.documentElement) return null;

    const turns = liftToChildren(matches, root);
    if (!turns.length) return null;

    return { selector, root, turns };
  }

  function findScroller(start) {
    const overflow = /(auto|scroll|overlay)/;
    for (const strict of [true, false]) {
      let node = start;
      while (node && node !== document.body) {
        const style = getComputedStyle(node);
        const scrolls = overflow.test(style.overflowY);
        if (scrolls && (!strict || node.scrollHeight > node.clientHeight + 4)) return node;
        node = node.parentElement;
      }
    }
    return document.scrollingElement || document.documentElement;
  }

  /*
   * Returns { selector, root, turns, scroller } or null.
   * Candidates are ranked by turn count; results inside <main> win ties and
   * always beat results outside it, because the site chrome (sidebar, menus)
   * can otherwise match generic selectors.
   */
  function detect(settings) {
    const candidates = [];
    if (settings && settings.customTurnSelector) candidates.push(settings.customTurnSelector);
    for (const selector of C.TURN_SELECTORS) candidates.push(selector);

    const main = document.querySelector("main") || document.querySelector("[role='main']");
    const results = [];
    candidates.forEach((selector, order) => {
      const found = evaluate(selector);
      if (!found) return;
      found.order = order;
      found.inMain = Boolean(main && main.contains(found.root));
      results.push(found);
    });
    if (!results.length) return null;

    const anyInMain = results.some((r) => r.inMain);
    const pool = anyInMain ? results.filter((r) => r.inMain) : results;
    pool.sort((a, b) => b.turns.length - a.turns.length || a.order - b.order);

    const best = pool[0];
    return {
      selector: best.selector,
      root: best.root,
      turns: best.turns,
      scroller: findScroller(best.root)
    };
  }

  /* Re-query turns for an already-detected root, keeping the same selector. */
  function refresh(state) {
    if (!state || !state.root || !state.root.isConnected) return null;
    let matches;
    try {
      matches = Array.prototype.slice.call(state.root.querySelectorAll(state.selector));
    } catch (_) {
      return null;
    }
    const turns = liftToChildren(matches.filter((el) => el.isConnected), state.root);
    return turns;
  }

  function conversationKey() {
    return location.origin + location.pathname;
  }

  NS.adapter = { detect, refresh, findScroller, conversationKey };
})();
