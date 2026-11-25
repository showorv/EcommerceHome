export default function InvoiceNotFound() {
  return (
    <main className="mx-auto grid max-w-md gap-3 px-4 py-24 text-center">
      <h1 className="text-xl font-semibold">This invoice link doesn&apos;t work</h1>
      <p className="text-muted-foreground">
        It may have expired or been replaced. Please contact the shop and we&apos;ll send you a new link.
      </p>
    </main>
  );
}
