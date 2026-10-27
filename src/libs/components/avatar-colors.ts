const avatarColors = [
  "#FFFFFF",
  "#FA2942",
  "#FF5B0A",
  "#F6A000",
  "#0DBE78",
  "#14B5A5",
  "#1688F5",
  "#8B55F7",
  "#EF2B90",
  "#7D7D7D",
] as const;

/** Stable pseudo-random colors keep each person's initials recognizable across pages. */
export function avatarFallbackStyle(key: string) {
  let hash = 2166136261;
  for (const character of key.trim().toLowerCase()) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  const color = avatarColors[(hash >>> 0) % avatarColors.length];
  const hex = color.slice(1);
  const luminance = [0, 2, 4]
    .map((offset) => {
      const channel = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
      return channel <= 0.04045
        ? channel / 12.92
        : ((channel + 0.055) / 1.055) ** 2.4;
    })
    .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);

  return {
    backgroundColor: color,
    color: luminance > 0.179 ? "#171717" : "#FFFFFF",
  };
}
