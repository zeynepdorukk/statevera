export interface LiveChannel {
  id: string;
  name: string;
  shortName: string;
  channelId: string;
  url: string;
}

export const liveChannels: LiveChannel[] = [
  {
    id: "france24",
    name: "France 24 English",
    shortName: "France 24",
    channelId: "UCQfwfsi5VrQ8yKZ-UWmAEFg",
    url: "https://www.youtube.com/@FRANCE24English/live",
  },
  {
    id: "dw",
    name: "DW News",
    shortName: "DW",
    channelId: "UCknLrEdhRCp1aegoMqRaCZg",
    url: "https://www.youtube.com/@dwnews/live",
  },
  {
    id: "aljazeera",
    name: "Al Jazeera English",
    shortName: "Al Jazeera",
    channelId: "UCNye-wNBqNL5ZzHSJj3l8Bg",
    url: "https://www.youtube.com/@AlJazeeraEnglish/live",
  },
];

export const liveEmbedUrl = (channelId: string): string =>
  `https://www.youtube-nocookie.com/embed/live_stream?channel=${channelId}&autoplay=0&rel=0&modestbranding=1`;
