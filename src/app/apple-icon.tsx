import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** Home-screen icon: the tab icon on a full-bleed background (iOS rounds the corners itself). */
export default async function AppleIcon() {
  const svg = await readFile(path.join(process.cwd(), "src/app/icon.svg"), "utf8");
  const src = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#3A4BD6" }}>
        <img src={src} width={180} height={180} alt="" />
      </div>
    ),
    size,
  );
}
