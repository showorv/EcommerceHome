/**
 * Core Web Vitals check (Phase 3.3, NFR-PF-01) for the storefront on a mid-range Android on 4G, with
 * the same conditions Lighthouse's mobile test uses: a 412×823 phone screen, slow 4G (150 ms round trip,
 * 1.6 Mbit/s down) and a CPU 4× slower than this computer. Each page is opened cold (empty cache)
 * a few times; the median is reported. Uses the installed Google Chrome.
 *
 *   pnpm build && pnpm start      # then, in another terminal:
 *   pnpm perf:vitals [base-url] [--runs 3]
 */
import { parseArgs } from "node:util";
import { chromium } from "playwright-core";

/** NFR-PF-01 names home, category and product pages; the others are shown for information. */
const PAGES = [
  { path: "/", target: true },
  { path: "/c/kitchen-gadgets", target: true },
  { path: "/p/mini-electric-chopper-2l", target: true },
  { path: "/search?q=chopper", target: false },
  { path: "/cart", target: false },
];
const TARGET = { lcp: 2500, cls: 0.1 };

type Result = { lcp: number; lcpElement: string; cls: number; tbt: number; jsKb: number; jsRawKb: number; fcp: number };

/** Runs in the page before anything else: records LCP, layout shifts and long tasks. */
function observe() {
  const w = window as unknown as { __v: { lcp: number; el: string; cls: number; tbt: number } };
  w.__v = { lcp: 0, el: "", cls: 0, tbt: 0 };
  new PerformanceObserver((l) => {
    for (const e of l.getEntries() as (PerformanceEntry & { element?: Element; url?: string })[]) {
      w.__v.lcp = e.startTime;
      const el = e.element;
      w.__v.el = el ? `${el.tagName.toLowerCase()}${e.url ? ` ${e.url.split("?")[0]!.slice(-60)}` : ""}` : "";
    }
  }).observe({ type: "largest-contentful-paint", buffered: true });
  new PerformanceObserver((l) => {
    for (const e of l.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) {
      if (!e.hadRecentInput) w.__v.cls += e.value;
    }
  }).observe({ type: "layout-shift", buffered: true });
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) w.__v.tbt += Math.max(0, e.duration - 50);
  }).observe({ type: "longtask", buffered: true });
}

async function measure(base: string, path: string): Promise<Result> {
  const browser = await chromium.launch({ channel: "chrome" });
  try {
    const context = await browser.newContext({
      viewport: { width: 412, height: 823 },
      deviceScaleFactor: 1.75,
      isMobile: true,
      hasTouch: true,
      userAgent:
        "Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
    });
    await context.addInitScript(observe);
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: 150,
      downloadThroughput: (1.6 * 1024 * 1024) / 8,
      uploadThroughput: (750 * 1024) / 8,
    });
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });

    // JavaScript as downloaded (compressed) and as the phone has to parse it.
    let jsBytes = 0;
    let jsRawBytes = 0;
    const pending: Promise<void>[] = [];
    page.on("requestfinished", (req) => {
      if (req.resourceType() !== "script") return;
      pending.push(
        (async () => {
          const s = await req.sizes().catch(() => null);
          jsBytes += s ? s.responseBodySize + s.responseHeadersSize : 0;
          jsRawBytes += (await (await req.response())?.body().catch(() => null))?.length ?? 0;
        })(),
      );
    });

    await page.goto(base + path, { waitUntil: "load", timeout: 90_000 });
    await page.waitForTimeout(3000);
    // Scroll down and back, as a shopper would: late shifts (images, lazy sections) count too.
    for (const y of [800, 1600, 2400, 0]) {
      await page.evaluate((top) => window.scrollTo({ top }), y);
      await page.waitForTimeout(700);
    }
    await Promise.all(pending);
    const v = await page.evaluate(() => {
      const w = window as unknown as { __v: { lcp: number; el: string; cls: number; tbt: number } };
      const fcp = performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? 0;
      return { ...w.__v, fcp };
    });
    return {
      lcp: Math.round(v.lcp),
      lcpElement: v.el,
      cls: Number(v.cls.toFixed(3)),
      tbt: Math.round(v.tbt),
      jsKb: Math.round(jsBytes / 1024),
      jsRawKb: Math.round(jsRawBytes / 1024),
      fcp: Math.round(v.fcp),
    };
  } finally {
    await browser.close();
  }
}

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;

async function main() {
  const { values, positionals } = parseArgs({
    options: { runs: { type: "string", default: "3" } },
    allowPositionals: true,
  });
  const base = (positionals[0] ?? "http://localhost:3000").replace(/\/$/, "");
  const runs = Math.max(1, Number(values.runs) || 3);
  let failed = false;
  for (const { path, target } of PAGES) {
    const results: Result[] = [];
    for (let i = 0; i < runs; i++) results.push(await measure(base, path));
    const lcp = median(results.map((r) => r.lcp));
    const cls = Math.max(...results.map((r) => r.cls));
    const ok = lcp <= TARGET.lcp && cls <= TARGET.cls;
    if (!ok && target) failed = true;
    const r = results.find((x) => x.lcp === lcp)!;
    console.log(
      `${ok ? "✓" : target ? "✗" : "·"} ${path.padEnd(30)} LCP ${String(lcp).padStart(5)} ms  CLS ${cls.toFixed(3)}  ` +
        `FCP ${r.fcp} ms  TBT ${r.tbt} ms  JS ${r.jsKb} KB (${r.jsRawKb} KB unzipped)  ` +
        `(LCP: ${r.lcpElement || "?"})${target ? "" : "  [for information]"}`,
    );
  }
  console.log(`Targets: LCP ≤ ${TARGET.lcp} ms, CLS ≤ ${TARGET.cls} (median LCP, worst CLS of the runs).`);
  if (failed) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
