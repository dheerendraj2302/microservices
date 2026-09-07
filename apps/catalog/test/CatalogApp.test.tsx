import { render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import CatalogApp from "../src/CatalogApp";

afterEach(() => vi.restoreAllMocks());

test("renders products returned by the catalog API", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
    items: [{ id: "1", name: "Local roast", category: "Coffee", price: 12 }],
    total: 1,
    page: 1,
    pageSize: 12
  }), { status: 200 }));

  render(<CatalogApp />);
  expect(await screen.findByText("Local roast")).toBeInTheDocument();
  expect(screen.getByText("$12.00")).toBeInTheDocument();
});
