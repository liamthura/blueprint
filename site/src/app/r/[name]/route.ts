import { loadRegistry, loadRegistryItem, RegistryItemNotFoundError } from "shadcn/registry";
import { absolutiseDependencies } from "@/lib/registry-urls";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const itemName = name.replace(/\.json$/, "");
  const origin = new URL(request.url).origin;

  try {
    const registry = await loadRegistry({ cwd: process.cwd() });

    if (itemName === "registry") {
      return Response.json(registry);
    }

    const item = await loadRegistryItem(itemName, { cwd: process.cwd() });
    const ownNames = new Set(registry.items.map((i) => i.name));
    return Response.json(absolutiseDependencies(item, origin, ownNames));
  } catch (error) {
    if (error instanceof RegistryItemNotFoundError) {
      return Response.json({ error: `Unknown registry item: ${itemName}` }, { status: 404 });
    }
    console.error(`Failed to serve registry item "${itemName}"`, error);
    return Response.json({ error: "Failed to load registry item" }, { status: 500 });
  }
}
