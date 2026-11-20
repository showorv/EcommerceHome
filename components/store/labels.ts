/** Display names for the product labels admins can set (FR-PC-01). */
export const LABELS: Record<string, string> = {
  new: "New",
  hot: "Hot",
  bestseller: "Bestseller",
  sale: "Sale",
  limited: "Limited",
};

/** Labels shown on the brand colour; the rest are neutral. */
export const LOUD_LABELS = new Set(["hot", "sale"]);
