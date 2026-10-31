import fs from 'node:fs/promises';
import path from 'node:path';
import {
  test as base,
  expect,
  webkit,
  type Browser,
  type BrowserContext,
  type BrowserContextOptions,
} from '@playwright/test';
export { expect };
export type { Page } from '@playwright/test';
async function persistentFixture(options: BrowserContextOptions): Promise<BrowserContext> {
  // WebKit ephemeral contexts cannot store Blob/File in IndexedDB (upstream #42795).
  // A fresh persistent fixture profile exercises real Blob storage without changing the adapter.
  const workspace = await fs.realpath(path.resolve('..')),
    root = path.join(workspace, '.qa', 'browser-profiles');
  await fs.mkdir(root, { recursive: true });
  const profile = await fs.mkdtemp(path.join(root, 'webkit-fixture-'));
  const context = await webkit.launchPersistentContext(profile, {
    ...options,
    headless: true,
    acceptDownloads: true,
  });
  const close = context.close.bind(context);
  let closing: Promise<void> | undefined;
  context.close = (closeOptions) =>
    (closing ??= (async () => {
      await close(closeOptions);
      const resolved = await fs.realpath(profile),
        safeRoot = await fs.realpath(root);
      if (!safeRoot.startsWith(workspace + path.sep) || !resolved.startsWith(safeRoot + path.sep))
        throw Error('Refusing cleanup outside fixture profiles');
      await fs.rm(resolved, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    })());
  return context;
}
export async function isolatedContext(browser: Browser, browserName: string, baseURL: string) {
  return browserName === 'webkit'
    ? persistentFixture({ baseURL })
    : browser.newContext({ baseURL });
}
export const test = base.extend({
  context: async ({ context, browserName, baseURL, viewport }, use, info) => {
    if (browserName !== 'webkit') {
      await use(context);
      return;
    }
    info.annotations.push({
      type: 'context',
      description:
        'Fresh persistent fixture profile; WebKit private-mode Blob/IDB limitation #42795',
    });
    const persistent = await persistentFixture({ baseURL, viewport });
    try {
      await use(persistent);
    } finally {
      if (info.status !== info.expectedStatus) {
        const page = persistent.pages().find((p) => p.url().startsWith(baseURL ?? 'http'));
        if (page && !page.isClosed()) {
          await page
            .screenshot({ path: info.outputPath('persistent-failure.png'), fullPage: true })
            .catch(() => undefined);
          await fs
            .writeFile(
              info.outputPath('persistent-page.json'),
              JSON.stringify(
                await page.evaluate(() => ({
                  url: location.href,
                  text: document.body.innerText,
                  images: [...document.images].map((i) => ({
                    alt: i.alt,
                    width: i.naturalWidth,
                    complete: i.complete,
                    src: i.src,
                  })),
                })),
                null,
                2,
              ),
            )
            .catch(() => undefined);
        }
      }
      await persistent.close();
    }
  },
});
