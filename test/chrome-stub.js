/* Minimal chrome.* stub so the content scripts can run on a local fixture
 * page. Only the surface the extension actually uses is implemented. */
(() => {
  const bag = {};
  const listeners = [];

  window.chrome = {
    runtime: {
      id: "gdh-pager-fixture",
      getURL: (path) => new URL("../extension/" + path, location.href).href
    },
    storage: {
      sync: {
        async get(key) {
          return { [key]: bag[key] };
        },
        async set(patch) {
          const changes = {};
          for (const key of Object.keys(patch)) {
            changes[key] = { oldValue: bag[key], newValue: patch[key] };
            bag[key] = patch[key];
          }
          listeners.forEach((fn) => fn(changes, "sync"));
        }
      },
      onChanged: {
        addListener(fn) {
          listeners.push(fn);
        },
        removeListener(fn) {
          const index = listeners.indexOf(fn);
          if (index >= 0) listeners.splice(index, 1);
        }
      }
    }
  };

  /* Test helpers. */
  window.__fixture = {
    addTurn(text) {
      const list = document.querySelector(".list");
      const wrap = document.createElement("div");
      wrap.setAttribute("data-test-render-count", String(list.childElementCount + 1));
      const body = document.createElement("div");
      body.className = "font-claude-message";
      body.textContent = text;
      wrap.appendChild(body);
      list.appendChild(wrap);
      return list.childElementCount;
    },
    removeLastTurn() {
      const list = document.querySelector(".list");
      if (list.lastElementChild) list.removeChild(list.lastElementChild);
      return list.childElementCount;
    },
    navigate(path) {
      history.pushState({}, "", path);
    },
    visibleTurns() {
      return Array.from(document.querySelectorAll(".list > *")).filter(
        (el) => el.getAttribute("data-gdh-pager-hidden") !== "true"
      ).length;
    },
    settings() {
      return bag.gdhPagerSettings;
    }
  };
})();
