/**
 * Demo catalogue for designing the storefront: what `pnpm demo:seed` creates. Photos are free
 * Unsplash images (unsplash.com/license), downloaded into public/uploads/images as demo-*.jpg (git-ignored).
 * Prices are in taka here; the seed stores poisha.
 */

const U = "https://images.unsplash.com/photo-";

/** Unsplash photo ids per subject: products use [0,1] and [2,3]. */
export const PHOTOS: Record<string, string[]> = {
  pan: [
    "1624031000828-dba1b7a3e4ce",
    "1592156328697-079f6ee0cfa5",
    "1592156328757-ae2941276b2c",
    "1608019527897-238a401a7b7c",
  ],
  kettle: [
    "1738520420652-0c47cea3922b",
    "1643114786355-ff9e52736eab",
    "1594213114663-d94db9b17125",
    "1738520420636-a1591b84723e",
  ],
  mug: [
    "1616241673111-508b4662c707",
    "1666445844615-0a3930270f13",
    "1570784332176-fdd73da66f03",
    "1520485521983-bfaa0bc6c80e",
  ],
  knife: [
    "1622021142947-da7dedc7c39a",
    "1614362705324-8da11fd16754",
    "1596633609591-e4e1e9e06b7f",
    "1604543248368-da42b20dce5b",
  ],
  blender: [
    "1654179279965-8ff0872d976b",
    "1661426315684-715ed32d4232",
    "1661451837931-d401b120d2f6",
    "1668074201943-a142177d7f58",
  ],
  utensils: [
    "1514986888952-8cd320577b68",
    "1556185781-a47769abb7ee",
    "1556909211-36987daf7b4d",
    "1452251889946-8ff5ea7b27ab",
  ],
  lamp: [
    "1517991104123-1d56a6e81ed9",
    "1621177555630-b861919c864f",
    "1580130281320-0ef0754f2bf7",
    "1585128719715-46776b56a0d1",
  ],
  candle: [
    "1561212856-44e9bae482aa",
    "1601922046210-41e129a3e64a",
    "1640095889747-2090ee12fa7d",
    "1528351655744-27cc30462816",
  ],
  vase: [
    "1631125915902-d8abe9225ff2",
    "1597696929736-6d13bed8e6a8",
    "1660721671073-e139688fa3cf",
    "1612196808214-b8e1d6145a8c",
  ],
  plant: [
    "1520412099551-62b6bafeb5bb",
    "1592150621744-aca64f48394a",
    "1601985705806-5b9a71f6004f",
    "1463320898484-cdee8141c787",
  ],
  clock: [
    "1563861826100-9cb868fdbe1c",
    "1533090161767-e6ffed986c88",
    "1564091880021-bb02f2b2928d",
    "1549190179-646f048c6108",
  ],
  backpack: [
    "1553062407-98eeb64c6a62",
    "1622560480654-d96214fdc887",
    "1622560480605-d83c853bc5c3",
    "1581605405669-fcdf81165afa",
  ],
  duffel: [
    "1504150558240-0b4fd8946624",
    "1502301197179-65228ab57f78",
    "1448582649076-3981753123b5",
    "1522199710521-72d69614c702",
  ],
  wallet: [
    "1627123424574-724758594e93",
    "1614260938313-a7fc1a7ad0d2",
    "1628483211662-9bcc692c46dc",
    "1579014134953-1580d7f123f3",
  ],
  tote: [
    "1574365569389-a10d488ca3fb",
    "1544816155-12df9643f363",
    "1630381260512-e3fe55c11973",
    "1578237493287-8d4d2b03591a",
  ],
  headphones: [
    "1505740420928-5e560c06d30e",
    "1618366712010-f4ae9c647dcb",
    "1545127398-14699f92334b",
    "1546435770-a3e426bf472b",
  ],
  speaker: [
    "1608043152269-423dbba4e7e1",
    "1589256469067-ea99122bbdc4",
    "1529359744902-86b2ab9edaea",
    "1589003077984-894e133dabab",
  ],
  earbuds: [
    "1572569511254-d8f925fe2cbb",
    "1590658268037-6bf12165a8df",
    "1606841837239-c5a1a4a07af7",
    "1606220588913-b3aacb4d2f46",
  ],
  watch: [
    "1579586337278-3befd40fd17a",
    "1660844817855-3ecc7ef21f12",
    "1546868871-7041f2a55e12",
    "1508685096489-7aacd43bd3b1",
  ],
};

/** Wide photos for the home page slider and banner. */
export const WIDE_PHOTOS: Record<string, string> = {
  kitchen: "1556911220-bff31c812dba",
  living: "1583847268964-b28dc8f51f92",
  travel: "1501555088652-021faa106b9b",
  interior: "1618221195710-dd6b41faaea6",
};

export const photoSource = (id: string, wide = false) =>
  `${U}${id}?${wide ? "w=1920&h=860" : "w=900&h=900"}&fit=crop&q=72&fm=jpg&auto=format`;

export type DemoCategory = { key: string; name: string; bn: string; parent: string | null; existingSlug?: string };

/** Top-level categories reuse the shop's own when the slug exists already (they are never removed). */
export const CATEGORIES: DemoCategory[] = [
  { key: "kitchen", name: "Kitchen Gadgets", bn: "রান্নাঘরের গ্যাজেট", parent: null, existingSlug: "kitchen-gadgets" },
  { key: "cookware", name: "Cookware", bn: "রান্নার পাত্র", parent: "kitchen" },
  { key: "tools", name: "Kitchen Tools", bn: "রান্নাঘরের সরঞ্জাম", parent: "kitchen" },
  { key: "decor", name: "Decoration", bn: "সাজসজ্জা", parent: null, existingSlug: "decoration" },
  { key: "lighting", name: "Lighting", bn: "আলো", parent: "decor" },
  { key: "vases", name: "Vases & Plants", bn: "ফুলদানি ও গাছ", parent: "decor" },
  { key: "bags", name: "Bags & Travel", bn: "ব্যাগ ও ভ্রমণ", parent: null },
  { key: "backpacks", name: "Backpacks", bn: "ব্যাকপ্যাক", parent: "bags" },
  { key: "wallets", name: "Wallets & Totes", bn: "ওয়ালেট ও টোট", parent: "bags" },
  { key: "electronics", name: "Electronics", bn: "ইলেকট্রনিক্স", parent: null },
  { key: "audio", name: "Audio", bn: "অডিও", parent: "electronics" },
  { key: "watches", name: "Smart Watches", bn: "স্মার্ট ঘড়ি", parent: "electronics" },
];

export type DemoProduct = {
  title: string;
  category: string; // sub-category key; the product is also listed in its parent
  photos: [string, number]; // subject, first photo index (0 or 2)
  price: number;
  compareAt?: number;
  labels?: ("new" | "hot" | "bestseller" | "sale" | "limited")[];
  /** One option with values; each value is a variant (price step adds to the base price). */
  option?: { name: string; values: string[]; step?: number };
  stock?: number;
  rating?: [number, number];
  summary: string;
};

export const PRODUCTS: DemoProduct[] = [
  // Cookware
  {
    title: "Non-Stick Frying Pan",
    category: "cookware",
    photos: ["pan", 0],
    price: 1450,
    compareAt: 1890,
    labels: ["hot"],
    option: { name: "Size", values: ["24 cm", "28 cm"], step: 250 },
    rating: [4.7, 128],
    summary: "Granite non-stick coating, heats evenly on gas and induction.",
  },
  {
    title: "Cast Iron Skillet",
    category: "cookware",
    photos: ["pan", 2],
    price: 2250,
    rating: [4.8, 64],
    summary: "Pre-seasoned cast iron that lasts a lifetime. Oven safe.",
  },
  {
    title: "Electric Kettle 1.8 L",
    category: "cookware",
    photos: ["kettle", 0],
    price: 1650,
    compareAt: 2100,
    labels: ["new"],
    option: { name: "Colour", values: ["Black", "White"] },
    rating: [4.6, 92],
    summary: "Boils in under 4 minutes, auto shut-off and dry-boil protection.",
  },
  {
    title: "Glass Gooseneck Kettle",
    category: "cookware",
    photos: ["kettle", 2],
    price: 1890,
    summary: "Precise pour for tea and pour-over coffee. Borosilicate glass.",
  },
  {
    title: "Ceramic Coffee Mug Set",
    category: "cookware",
    photos: ["mug", 0],
    price: 690,
    compareAt: 850,
    option: { name: "Colour", values: ["Sand", "Sage", "Charcoal"] },
    rating: [4.5, 41],
    summary: "Two hand-glazed 350 ml mugs. Microwave and dishwasher safe.",
  },
  {
    title: "Stoneware Mug",
    category: "cookware",
    photos: ["mug", 2],
    price: 390,
    summary: "Thick stoneware keeps drinks warm longer.",
  },
  // Kitchen tools
  {
    title: 'Damascus Chef Knife 8"',
    category: "tools",
    photos: ["knife", 0],
    price: 2490,
    compareAt: 3200,
    labels: ["bestseller"],
    rating: [4.9, 210],
    summary: "67-layer Damascus steel, razor sharp out of the box.",
  },
  {
    title: "Japanese Santoku Knife",
    category: "tools",
    photos: ["knife", 2],
    price: 1990,
    rating: [4.7, 58],
    summary: "Light and nimble for slicing, dicing and mincing.",
  },
  {
    title: "Portable Juicer Blender",
    category: "tools",
    photos: ["blender", 0],
    price: 1790,
    compareAt: 2290,
    labels: ["hot"],
    option: { name: "Colour", values: ["Pink", "Green", "Blue"] },
    rating: [4.4, 175],
    summary: "USB rechargeable, blends smoothies in 30 seconds.",
  },
  {
    title: "Hand Blender 600 W",
    category: "tools",
    photos: ["blender", 2],
    price: 2650,
    summary: "Stainless steel shaft, two speeds, whisk and chopper included.",
  },
  {
    title: "Wooden Utensil Set",
    category: "tools",
    photos: ["utensils", 0],
    price: 890,
    rating: [4.6, 33],
    summary: "Five teak spoons and spatulas that won't scratch your pans.",
  },
  {
    title: "Stainless Steel Grater",
    category: "tools",
    photos: ["utensils", 2],
    price: 450,
    stock: 3,
    summary: "Four sides for fine, coarse, slices and zest.",
  },
  // Lighting
  {
    title: "Nordic Table Lamp",
    category: "lighting",
    photos: ["lamp", 0],
    price: 2450,
    compareAt: 2990,
    labels: ["new"],
    rating: [4.8, 47],
    summary: "Warm, dimmable light with a linen shade.",
  },
  {
    title: "Rattan Pendant Light",
    category: "lighting",
    photos: ["lamp", 2],
    price: 3250,
    summary: "Hand-woven rattan for a soft, patterned glow.",
  },
  {
    title: "Soy Wax Scented Candle",
    category: "lighting",
    photos: ["candle", 0],
    price: 550,
    option: { name: "Scent", values: ["Vanilla", "Lavender", "Sandalwood"] },
    rating: [4.7, 86],
    summary: "40-hour burn, cotton wick, clean-burning soy wax.",
  },
  {
    title: "Glass Jar Candle Set",
    category: "lighting",
    photos: ["candle", 2],
    price: 990,
    compareAt: 1290,
    labels: ["sale"],
    summary: "Three amber jar candles for the living room.",
  },
  // Vases & plants
  {
    title: "Ceramic Bud Vase",
    category: "vases",
    photos: ["vase", 0],
    price: 790,
    summary: "Matte glaze, perfect for a single stem.",
  },
  {
    title: "Textured Stone Vase",
    category: "vases",
    photos: ["vase", 2],
    price: 1290,
    compareAt: 1590,
    rating: [4.5, 22],
    summary: "Stone-look finish that suits any shelf.",
  },
  {
    title: "Artificial Potted Plant",
    category: "vases",
    photos: ["plant", 0],
    price: 1150,
    labels: ["hot"],
    rating: [4.6, 70],
    summary: "Life-like leaves, no watering needed.",
  },
  {
    title: "Mini Succulent Pot Set",
    category: "vases",
    photos: ["plant", 2],
    price: 650,
    summary: "Three small pots for desks and windowsills.",
  },
  {
    title: "Minimal Wall Clock",
    category: "vases",
    photos: ["clock", 0],
    price: 1390,
    compareAt: 1790,
    option: { name: "Colour", values: ["White", "Black"] },
    summary: "Silent sweep movement, 30 cm face.",
  },
  {
    title: "Vintage Wall Clock",
    category: "vases",
    photos: ["clock", 2],
    price: 1850,
    labels: ["limited"],
    summary: "Roman numerals and an antique brass finish.",
  },
  // Backpacks
  {
    title: "Anti-Theft Laptop Backpack",
    category: "backpacks",
    photos: ["backpack", 0],
    price: 2890,
    compareAt: 3590,
    labels: ["bestseller"],
    option: { name: "Colour", values: ["Black", "Grey"] },
    rating: [4.8, 156],
    summary: 'Hidden zips, USB charging port, fits a 15.6" laptop.',
  },
  {
    title: "Canvas Rolltop Backpack",
    category: "backpacks",
    photos: ["backpack", 2],
    price: 2290,
    rating: [4.5, 39],
    summary: "Water-resistant waxed canvas that expands as you pack.",
  },
  {
    title: "Weekend Duffel Bag",
    category: "backpacks",
    photos: ["duffel", 0],
    price: 3150,
    summary: "Roomy main compartment with a separate shoe pocket.",
  },
  {
    title: "Leather Travel Holdall",
    category: "backpacks",
    photos: ["duffel", 2],
    price: 4990,
    compareAt: 5990,
    labels: ["limited"],
    summary: "Full-grain leather that ages beautifully.",
  },
  // Wallets & totes
  {
    title: "Slim Leather Wallet",
    category: "wallets",
    photos: ["wallet", 0],
    price: 990,
    compareAt: 1290,
    labels: ["hot"],
    option: { name: "Colour", values: ["Brown", "Black"] },
    rating: [4.7, 230],
    summary: "Holds 8 cards and cash, 6 mm thin.",
  },
  {
    title: "RFID Card Holder",
    category: "wallets",
    photos: ["wallet", 2],
    price: 650,
    summary: "Blocks card skimming. Pop-up card slider.",
  },
  {
    title: "Cotton Canvas Tote",
    category: "wallets",
    photos: ["tote", 0],
    price: 490,
    summary: "Heavy 12 oz canvas, inner pocket.",
  },
  {
    title: "Everyday Shopper Tote",
    category: "wallets",
    photos: ["tote", 2],
    price: 850,
    stock: 0,
    summary: "Big enough for groceries, smart enough for work.",
  },
  // Audio
  {
    title: "Wireless Over-Ear Headphones",
    category: "audio",
    photos: ["headphones", 0],
    price: 3490,
    compareAt: 4500,
    labels: ["bestseller"],
    option: { name: "Colour", values: ["Black", "White"] },
    rating: [4.6, 312],
    summary: "40-hour battery, active noise cancelling.",
  },
  {
    title: "Studio Monitor Headphones",
    category: "audio",
    photos: ["headphones", 2],
    price: 4290,
    rating: [4.8, 51],
    summary: "Flat, accurate sound for music and editing.",
  },
  {
    title: "Portable Bluetooth Speaker",
    category: "audio",
    photos: ["speaker", 0],
    price: 2190,
    compareAt: 2790,
    labels: ["hot"],
    rating: [4.5, 144],
    summary: "IPX7 waterproof, 12 hours of play.",
  },
  {
    title: "Mini Smart Speaker",
    category: "audio",
    photos: ["speaker", 2],
    price: 1590,
    stock: 4,
    summary: "Room-filling sound in a palm-sized speaker.",
  },
  {
    title: "True Wireless Earbuds",
    category: "audio",
    photos: ["earbuds", 0],
    price: 1890,
    compareAt: 2490,
    labels: ["new"],
    rating: [4.4, 198],
    summary: "Touch controls, 30 hours with the charging case.",
  },
  {
    title: "Sport Earbuds",
    category: "audio",
    photos: ["earbuds", 2],
    price: 1490,
    summary: "Ear hooks that stay put on runs and in the gym.",
  },
  // Smart watches
  {
    title: "Fitness Smart Watch",
    category: "watches",
    photos: ["watch", 0],
    price: 2790,
    compareAt: 3490,
    labels: ["new"],
    option: { name: "Strap", values: ["Black", "Pink", "Olive"] },
    rating: [4.5, 88],
    summary: "Heart rate, sleep and 100+ sport modes. 10-day battery.",
  },
  {
    title: "Classic Smart Watch",
    category: "watches",
    photos: ["watch", 2],
    price: 3990,
    rating: [4.7, 37],
    summary: "Steel case, AMOLED screen, calls from your wrist.",
  },
];
