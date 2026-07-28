import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ModeControls } from "../../src/components/ModeControls";

describe("ModeControls", () => {
  it("offers the two core modes and only the approved radii", async () => {
    const user = userEvent.setup();
    const onModeChange = vi.fn();
    const onRadiusChange = vi.fn();
    render(
      <ModeControls
        mode="nearby"
        radius={10_000}
        onModeChange={onModeChange}
        onRadiusChange={onRadiusChange}
      />,
    );

    const modeGroup = screen.getByRole("radiogroup", {
      name: "搜索模式",
    });
    expect(
      within(modeGroup)
        .getAllByRole("radio")
        .map((item) => item.getAttribute("aria-label")),
    ).toEqual(["附近充电", "前方推荐"]);

    const radiusGroup = screen.getByRole("radiogroup", {
      name: "搜索范围",
    });
    expect(
      within(radiusGroup)
        .getAllByRole("radio")
        .map((item) => item.getAttribute("aria-label")),
    ).toEqual(["3 km", "5 km", "10 km", "20 km", "50 km"]);

    await user.click(
      within(modeGroup).getByRole("radio", { name: "前方推荐" }),
    );
    expect(onModeChange).toHaveBeenCalledWith("forward");
  });
});
