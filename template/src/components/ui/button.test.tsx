import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { Button } from "./button";

it("renders its label", async () => {
  render(<Button>Save changes</Button>);
  await expect.element(screen.getByRole("button", { name: "Save changes" })).toBeInTheDocument();
});

it("applies the destructive variant class", () => {
  const { container } = render(<Button variant="destructive">Delete</Button>);
  expect(container.querySelector("button")?.className).toContain("destructive");
});
