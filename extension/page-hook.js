(() => {
  if (window.__leetsyncHookInstalled) return;
  window.__leetsyncHookInstalled = true;

  // The page world is controlled by LeetCode and must be treated as untrusted.
  // Relay only a candidate ID. The extension worker independently verifies the
  // signed-in account, Accepted status, ownership, and source code with LeetCode.
  const namespace = 'leetsync-page-hook';
  const checkPath = /\/submissions\/detail\/(\d+)\/(?:v2\/)?check\//;
  const reported = new Set();
  const nativeFetch = window.fetch.bind(window);

  function addBounded(value) {
    reported.add(value);
    if (reported.size > 200) {
      const oldest = reported.values().next().value;
      if (oldest !== undefined) reported.delete(oldest);
    }
  }

  function candidate(id) {
    const submissionId = String(id ?? '');
    if (!/^\d{1,20}$/.test(submissionId) || reported.has(submissionId)) return;
    addBounded(submissionId);
    window.postMessage(
      { namespace, type: 'submission-candidate', submissionId },
      location.origin,
    );
  }

  function inspect(url, payload) {
    let path;
    try {
      path = new URL(url, location.href).pathname;
    } catch {
      return;
    }
    const match = checkPath.exec(path);
    if (
      match?.[1] &&
      payload?.finished === true &&
      payload?.status_code === 10 &&
      payload?.status_msg === 'Accepted'
    )
      candidate(match[1]);
  }

  window.fetch = async (...args) => {
    const response = await nativeFetch(...args);
    try {
      const input = args[0];
      const url = typeof input === 'string' ? input : input?.url;
      if (url && checkPath.test(new URL(url, location.href).pathname)) {
        void response
          .clone()
          .json()
          .then((payload) => inspect(url, payload))
          .catch(() => {});
      }
    } catch {
      // Leave the LeetCode request untouched when its response changes.
    }
    return response;
  };

  const xhrOpen = XMLHttpRequest.prototype.open;
  const xhrSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this.__leetsyncUrl = String(url);
    return xhrOpen.call(this, method, url, ...rest);
  };
  XMLHttpRequest.prototype.send = function (body) {
    this.addEventListener('load', () => {
      try {
        if (
          this.status < 200 ||
          this.status >= 300 ||
          !this.__leetsyncUrl ||
          !checkPath.test(new URL(this.__leetsyncUrl, location.href).pathname)
        )
          return;
        inspect(this.__leetsyncUrl, JSON.parse(this.responseText));
      } catch {
        // Ignore non-JSON requests and keep the page working normally.
      }
    });
    return xhrSend.call(this, body);
  };

  function inspectResultRoute() {
    const match = /^\/problems\/[a-z0-9-]+\/submissions\/(\d+)\/?$/i.exec(
      location.pathname,
    );
    if (
      match?.[1] &&
      document.body &&
      /\bAccepted\b/.test(document.body.innerText || '')
    )
      candidate(match[1]);
  }

  window.setInterval(inspectResultRoute, 3000);
  inspectResultRoute();
})();
