import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import MicroFrontendUnavailablePage from "../pages/mfe-unavailable";

vi.mock("next/router", () => ({
  useRouter: () => ({ query: { name: "Catalog" } })
}));

test("keeps the shell usable when a zone is unavailable", () => {
  render(<MicroFrontendUnavailablePage />);
  expect(screen.getByRole("alert")).toHaveTextContent("Catalog is currently unavailable.");
  expect(screen.getByText(/shell is still running/i)).toBeInTheDocument();
});
