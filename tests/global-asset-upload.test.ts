import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { GlobalAssetUpload } from "../src/components/GlobalAssetUpload";

describe("GlobalAssetUpload", () => {
  it("mounts a stable asset-upload input and exposes openFilePicker", () => {
    const onUpload = vi.fn();
    let opened = false;
    const markup = renderToStaticMarkup(
      createElement(GlobalAssetUpload, {
        onUpload,
        children: ({ openFilePicker }) => {
          opened = typeof openFilePicker === "function";
          return createElement("button", { type: "button", onClick: openFilePicker }, "上传");
        },
      }),
    );

    expect(opened).toBe(true);
    expect(markup).toContain('data-testid="asset-upload"');
    expect(markup).toContain('type="file"');
    expect(markup).toContain("上传");
  });

  it("disables the hidden input when upload is locked", () => {
    const markup = renderToStaticMarkup(
      createElement(GlobalAssetUpload, {
        disabled: true,
        onUpload: async () => undefined,
        children: () => null,
      }),
    );
    expect(markup).toContain("disabled");
  });
});
