// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { RichText } from "@/components/ui/RichText";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Logo, logoSize } from "@/components/ui/Logo";

afterEach(cleanup);

describe("Button / ButtonLink", () => {
  it("Button is a type=button by default", () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole("button", { name: "Save" }).getAttribute("type")).toBe("button");
  });
  it("ButtonLink is a link", () => {
    render(<ButtonLink href="/en/donate">Donate</ButtonLink>);
    expect(screen.getByRole("link", { name: "Donate" }).getAttribute("href")).toBe("/en/donate");
  });
});

describe("Alert", () => {
  it("is announced only when live", () => {
    const { rerender } = render(<Alert tone="info" title="Note" />);
    expect(screen.queryByRole("status")).toBeNull();
    rerender(<Alert tone="info" title="Confirming" live="polite" />);
    expect(screen.getByRole("status")).toBeTruthy();
    rerender(<Alert tone="error" title="Failed" live="assertive" />);
    expect(screen.getByRole("alert")).toBeTruthy();
  });
});

describe("Breadcrumbs", () => {
  it("marks the last item as the current page without a link", () => {
    render(<Breadcrumbs label="Breadcrumb" items={[{ label: "Home", href: "/en" }, { label: "Causes" }]} />);
    expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toBeTruthy();
    expect(screen.getByText("Causes").getAttribute("aria-current")).toBe("page");
    expect(screen.queryByRole("link", { name: "Causes" })).toBeNull();
  });
});

describe("Logo", () => {
  it("never renders below the brand minimum width", () => {
    expect(logoSize("horizontal", 120).width).toBe(200);
    expect(logoSize("mark", 20).width).toBe(48);
    expect(logoSize("compact", 16)).toEqual({ width: 16, height: 16 });
  });
  it("has the given accessible name", () => {
    render(<Logo alt="MS Welfare Trust – home" />);
    expect(screen.getByRole("img", { name: "MS Welfare Trust – home" }).getAttribute("width")).toBe("204");
  });
});

describe("RichText photo layouts", () => {
  const ID = "11111111-1111-4111-8111-111111111111";
  const media = {
    [ID]: {
      id: ID,
      width: 1600,
      height: 1067,
      blur: null,
      src: "/p.webp",
      srcset: "/p-640.webp 640w",
      alt: "Camp",
      caption: null,
    },
  };
  const figure = (block: Parameters<typeof RichText>[0]["blocks"][number]) => {
    const { container } = render(<RichText blocks={[block]} media={media} />);
    const f = container.querySelector("figure")!;
    cleanup();
    return f;
  };

  it("full width by default; centred, left and right with a size from tablet width up", () => {
    expect(figure({ type: "image", mediaId: ID }).className).not.toMatch(/md:w-|float/);
    expect(figure({ type: "image", mediaId: ID, align: "center", size: "large" }).className).toMatch(
      /md:w-2\/3.*mx-auto|mx-auto.*md:w-2\/3/,
    );
    const left = figure({ type: "image", mediaId: ID, align: "left", size: "small" }).className;
    expect(left).toContain("md:float-left");
    expect(left).toContain("md:w-1/3");
    // Left/right without a size are medium (half the width).
    expect(figure({ type: "image", mediaId: ID, align: "right" }).className).toMatch(
      /md:float-right.*md:w-1\/2|md:w-1\/2.*md:float-right/,
    );
  });

  it("text flows around floated photos; headings start below them", () => {
    const { container } = render(
      <RichText
        blocks={[
          { type: "image", mediaId: ID, align: "left", size: "small" },
          { type: "paragraph", text: "Beside the photo." },
          { type: "heading", level: 2, text: "Next" },
        ]}
        media={media}
      />,
    );
    expect(container.firstElementChild!.className).toContain("flow-root");
    expect(container.querySelector("h2")!.className).toContain("clear-both");
    // A small photo asks for a small file.
    expect(container.querySelector("img")!.getAttribute("sizes")).toContain("33vw");
  });
});
