import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import OrdersApp from "../src/OrdersApp";

afterEach(() => vi.restoreAllMocks());

test("loads orders for the entered customer", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
    items: [{ id: 42, status: "Ready" }],
    page: 1,
    limit: 20
  }), { status: 200 }));
  render(<OrdersApp />);
  fireEvent.change(screen.getByLabelText("Customer ID"), { target: { value: "1" } });
  fireEvent.click(screen.getByRole("button", { name: "Find orders" }));
  expect(await screen.findByText("Order 42")).toBeInTheDocument();
});
