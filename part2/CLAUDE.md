# IELTS Speaking — Part 2 Answers

Sample answers for IELTS Speaking **Part 2** (the cue-card "long turn": a ~2 minute
monologue on a single topic). One markdown file per cue card, named `NN-topic-keyword.md`
(e.g. `08-historical-figure-shibusawa.md`).

## File structure (keep exactly)

```markdown
# トピック名

## 日本語
<Japanese version, one or more paragraphs>

## English
<English answer, one or more paragraphs>
```

Note these are **top-level `## ` (h2) sections**, and there is exactly **one** answer per file
(unlike Part 1, which has multiple `## Qn.` / `### English` blocks). `reader/src/build/build-data.ts`
extracts the single `## English` section as one Segment. Do not rename these headings or the
build breaks.

## Writing conventions

- **No em dashes (—) in the English answer.** Rewrite with "because", a full stop, or a comma
  instead. This is a hard rule for all sample answers here.
- Part 2 is a **developed long turn**: several paragraphs covering the cue-card points, longer
  and more structured than a Part 1 answer, but still natural spoken English (not an essay).
- **British spelling** (practise, prioritise, favourite, cinema, café) — the reader's audio is
  en-GB (`en-GB-SoniaNeural`).
- Keep markdown light inside `## English`: `*italic*`, `` `backticks` ``, `[links](...)`, and
  `>` blockquotes are stripped at build time. Separate paragraphs with a blank line; line breaks
  within a paragraph collapse to a single space.
- **Consistent first-person persona** across topics: lives in Kyoto with parents, does weight
  training and personal coding projects, is preparing for IELTS, played football growing up,
  has a girlfriend. Keep new answers consistent with this person.
- The `## 日本語` section is a natural Japanese version of the same answer (reference only, not
  consumed by the build).
