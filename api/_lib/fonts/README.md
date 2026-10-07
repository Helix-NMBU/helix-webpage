# CV fonts

Noto Sans Regular and Bold are redistributed unmodified under the SIL Open Font License 1.1. See [OFL.txt](OFL.txt) for the complete license and copyright notice.

Source: the official [Noto font repository](https://github.com/notofonts/noto-fonts/tree/main/hinted/ttf/NotoSans). Files downloaded on 2026-10-06:

- https://raw.githubusercontent.com/notofonts/noto-fonts/main/hinted/ttf/NotoSans/NotoSans-Regular.ttf
- https://raw.githubusercontent.com/notofonts/noto-fonts/main/hinted/ttf/NotoSans/NotoSans-Bold.ttf
- https://raw.githubusercontent.com/notofonts/noto-fonts/main/LICENSE

The renderer embeds subsets of these fonts into each generated PDF. Norwegian characters, Latin diacritics, Greek and Cyrillic are supported. Characters outside the font's coverage return an explicit error instead of disappearing or rendering as missing glyphs. The template does not yet provide fonts for every writing system or emoji.

The renderer uses the Node filesystem. Vercel must include `api/_lib/fonts/*.ttf` in the `/api/member-cv` function through `functions["api/member-cv.ts"].includeFiles`. The project root is the runtime working directory. Font files are private server assets, not browser downloads.

## Template fonts

The supplied reference uses Lexend Light/Medium and navy #00007a. HelixCV-Light/Medium/Bold.ttf are static weight 300/500/700 derivatives of the official Lexend variable font. The derivative family is renamed Helix CV Sans to avoid reserved font names. Copyright and OFL 1.1 are retained in Lexend-OFL.txt. Created with FontTools 4.60.2 varLib.instancer; no project dependency added. Original font downloaded 2026-10-07 from https://raw.githubusercontent.com/google/fonts/main/ofl/lexend/Lexend%5Bwght%5D.ttf, license https://raw.githubusercontent.com/google/fonts/main/ofl/lexend/OFL.txt. The same font files may be emitted as browser assets for the fictional preview. Existing Noto Sans provides fallback glyphs for previously supported Greek/Cyrillic text in PDFs.
