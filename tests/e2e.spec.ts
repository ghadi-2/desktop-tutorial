import { test, expect, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

type State = {
  mode: 'exterior' | 'interior';
  floor: number;
  dimension: '2d' | '3d';
  fallback: boolean;
  selected: string | null;
  accessible: boolean;
  route: { floor: number; points: { x: number; z: number }[] }[] | null;
};

function state(page: Page): Promise<State> {
  return page.evaluate(() => (window as unknown as { smartCollege: { state: State } }).smartCollege.state);
}

async function openApp(page: Page) {
  await page.goto('/');
  await expect(page.locator('#destination-search')).toBeVisible();
  await expect.poll(() => page.evaluate(() => Boolean('smartCollege' in window))).toBeTruthy();
}

async function forceFallback(page: Page) {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, kind: string, ...args: unknown[]) {
      if (kind.includes('webgl')) return null;
      return Reflect.apply(original, this, [kind, ...args]);
    } as typeof HTMLCanvasElement.prototype.getContext;
  });
}

async function selectLibrary(page: Page) {
  await page.getByRole('searchbox', { name: 'البحث عن وجهة' }).fill('المكتبة');
  await expect(page.locator('#sidebar-content .destination-card')).toHaveCount(1);
  await page.locator('#sidebar-content [data-room="f2-library"]').click();
  await expect(page.locator('.detail-title')).toHaveText('المكتبة');
}

async function saveScreenshot(page: Page, name: string) {
  await mkdir('/workspace/scratch', { recursive: true });
  await expect(page.locator('#toast')).toBeHidden({ timeout: 6000 });
  // Let the camera and the mobile sheet finish their visual transitions.
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `/workspace/scratch/college-${name}.png`, fullPage: true });
}

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  (page as Page & { appErrors?: string[] }).appErrors = errors;
});

test.afterEach(async ({ page }) => {
  expect((page as Page & { appErrors?: string[] }).appErrors, 'No uncaught application errors').toEqual([]);
});

test('interactive WebGL exterior enters through the main door, shows each floor and changes dimensions', async ({ page }) => {
  await openApp(page);
  await expect.poll(async () => (await state(page)).fallback).toBe(false);
  await expect(page.locator('#canvas-host canvas')).toBeVisible();
  const bounds = await page.locator('#canvas-host canvas').boundingBox();
  expect(bounds!.width).toBeGreaterThan(600);
  expect(bounds!.height).toBeGreaterThan(400);
  await expect(page.locator('.scene-label--entrance')).toBeVisible();
  await saveScreenshot(page, 'desktop-exterior');

  await page.locator('.scene-label--entrance').click();
  await expect(page.locator('#welcome-card')).toBeHidden();
  await expect.poll(async () => (await state(page)).mode).toBe('interior');
  await expect(page.locator('#map-mode-badge')).toHaveText('الدور الأرضي');
  for (const [floor, name] of [[1, 'الدور الأول'], [2, 'الدور الثاني'], [0, 'الدور الأرضي']] as const) {
    await page.locator(`.floor-button[data-floor="${floor}"]`).click();
    await expect(page.locator('#map-mode-badge')).toHaveText(name);
    await expect(page.locator(`.floor-button[data-floor="${floor}"]`)).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(async () => (await state(page)).floor).toBe(floor);
  }
  await page.locator('.scene-label--poi[data-id="f0-elevator"]').click();
  await expect(page.getByRole('dialog')).toContainText('المصعد');
  await page.locator('[data-poi-floor="1"]').click();
  await expect.poll(async () => (await state(page)).floor).toBe(1);
  await page.locator('.floor-button[data-floor="0"]').click();
  await page.locator('[data-dimension="2d"]').click();
  await expect(page.locator('[data-dimension="2d"]')).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(async () => (await state(page)).dimension).toBe('2d');
  await saveScreenshot(page, 'desktop-2d');
  await page.locator('[data-dimension="3d"]').click();
  await expect.poll(async () => (await state(page)).dimension).toBe('3d');
  for (const tool of ['zoom-in', 'zoom-out', 'rotate', 'reset']) {
    await page.locator(`[data-tool="${tool}"]`).click();
  }
  await saveScreenshot(page, 'desktop-interior');
  await page.locator('#exit-building').click();
  await expect.poll(async () => (await state(page)).mode).toBe('exterior');
  await expect(page.locator('.scene-label--entrance')).toBeVisible();
});

test('library navigation crosses floors, supports elevator and stairs, and clears the route', async ({ page }) => {
  await openApp(page);
  await selectLibrary(page);
  await expect.poll(async () => (await state(page)).floor).toBe(2);
  await page.locator('#navigate-button').click();
  await expect(page.locator('.route-summary')).toContainText('مسارك جاهز');
  const initial = await state(page);
  expect(initial.floor).toBe(0);
  expect(initial.route!.map(segment => segment.floor)).toEqual([0, 2]);
  expect(initial.route!.every(segment => segment.points.length >= 2)).toBe(true);
  expect(initial.route![0].points.at(-1)).toEqual({ x: 14, z: -12 });
  await expect(page.locator('.route-steps')).toContainText('المصعد');
  await page.locator('[data-route-floor="2"]').click();
  await expect.poll(async () => (await state(page)).floor).toBe(2);
  await expect(page.locator('.route-floor-buttons [data-route-floor="2"]')).toHaveClass(/active/);
  await saveScreenshot(page, 'desktop-library-route');
  await page.locator('[data-dimension="2d"]').click();
  await saveScreenshot(page, 'desktop-library-route-2d');
  await page.locator('[data-dimension="3d"]').click();
  await page.locator('#accessible-route').uncheck();
  await expect(page.locator('.route-steps')).toContainText('الدرج');
  const stairs = await state(page);
  expect(stairs.route![0].points.at(-1)).toEqual({ x: 12, z: -27 });
  await page.locator('#clear-route').click();
  await expect.poll(async () => (await state(page)).route).toBeNull();
  await expect(page.locator('#navigate-button')).toBeVisible();
});

test('Arabic facility search, category filters and empty-result recovery work', async ({ page }) => {
  await openApp(page);
  await page.locator('[data-category="lab"]').click();
  const labs = page.locator('#sidebar-content .destination-card');
  expect(await labs.count()).toBeGreaterThan(5);
  for (const text of await labs.locator('strong').allTextContents()) expect(text).toContain('معمل الحاسب');
  await page.locator('[data-category="office"]').click();
  const offices = page.locator('#sidebar-content .destination-card');
  expect(await offices.count()).toBeGreaterThan(5);
  for (const text of await offices.locator('strong').allTextContents()) expect(text).toContain('مكتب');
  await page.getByRole('searchbox').fill('xyz-no-such-facility');
  await expect(page.locator('.empty-state')).toContainText('لم نعثر على هذه الوجهة');
  await page.locator('#reset-search').click();
  await expect(page.getByRole('searchbox')).toHaveValue('');
  await expect(page.locator('[data-category="all"]')).toHaveClass(/active/);
  expect(await page.locator('#sidebar-content .destination-card').count()).toBeGreaterThan(0);
  await page.getByRole('searchbox').fill('المكتبه');
  await expect(page.locator('#sidebar-content .destination-card')).toHaveCount(1);
  await page.locator('.search-clear').click();
  await expect(page.getByRole('searchbox')).toHaveValue('');
  await expect(page.getByRole('searchbox')).toBeFocused();
});

test('facility directory selects map destinations and dialogs trap and restore focus', async ({ page }) => {
  await openApp(page);
  await page.locator('#directory-tab').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.locator('.directory-floor')).toHaveCount(3);
  await page.locator('.modal [data-room="f2-library"]').click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.detail-title')).toHaveText('المكتبة');
  await page.locator('#help-button').click();
  await expect(page.getByRole('dialog')).toContainText('دليل الاستخدام');
  await expect(page.locator('.modal-close')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('.modal-close')).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.locator('.modal-close')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('#help-button')).toBeFocused();
});

test('source link serves the uploaded PDF and explains exterior accuracy', async ({ page, request }) => {
  await openApp(page);
  await page.locator('#about-tab').click();
  await expect(page.getByRole('dialog')).toContainText('الواجهة الخارجية وموضع باب الدخول تصوريان');
  await expect(page.locator('.source-link')).toHaveAttribute('href', '/college-plan.pdf');
  const response = await request.get('/college-plan.pdf');
  expect(response.ok()).toBe(true);
  expect(response.headers()['content-type']).toContain('application/pdf');
  expect((await response.body()).subarray(0, 5).toString()).toBe('%PDF-');
});

test('WebGL unavailable fallback preserves entrance, SVG facility selection and blue routes', async ({ page }) => {
  await forceFallback(page);
  await openApp(page);
  await expect.poll(async () => (await state(page)).fallback).toBe(true);
  await expect(page.locator('[data-dimension="3d"]')).toBeDisabled();
  await expect(page.locator('#canvas-host .fallback-map > svg')).toBeVisible();
  await page.locator('.fallback-entrance').click();
  await expect(page.locator('[data-fallback-poi="f0-elevator"]')).toBeVisible();
  await page.locator('[data-fallback-poi="f0-elevator"]').click();
  await expect(page.getByRole('dialog')).toContainText('المصعد');
  await page.locator('[data-poi-floor="2"]').click();
  await expect.poll(async () => (await state(page)).floor).toBe(2);
  await page.locator('[data-fallback-room="f2-library"]').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.detail-title')).toHaveText('المكتبة');
  await page.locator('#navigate-button').click();
  await expect(page.locator('#canvas-host polyline')).toHaveAttribute('stroke', '#3385f6');
  expect((await page.locator('#canvas-host polyline').getAttribute('points'))!.split(' ').length).toBeGreaterThan(2);
  await page.locator('[data-route-floor="2"]').click();
  await expect(page.locator('#canvas-host polyline')).toBeVisible();
  await page.locator('[data-tool="zoom-in"]').click();
  await expect(page.locator('#canvas-host svg > g')).toHaveAttribute('transform', 'scale(1.15)');
  await page.locator('[data-tool="reset"]').click();
  await expect(page.locator('#canvas-host svg > g')).toHaveAttribute('transform', 'scale(1)');
});

test('mobile layout fits the viewport and lets users collapse and expand the search sheet', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openApp(page);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(page.locator('.sidebar-collapse')).toBeVisible();
  await saveScreenshot(page, 'mobile-exterior-expanded');
  await page.locator('.sidebar-collapse').click();
  await expect(page.locator('.sidebar')).toHaveClass(/collapsed/);
  await expect(page.locator('.sidebar-collapse')).toHaveAttribute('aria-expanded', 'false');
  await expect.poll(async () => (await page.locator('.sidebar').boundingBox())!.height).toBeLessThan(180);
  await saveScreenshot(page, 'mobile-exterior');
  await page.keyboard.press('Control+k');
  await expect(page.locator('.sidebar-collapse')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('searchbox')).toBeFocused();
  await page.locator('.sidebar-collapse').click();
  await expect(page.locator('.sidebar-collapse')).toHaveAttribute('aria-expanded', 'false');
  await page.locator('#enter-building').click();
  await expect.poll(async () => (await state(page)).mode).toBe('interior');
  await page.locator('.sidebar-collapse').click();
  await expect(page.locator('.sidebar-collapse')).toHaveAttribute('aria-expanded', 'true');
  await selectLibrary(page);
  await page.locator('#navigate-button').click();
  await expect(page.locator('.route-summary')).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await saveScreenshot(page, 'mobile-route');
  await page.locator('[data-route-floor="2"]').click();
  await page.locator('.sidebar-collapse').click();
  await expect(page.locator('.sidebar-collapse')).toHaveAttribute('aria-expanded', 'false');
  await saveScreenshot(page, 'mobile-route-map');
});
