// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { parsePhotoIds } from "@/lib/admin/photo-ids";
import { blocksToMarkup, imageIds, markupToBlocks } from "@/lib/content/markup";
import { PhotoSlider, type SlidePhoto } from "@/components/content/PhotoSlider";

afterEach(cleanup);

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";

describe("slider in the text format", () => {
  it("round-trips and counts its photos", () => {
    const text = `## Camp\n\n!slider[Day one](media:${A},${B},${C})`;
    const { blocks, errors } = markupToBlocks(text);
    expect(errors).toEqual([]);
    expect(blocks[1]).toEqual({ type: "slider", mediaIds: [A, B, C], caption: "Day one" });
    expect(blocksToMarkup(blocks)).toBe(text);
    expect(imageIds(blocks)).toEqual([A, B, C]);
  });
  it("needs 2 to 20 valid photos", () => {
    expect(markupToBlocks(`!slider[](media:${A})`).errors[0]!.message).toMatch(/2 to 20 photos/);
    expect(markupToBlocks(`!slider[](media:${A},nope)`).errors[0]!.message).toMatch(/Insert slider/);
    // A slider line is never mistaken for an unsafe link.
    expect(markupToBlocks(`!slider[x](media:${A},${B})`).errors).toEqual([]);
  });
});

describe("photo lists", () => {
  it("keeps valid ids once, in order, up to the limit", () => {
    expect(parsePhotoIds(` ${B},${A},${B},bad,`)).toEqual([B, A]);
    expect(parsePhotoIds([A, B, C].join(","), 2)).toEqual([A, B]);
    expect(parsePhotoIds(undefined)).toEqual([]);
  });
});

describe("PhotoSlider", () => {
  const photo = (id: string, n: number): SlidePhoto => ({
    id,
    width: 1280,
    height: 720,
    blur: null,
    src: `/m/${n}-1280.webp`,
    srcset: `/m/${n}-640.webp 640w, /m/${n}-1280.webp 1280w`,
    alt: `Photo ${n}`,
    caption: n === 1 ? "First" : null,
  });
  it("labels slides and dots, and moves with the buttons", () => {
    render(<PhotoSlider photos={[photo(A, 1), photo(B, 2), photo(C, 3)]} />);
    expect(screen.getByRole("region", { name: "Photos" })).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /^Photo \d of 3$/ })).toHaveLength(3);
    expect(screen.getByRole("button", { name: "Previous photo" }).hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Next photo" }));
    expect(screen.getByRole("button", { name: "Photo 2 of 3" }).getAttribute("aria-current")).toBe("true");
    expect(screen.getByText("First")).toBeTruthy();
    // Only the hero's first slide is eager.
    expect(screen.getByAltText("Photo 1").getAttribute("loading")).toBe("lazy");
  });
});
