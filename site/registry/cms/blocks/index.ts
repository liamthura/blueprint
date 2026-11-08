import type { Block } from "payload";

export const HeroBlock: Block = {
  slug: "hero",
  interfaceName: "HeroBlock",
  fields: [
    {
      name: "heading",
      type: "text",
      required: true,
    },
    {
      name: "subheading",
      type: "textarea",
    },
    {
      name: "ctaLabel",
      type: "text",
    },
    {
      name: "ctaHref",
      type: "text",
    },
    {
      name: "backgroundImage",
      type: "upload",
      relationTo: "media",
    },
  ],
};

export const RichTextBlock: Block = {
  slug: "richText",
  interfaceName: "RichTextBlock",
  fields: [
    {
      name: "content",
      type: "richText",
      required: true,
    },
  ],
};

export const CallToActionBlock: Block = {
  slug: "cta",
  interfaceName: "CallToActionBlock",
  fields: [
    {
      name: "heading",
      type: "text",
      required: true,
    },
    {
      name: "body",
      type: "textarea",
    },
    {
      name: "primaryLabel",
      type: "text",
      required: true,
    },
    {
      name: "primaryHref",
      type: "text",
      required: true,
    },
    {
      name: "secondaryLabel",
      type: "text",
    },
    {
      name: "secondaryHref",
      type: "text",
    },
  ],
};

export const pageBlocks: Block[] = [HeroBlock, RichTextBlock, CallToActionBlock];
