// Attribution for lead images, keyed by filename without the extension, exactly
// as it appears in a piece's frontmatter. Add an entry when a picture needs a
// credit line; pictures without one simply render no credit.

export const imageCredits: Record<
  string,
  { label: string; credit: string; license: string; source: string }
> = {};

export const creditFor = (image: string) => {
  const key = image
    .replace(/^\//, "")
    .replace(/\.(jpg|jpeg|png|webp)$/i, "")
    .split("/")
    .pop();
  return imageCredits[key ?? ""];
};
