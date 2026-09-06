/*
 * Pagination model + the only place that writes pagination attributes onto
 * host-page nodes. Every attribute it sets is recorded so teardown can restore
 * the page exactly, including when the user turns the extension off mid-session.
 */
(() => {
  "use strict";
  const NS = (window.__GDH_PAGER__ = window.__GDH_PAGER__ || {});
  if (NS.Paginator) return;
  const C = NS.constants;

  class Paginator {
    constructor() {
      this.turns = [];
      this.pageSize = C.DEFAULTS.pageSize;
      this.pageIndex = 0;
      this.showAll = false;
      this.showPageLabel = C.DEFAULTS.showPageLabel;
      this.touched = new Set();
      this.anchor = null;
      this.anchorHadTabIndex = false;
    }

    get pageCount() {
      if (!this.turns.length) return 1;
      return Math.max(1, Math.ceil(this.turns.length / this.pageSize));
    }

    get isFirstPage() {
      return this.pageIndex <= 0;
    }

    get isLastPage() {
      return this.pageIndex >= this.pageCount - 1;
    }

    /* Inclusive-exclusive turn range of the current page. */
    get range() {
      const start = this.pageIndex * this.pageSize;
      return [start, Math.min(start + this.pageSize, this.turns.length)];
    }

    clamp() {
      this.pageIndex = Math.min(Math.max(0, this.pageIndex), this.pageCount - 1);
    }

    /* Replace the turn list, keeping the reader as close to their place as
     * possible: the turn that opened the current page stays on screen. */
    setTurns(nextTurns, options) {
      const opts = options || {};
      const wasLast = this.isLastPage;
      const previousFirst = this.turns[this.pageIndex * this.pageSize] || null;

      this.turns = nextTurns;

      if (opts.followLatest && wasLast) {
        this.pageIndex = this.pageCount - 1;
      } else if (previousFirst) {
        const moved = this.turns.indexOf(previousFirst);
        if (moved >= 0) this.pageIndex = Math.floor(moved / this.pageSize);
      }
      this.clamp();
    }

    setPageSize(size) {
      const anchorIndex = this.pageIndex * this.pageSize;
      this.pageSize = size;
      this.pageIndex = Math.floor(anchorIndex / this.pageSize);
      this.clamp();
    }

    goTo(index) {
      const before = this.pageIndex;
      this.pageIndex = index;
      this.clamp();
      return this.pageIndex !== before;
    }

    /* --- DOM writes ------------------------------------------------------ */

    apply(labelText) {
      const [start, end] = this.range;
      const showEverything = this.showAll || !this.turns.length;

      this.turns.forEach((turn, index) => {
        const hidden = !showEverything && (index < start || index >= end);
        if (hidden) {
          turn.setAttribute(C.ATTR_HIDDEN, "true");
        } else {
          turn.removeAttribute(C.ATTR_HIDDEN);
        }
        this.touched.add(turn);
      });

      /* Nodes that left the list must not stay hidden. */
      for (const node of Array.from(this.touched)) {
        if (this.turns.indexOf(node) === -1) {
          this.clearNode(node);
          this.touched.delete(node);
        }
      }

      this.setAnchor(showEverything ? null : this.turns[start] || null, labelText);
    }

    setAnchor(node, labelText) {
      if (this.anchor && this.anchor !== node) this.clearAnchor();
      if (!node) return;
      if (this.anchor !== node) {
        this.anchorHadTabIndex = node.hasAttribute("tabindex");
        if (!this.anchorHadTabIndex) node.setAttribute("tabindex", "-1");
        node.setAttribute(C.ATTR_ANCHOR, "");
        this.anchor = node;
      }
      if (this.showPageLabel && labelText) {
        node.setAttribute(C.ATTR_LABEL, labelText);
      } else {
        node.removeAttribute(C.ATTR_LABEL);
      }
      this.touched.add(node);
    }

    clearAnchor() {
      const node = this.anchor;
      if (!node) return;
      node.removeAttribute(C.ATTR_ANCHOR);
      node.removeAttribute(C.ATTR_LABEL);
      if (!this.anchorHadTabIndex) node.removeAttribute("tabindex");
      this.anchor = null;
      this.anchorHadTabIndex = false;
    }

    clearNode(node) {
      node.removeAttribute(C.ATTR_HIDDEN);
      node.removeAttribute(C.ATTR_ANCHOR);
      node.removeAttribute(C.ATTR_LABEL);
      if (node === this.anchor) this.clearAnchor();
    }

    /* Full teardown: the host page must look untouched afterwards. */
    restore() {
      this.clearAnchor();
      for (const node of this.touched) this.clearNode(node);
      this.touched.clear();
      this.turns = [];
      this.pageIndex = 0;
    }
  }

  NS.Paginator = Paginator;
})();
