import { describe, it, expect } from "vitest";
import { visibleNavItems } from "../Sidebar";

const ids = (perms: string[]) => visibleNavItems(perms).map((n) => n.id);

describe("visibleNavItems", () => {
  it("lead sees the team workspace and no approvals", () => {
    const v = ids(["manage_team"]);
    expect(v).toContain("team");
    expect(v).toContain("calendar");
    expect(v).toContain("grades");
    expect(v).not.toContain("approvals");
  });

  it("hr sees approvals + grades only", () => {
    const v = ids(["approve_reviews", "edit_framework", "edit_salary_bands"]);
    expect(v).toEqual(["grades", "approvals"]);
  });

  it("no permissions → only ungated items", () => {
    expect(ids([])).toEqual(["grades"]);
  });
});
