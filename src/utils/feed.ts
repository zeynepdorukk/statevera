// The picture a feed reader shows beside a piece. The 1200×630 preview crop the
// build writes for link cards, not the original upload (some are over 1 MB),
// and with its size declared so readers can lay it out before it arrives.
import { absoluteUrl, heroImageOf } from "./collection";
import { responsiveImage } from "./images";

const escapeAttr = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

export async function feedImageTag(heroImage: string, alt = ""): Promise<string> {
  const picture = await responsiveImage(heroImage);
  const url = absoluteUrl(picture.og?.src ?? heroImageOf(heroImage));
  const size = picture.og ? ` width="${picture.og.width}" height="${picture.og.height}" type="image/jpeg"` : "";
  const description = alt ? `<media:description type="plain"><![CDATA[${alt.replace(/]]>/g, "]] >")}]]></media:description>` : "";
  return `<media:content url="${escapeAttr(url)}" medium="image"${size}>${description}</media:content>`;
}
