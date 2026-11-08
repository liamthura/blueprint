import config from "@payload-config";
import { getPayload } from "payload";

export async function getCms() {
  return getPayload({ config });
}

export async function getPublishedPosts(limit = 20) {
  const payload = await getCms();
  const result = await payload.find({
    collection: "posts",
    where: {
      _status: { equals: "published" },
    },
    sort: "-publishedAt",
    limit,
  });
  return result.docs;
}

export async function getPostBySlug(slug: string) {
  const payload = await getCms();
  const result = await payload.find({
    collection: "posts",
    where: {
      and: [{ slug: { equals: slug } }, { _status: { equals: "published" } }],
    },
    limit: 1,
  });
  return result.docs[0] ?? null;
}

export async function getPageBySlug(slug: string) {
  const payload = await getCms();
  const result = await payload.find({
    collection: "pages",
    where: {
      and: [{ slug: { equals: slug } }, { _status: { equals: "published" } }],
    },
    limit: 1,
  });
  return result.docs[0] ?? null;
}
