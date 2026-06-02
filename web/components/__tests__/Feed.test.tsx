import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { Feed } from "../Feed";
import type { MeetingListItem } from "@/lib/query/profile";

const ITEMS: MeetingListItem[] = [
  { id: "m1", date: "2026-05-25T09:00:00Z", state: "done", mood: "🙂", mood_score: 8, preview: "Флака в CI" },
  { id: "m2", date: "2026-06-20T09:00:00Z", state: "planned", mood: null, mood_score: null, preview: "Обсудим цели квартала" },
];

describe("Feed", () => {
  it("renders a state-derived title and marks the active item", () => {
    render(<Feed items={ITEMS} activeId="m1" onSelect={() => {}} />);
    expect(screen.getByText("Завершена")).toBeInTheDocument();
    expect(screen.getByText("Запланирована")).toBeInTheDocument();
    expect(screen.getByTestId("feed-item-m1")).toHaveAttribute("data-active", "true");
  });

  it("selects on click", () => {
    const onSelect = vi.fn();
    render(<Feed items={ITEMS} activeId={null} onSelect={onSelect} />);
    fireEvent.click(screen.getByTestId("feed-item-m2"));
    expect(onSelect).toHaveBeenCalledWith("m2");
  });
});
