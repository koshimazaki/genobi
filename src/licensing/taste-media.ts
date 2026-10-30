/** Upstream README/gallery media, displayed remotely with source credit. */
export const tasteMedia: Record<
  string,
  { src: string; alt: string; credit: string }
> = {
  "claude-animation-base": {
    src: "https://raw.githubusercontent.com/JohnHeibel/ClaudeAnimationBase/main/docs/emotions.webp",
    alt: "Clawd character emotion sheet animated by Claude Animation Base",
    credit: "Upstream animated character sheet · John Heibel",
  },
  "three-plotter-renderer": {
    src: "https://raw.githubusercontent.com/neurofuzzy/three-plotter-renderer/develop/examples/output/complex.svg",
    alt: "Three Plotter Renderer example SVG with visible edges and hatching",
    credit: "Upstream SVG output · Geoff Gaudreault",
  },
  hermes: {
    src: "https://raw.githubusercontent.com/NousResearch/hermes-agent/main/assets/banner.png",
    alt: "Hermes Agent project banner",
    credit: "Project artwork · Nous Research / Hermes Agent",
  },
  claudia: {
    src: "https://claudia.gallery/img/ev-17-merge/tag-to-lens-1.m.webp",
    alt: "Claudia character reference from Escape Velocity",
    credit: "Character reference · Claudia.gallery / anabology",
  },
  motion2code: {
    src: "https://raw.githubusercontent.com/lovisdotio/motion2code/main/gallery/think-big/poster.gif",
    alt: "Motion2Code Think Big kinetic typography example",
    credit: "Upstream animation preview · Lovis Odin / motion2code",
  },
};
