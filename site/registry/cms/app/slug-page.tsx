import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { getPageBySlug } from "@/lib/cms";

interface HeroBlockData {
  blockType: "hero";
  id?: string | null;
  heading: string;
  subheading?: string | null;
  ctaLabel?: string | null;
  ctaHref?: string | null;
}

interface RichTextBlockData {
  blockType: "richText";
  id?: string | null;
  content?: unknown;
}

interface CallToActionBlockData {
  blockType: "cta";
  id?: string | null;
  heading: string;
  body?: string | null;
  primaryLabel?: string | null;
  primaryHref?: string | null;
}

type PageBlock = HeroBlockData | RichTextBlockData | CallToActionBlockData;

export default async function DynamicPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = await getPageBySlug(slug);

  if (!page) {
    notFound();
  }

  const blocks = (page.layout as PageBlock[] | undefined) ?? [];

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="font-heading font-semibold text-4xl tracking-tight">{page.title}</h1>

      {blocks.map((block, i) => {
        const key = block.id ?? `block-${i}`;
        switch (block.blockType) {
          case "hero":
            return (
              <section key={key} className="py-8">
                <h2 className="font-bold text-3xl">{block.heading}</h2>
                {block.subheading ? (
                  <p className="mt-2 text-muted-foreground">{block.subheading}</p>
                ) : null}
                {block.ctaLabel && block.ctaHref ? (
                  <div className="mt-4">
                    <Button asChild>
                      <a href={block.ctaHref}>{block.ctaLabel}</a>
                    </Button>
                  </div>
                ) : null}
              </section>
            );

          case "cta":
            return (
              <section key={key} className="my-8 rounded-lg border p-6">
                <h3 className="font-semibold text-xl">{block.heading}</h3>
                {block.body ? <p className="mt-2 text-muted-foreground">{block.body}</p> : null}
                {block.primaryLabel && block.primaryHref ? (
                  <div className="mt-4">
                    <Button asChild>
                      <a href={block.primaryHref}>{block.primaryLabel}</a>
                    </Button>
                  </div>
                ) : null}
              </section>
            );

          default:
            return null;
        }
      })}
    </main>
  );
}
