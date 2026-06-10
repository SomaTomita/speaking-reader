# IELTS Speaking — Part 1 Answers

Sample answers for IELTS Speaking **Part 1** (the 4-5 minute warm-up: short, personal Q&A).
One markdown file per topic, named `NN-topic.md` (e.g. `17-parks.md`).
`special-topics/` holds the same format for less common prompt sets.
`*high-score-phrases.md` is a Band 7-9 grammar/phrase cheat-sheet, not a lesson file.

## File structure (keep exactly)

```markdown
# トピック名 (Topic Name)

## Q1. <the question>

### 日本語
<Japanese answer>

### English
<English answer>

---

## Q2. <the question>
... (repeat, blocks separated by `---`)
```

Each `## Qn.` block has a `### 日本語` then a `### English` subsection. Blocks are
separated by a `---` rule. This is parsed by `reader/src/build/build-data.ts`, which
extracts **only the `### English` text** into the reader app, one Segment per question.
Do not rename or reorder these headings or the build breaks.

## Writing conventions

- **No em dashes (—) in the English answers.** Rewrite with "because", a full stop, or a
  comma instead. This is a hard rule for all sample answers here.
- Part 1 answers are **conversational and natural, 2-4 sentences** each. Avoid formal,
  rehearsed, or essay-like phrasing.
- **British spelling** (practise, prioritise, favourite, cinema, café) — the reader's audio
  is en-GB (`en-GB-SoniaNeural`).
- Keep markdown light inside `### English`: `*italic*`, `` `backticks` ``, `[links](...)`,
  and `>` blockquotes are stripped at build time and only get in the way. Separate paragraphs
  with a blank line; line breaks within a paragraph collapse to a single space.
- **Consistent first-person persona** across topics: lives in Kyoto with parents, does weight
  training and personal coding projects, is preparing for IELTS, played football growing up,
  has a girlfriend. Keep new answers consistent with this person.
- The `### 日本語` section is a natural Japanese version of the same answer (not a literal
  translation); it is reference only and is not consumed by the build.
