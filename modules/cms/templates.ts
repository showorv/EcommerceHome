import { newBlock, type Block, type CmsContent } from "./blocks";

/**
 * Starter text for the standard pages (FR-SF-09). They are created as unpublished drafts the first time
 * someone opens Pages in the admin, so the owners read and adjust them before anything goes live. The
 * return terms follow the SRS default (3-day change of mind, defects replaced free). Pure.
 */

export const STANDARD_SLUGS = ["about", "privacy", "terms", "returns", "shipping", "faq", "contact"] as const;
export type StandardSlug = (typeof STANDARD_SLUGS)[number];

const h = (text: string) => newBlock("heading", { text });
const p = (text: string) => newBlock("paragraph", { text });
const ul = (...items: string[]) => newBlock("list", { items });
const ol = (...items: string[]) => newBlock("list", { style: "number", items });

export function standardPages(store: string): (CmsContent & { slug: StandardSlug })[] {
  const page = (slug: StandardSlug, title: string, seoDescription: string, blocks: Block[]) => ({
    slug,
    title,
    seoTitle: "",
    seoDescription,
    blocks,
  });

  return [
    page("about", "About us", `Who we are and why ${store} brings useful gadgets from China to Bangladesh.`, [
      p(
        `${store} brings smart, useful kitchen and home gadgets from China to homes across Bangladesh. We test what we sell, describe it honestly and deliver it to your door.`,
      ),
      h("What we promise"),
      ul(
        "**Checked products:** we try items before we list them.",
        "**Honest photos and details:** what you see is what you get.",
        "**Pay when it arrives:** cash on delivery all over Bangladesh.",
        "**Real help:** call or message us and a person answers.",
      ),
      newBlock("button", { label: "Shop new arrivals", href: "/search?sort=newest" }),
    ]),

    page("privacy", "Privacy policy", `How ${store} collects, uses and protects your personal information.`, [
      newBlock("callout", {
        tone: "info",
        text: "This policy explains what we collect when you shop with us and how we use it. Last updated: add the date when you publish.",
      }),
      h("What we collect"),
      ul(
        "Your name, mobile number, email (if you give one) and delivery address when you order.",
        "Payment details you type for bKash/Nagad advance payments (sender number and transaction ID). We never ask for your PIN.",
        "Basic technical data such as your browser and pages visited, to keep the site safe and working.",
      ),
      h("How we use it"),
      ul(
        "To confirm, deliver and support your orders, including sharing your name, phone and address with our courier.",
        "To send order updates by SMS and email.",
        "To prevent fraud and fake orders.",
        "To send offers, only if you subscribe. You can unsubscribe at any time.",
      ),
      h("What we never do"),
      p(
        "We do not sell your personal information. We share it only with services that help us run the store (couriers, SMS and email providers, hosting), and only what they need.",
      ),
      h("Your choices"),
      p(
        "You can ask us to show, correct or delete your information by contacting us. We keep order records as long as the law requires.",
      ),
      p("Questions? Visit our [contact page](/pages/contact)."),
    ]),

    page("terms", "Terms & conditions", `The terms for buying from ${store}.`, [
      p(
        `By ordering from ${store} you agree to these terms. Please read them along with our [return policy](/pages/returns) and [shipping information](/pages/shipping).`,
      ),
      h("Orders"),
      ul(
        "An order is accepted only after we confirm it by phone or SMS.",
        "We may cancel an order if a product is out of stock, the price was shown wrongly, or the order looks fraudulent. Any advance you paid is refunded in full.",
        "Prices are in Bangladeshi Taka (৳) and include VAT where it applies.",
      ),
      h("Payment"),
      p(
        "You can pay cash on delivery. Some orders need the delivery charge (or the full amount) in advance by bKash or Nagad; checkout tells you when.",
      ),
      h("Products"),
      p(
        "We describe products as accurately as we can. Small differences in colour because of screens and lighting can happen.",
      ),
      h("Changes"),
      p("We may update these terms. The version on this page when you order is the one that applies."),
    ]),

    page("returns", "Return & refund policy", "Change your mind within 3 days; faulty items replaced free.", [
      newBlock("callout", {
        tone: "success",
        text: "**3-day easy returns.** Changed your mind? Return unused items within 3 days of delivery. Faulty or wrong items are replaced free.",
      }),
      h("Change of mind"),
      ul(
        "Tell us within **3 days** of receiving your order.",
        "The item must be unused, with all parts and the original box.",
        "You pay the return delivery charge.",
      ),
      h("Damaged, faulty or wrong items"),
      ul(
        "Tell us within 3 days with a photo or short video of the problem.",
        "We replace the item free, including delivery. If we can't replace it, we refund you.",
        "Please check the parcel in front of the delivery person when you can.",
      ),
      h("How to return"),
      ol(
        "Contact us with your order number.",
        "We confirm the return and tell you where to send it, or arrange a pickup.",
        "Once we receive and check the item, we send the replacement or refund.",
      ),
      h("Refunds"),
      p("Refunds go to your bKash or Nagad number within 7 working days after we receive the item."),
    ]),

    page("shipping", "Shipping & delivery", "Delivery charges, times and payment options across Bangladesh.", [
      p("We deliver all over Bangladesh with trusted courier partners."),
      h("Delivery time"),
      ul("Inside Dhaka: usually 1–2 days.", "Dhaka suburbs: usually 2–3 days.", "Outside Dhaka: usually 3–5 days."),
      h("Delivery charge"),
      p("The charge depends on your area and the parcel weight. Checkout shows the exact amount before you order."),
      h("Paying"),
      ul(
        "**Cash on delivery:** pay the delivery person when the parcel arrives.",
        "**Advance by bKash/Nagad:** some orders (for example outside Dhaka or higher value) need the delivery charge paid first. Checkout explains how.",
      ),
      h("Tracking"),
      p("When your parcel is on the way we send an SMS with the courier name and tracking code."),
    ]),

    page("faq", "Frequently asked questions", "Answers about orders, delivery, payment and returns.", [
      newBlock("faq", {
        items: [
          {
            q: "How do I order?",
            a: "Add products to your cart and check out with your name, phone and address. We call or text to confirm.",
          },
          {
            q: "Can I pay cash on delivery?",
            a: "Yes. Some orders need the delivery charge in advance by bKash or Nagad; checkout tells you when.",
          },
          {
            q: "How long does delivery take?",
            a: "Usually 1–2 days inside Dhaka and 3–5 days elsewhere in Bangladesh.",
          },
          {
            q: "Can I return a product?",
            a: "Yes, unused items within 3 days. Faulty items are replaced free. See our return policy for details.",
          },
          {
            q: "Are the products original?",
            a: "We source directly and check items before listing them. Product pages describe exactly what you get.",
          },
        ],
      }),
      p("Still have a question? [Contact us](/pages/contact)."),
    ]),

    page("contact", "Contact us", `Call, email or message ${store}.`, [
      p("We're happy to help with orders, products and returns."),
      newBlock("contactDetails", { heading: "Get in touch" }),
      newBlock("contactForm", { heading: "Send us a message", text: "We usually reply within a day." }),
    ]),
  ];
}
