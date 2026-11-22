/**
 * k6 load test (Phase 3.2, SRS §9.1): 500 shoppers browsing at once and 20 orders a minute for
 * 10 minutes, with p95 under the NFR-PF-04 targets and no errors. Run `pnpm load:prepare` first.
 *
 *   k6 run scripts/load/storefront.js              # the full test (about 12 minutes)
 *   k6 run -e SMOKE=1 scripts/load/storefront.js   # a 1-minute check that everything works
 *
 * Each virtual shopper gets its own address in X-Forwarded-For, the way real visitors arrive with
 * their own IPs, so per-IP limits apply per shopper and not to the whole test.
 */
import exec from "k6/execution";
import http from "k6/http";
import { check, fail, sleep } from "k6";
import { Counter } from "k6/metrics";

const run = JSON.parse(open("../../.loadtest/run.json"));
const BASE = __ENV.BASE_URL || run.baseUrl;
const SMOKE = __ENV.SMOKE === "1";
const ordersPlaced = new Counter("orders_placed");

export const options = {
  discardResponseBodies: false,
  scenarios: {
    browse: {
      executor: "ramping-vus",
      exec: "browse",
      startVUs: 0,
      stages: SMOKE
        ? [
            { duration: "15s", target: 20 },
            { duration: "45s", target: 20 },
          ]
        : [
            { duration: "1m", target: 500 },
            { duration: "10m", target: 500 },
            { duration: "30s", target: 0 },
          ],
    },
    orders: {
      executor: "constant-arrival-rate",
      exec: "order",
      rate: SMOKE ? 5 : 20,
      timeUnit: "1m",
      duration: SMOKE ? "1m" : "10m",
      startTime: SMOKE ? "0s" : "1m",
      preAllocatedVUs: 10,
      maxVUs: 40,
    },
  },
  thresholds: {
    http_req_failed: ["rate==0"],
    checks: ["rate==1"],
    "http_req_duration{kind:read}": ["p(95)<300"],
    "http_req_duration{kind:order}": ["p(95)<800"],
  },
  summaryTrendStats: ["avg", "med", "p(90)", "p(95)", "p(99)", "max"],
};

/** 10.77.x.y, unique per virtual user. */
function shopperIp() {
  const n = exec.vu.idInTest;
  return `10.77.${Math.floor(n / 250) % 250}.${(n % 250) + 1}`;
}

const pause = (min, max) => sleep(min + Math.random() * (max - min));

function get(path, name) {
  const res = http.get(`${BASE}${path}`, {
    headers: { "x-forwarded-for": shopperIp() },
    tags: { kind: "read", name },
  });
  check(res, { [`${name} 200`]: (r) => r.status === 200 });
  return res;
}

const CATEGORIES = ["kitchen-gadgets", "decoration"];
const SEARCHES = ["chop", "mini", "kitchen", "lamp", "bl"];
const PRODUCT = "mini-electric-chopper-2l";

/** A shopper: home, a category, a product, a search, the cart, with pauses to read. */
export function browse() {
  get("/", "home");
  pause(1, 3);
  const cat = CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)];
  get(`/c/${cat}`, "category");
  pause(1, 3);
  get(`/api/search/suggest?q=${SEARCHES[Math.floor(Math.random() * SEARCHES.length)]}`, "suggest");
  pause(0.5, 1.5);
  get(`/p/${PRODUCT}`, "product");
  pause(2, 5);
  if (Math.random() < 0.3) {
    get("/cart", "cart");
    pause(1, 3);
  }
}

const hex = (n) => Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join("");
const uuid = () => `${hex(8)}-${hex(4)}-4${hex(3)}-a${hex(3)}-${hex(12)}`;

/** Calls a server action the way the browser does and returns its result. */
function action(path, id, args, name, cookie) {
  const res = http.post(`${BASE}${path}`, JSON.stringify(args), {
    headers: {
      "next-action": id,
      accept: "text/x-component",
      "content-type": "text/plain;charset=UTF-8",
      origin: BASE,
      "sec-fetch-site": "same-origin",
      "x-forwarded-for": shopperIp(),
      ...(cookie ? { cookie } : {}),
    },
    jar: new http.CookieJar(), // cookies are passed by hand: the store's are Secure, this is plain http
    tags: { kind: "order", name },
  });
  const line = String(res.body || "")
    .split("\n")
    .find((l) => l.startsWith("1:"));
  let value = null;
  try {
    value = line ? JSON.parse(line.slice(2)) : null;
  } catch {
    value = null;
  }
  return { res, value };
}

/** A shopper who already confirmed their number: add to cart, then place a cash-on-delivery order. */
export function order() {
  const i = exec.scenario.iterationInTest;
  // PHONE_OFFSET: skip numbers an earlier run on the same setup already used.
  const who = run.phones[(i + Number(__ENV.PHONE_OFFSET || 0)) % run.phones.length];
  if (!who) fail("no test phone left");

  const add = action(
    `/p/${PRODUCT}`,
    run.actions.addToCartAction,
    [{ variantId: run.variantId, qty: 1 }],
    "add-to-cart",
  );
  const cart = add.res.cookies.cart && add.res.cookies.cart[0] ? add.res.cookies.cart[0].value : null;
  if (!check(add, { "added to cart": (a) => a.res.status === 200 && a.value && a.value.ok === true && !!cart })) {
    console.error(`add to cart: ${add.res.status} ${String(add.res.body).slice(0, 300)}`);
    return;
  }

  const input = {
    name: `Load Test ${i}`,
    phone: who.local,
    email: "",
    districtId: run.districtId,
    areaId: run.areaId,
    address: `House ${i}, Road 1, Load test area`,
    note: "",
    paymentMethod: "cod",
    payWallet: "",
    senderNumber: "",
    trxId: "",
    couponCode: "",
    acceptTerms: true,
  };
  const key = uuid();
  const placed = action(
    "/checkout",
    run.actions.submitCheckoutAction,
    [input, { key }],
    "place-order",
    `cart=${cart}; phone_ok=${who.token}`,
  );
  if (check(placed, { "order placed": (p) => p.res.status === 200 && p.value && p.value.ok === true })) {
    ordersPlaced.add(1);
  } else {
    console.error(`place order: ${placed.res.status} ${String(placed.res.body).slice(0, 300)}`);
  }
}
