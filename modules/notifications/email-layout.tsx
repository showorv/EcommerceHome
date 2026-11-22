import { Body, Button, Container, Head, Hr, Html, Link, Preview, Section, Text, render } from "@react-email/components";
import type { ReactNode } from "react";

/**
 * Every customer and staff email in one simple layout (SRS §8.3, React Email): the shop name, the
 * text staff wrote (paragraphs split on blank lines, links made clickable), an optional button, and
 * the shop's contact details. Rendered by the worker just before sending.
 */

export type EmailBrand = { name: string; phone: string; email: string; address: string };
export type EmailContent = { subject: string; text: string; button?: { label: string; url: string } | null };

const URL_RE = /(https?:\/\/[^\s<>"']+)/g;

function linkify(line: string, key: string): ReactNode[] {
  return line.split(URL_RE).map((part, i) =>
    /^https?:\/\//.test(part) ? (
      <Link
        key={`${key}-${i}`}
        href={part}
        style={{ color: "#111", textDecoration: "underline", wordBreak: "break-all" }}
      >
        {part}
      </Link>
    ) : (
      part
    ),
  );
}

export function paragraphs(text: string): string[][] {
  return text
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((p) => p.split("\n").map((l) => l.trim()))
    .filter((lines) => lines.some(Boolean));
}

const font = '"Noto Sans Bengali", "Noto Sans", "Segoe UI", Roboto, Helvetica, Arial, "Hind Siliguri", sans-serif';

export function StoreEmail({ brand, content }: { brand: EmailBrand; content: EmailContent }) {
  const contact = [brand.phone, brand.email, brand.address].filter(Boolean).join(" · ");
  return (
    <Html lang="en">
      <Head />
      <Preview>{content.subject}</Preview>
      <Body style={{ backgroundColor: "#f4f4f5", fontFamily: font, margin: 0, padding: "24px 0" }}>
        <Container style={{ backgroundColor: "#ffffff", borderRadius: 8, maxWidth: 560, padding: "28px 32px" }}>
          <Text style={{ fontSize: 18, fontWeight: 700, margin: "0 0 20px", color: "#111" }}>{brand.name}</Text>
          {paragraphs(content.text).map((lines, i) => (
            <Text key={i} style={{ fontSize: 15, lineHeight: "24px", color: "#222", margin: "0 0 14px" }}>
              {lines.flatMap((l, j) =>
                j === 0 ? linkify(l, `${i}-${j}`) : [<br key={`br-${i}-${j}`} />, ...linkify(l, `${i}-${j}`)],
              )}
            </Text>
          ))}
          {content.button && (
            <Section style={{ margin: "8px 0 18px" }}>
              <Button
                href={content.button.url}
                style={{
                  backgroundColor: "#111",
                  color: "#fff",
                  borderRadius: 6,
                  padding: "11px 20px",
                  fontSize: 14,
                  fontWeight: 600,
                  textDecoration: "none",
                }}
              >
                {content.button.label}
              </Button>
            </Section>
          )}
          <Hr style={{ borderColor: "#e4e4e7", margin: "22px 0 12px" }} />
          <Text style={{ fontSize: 12, lineHeight: "18px", color: "#71717a", margin: 0 }}>
            {brand.name}
            {contact && (
              <>
                <br />
                {contact}
              </>
            )}
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export async function renderEmailHtml(brand: EmailBrand, content: EmailContent): Promise<string> {
  return render(<StoreEmail brand={brand} content={content} />);
}
