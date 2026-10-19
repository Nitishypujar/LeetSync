import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { URL } from 'node:url';
import vm from 'node:vm';
import { test } from 'node:test';

const popupSource = await readFile(
  new URL('../popup.js', import.meta.url),
  'utf8',
);
const productionDashboard = 'https://leetsync-nitishypujar.onrender.com';

function createPopupHarness(savedState = {}) {
  const elements = new Map();
  const openedTabs = [];
  const manifest = {
    externally_connectable: {
      matches: [
        'http://localhost:5173/*',
        'http://127.0.0.1:5173/*',
        `${productionDashboard}/*`,
        'https://app.leetsync.app/*',
      ],
    },
  };
  const document = {
    querySelector(selector) {
      if (!elements.has(selector)) {
        elements.set(selector, {
          textContent: '',
          hidden: false,
          disabled: false,
          classList: { toggle() {} },
          handlers: {},
          addEventListener(type, handler) {
            this.handlers[type] = handler;
          },
        });
      }
      return elements.get(selector);
    },
  };
  const chrome = {
    runtime: { getManifest: () => manifest },
    storage: {
      local: {
        async get(defaults) {
          return {
            ...(Array.isArray(defaults)
              ? Object.fromEntries(defaults.map((key) => [key, undefined]))
              : defaults),
            ...savedState,
          };
        },
      },
    },
    tabs: {
      create({ url }) {
        openedTabs.push(url);
      },
    },
  };
  vm.runInNewContext(popupSource, {
    chrome,
    document,
    URL,
    Intl,
    Date,
    window: {},
  });
  return {
    openedTabs,
    async openDashboard() {
      await elements.get('#open-dashboard').handlers.click();
    },
  };
}

test('fresh extension popup opens the configured production dashboard', async () => {
  const harness = createPopupHarness();
  await harness.openDashboard();
  assert.deepEqual(harness.openedTabs, [productionDashboard]);
});

test('paired development and preview extensions open their matching dashboard', async () => {
  const local = createPopupHarness({ apiBase: 'http://localhost:3000' });
  await local.openDashboard();
  assert.deepEqual(local.openedTabs, ['http://localhost:5173']);

  const preview = createPopupHarness({ apiBase: productionDashboard });
  await preview.openDashboard();
  assert.deepEqual(preview.openedTabs, [productionDashboard]);
});
