// ============================================================
// EDITOR — the forms a piece can take
// ------------------------------------------------------------
// A template is the skeleton of a Statevera piece: the sections
// it is expected to have, in the order the house writes them.
// The writer picks one, then types over it.
//
// Bodies are markdown in the vocabulary the canvas understands,
// so markdownToHtml turns them straight into editable blocks.
// ============================================================

export interface Template {
  id: string;
  name: string;
  /** One line on the page: what this form is for. */
  blurb: string;
  /** Roughly how long the finished piece runs. */
  length: string;
  /** Frontmatter type, which decides how the piece is labelled on the site. */
  type: "analysis" | "news" | "opinion" | "explainer";
  /** Preselected desk, where the form implies one. */
  category?: string;
  /** Placeholder standfirst, shown as a prompt rather than saved. */
  standfirst: string;
  body: string;
}

export const TEMPLATES: Template[] = [
  {
    id: "analysis",
    name: "Analysis",
    blurb: "The house piece. A claim about how something works, argued through in sections.",
    length: "1,200–1,800 words",
    type: "analysis",
    standfirst: "One line on what this argues, and why now",
    body: `Open on the thing that happened, in two or three sentences. No throat-clearing, no scene-setting: the reader should know by the end of this paragraph what the piece is about and why it is being written this week.

State the argument plainly in the second paragraph. This is the sentence the piece exists to defend.

<KeyTakeaways>
- The first thing a reader should carry away
- The second
- The third
</KeyTakeaways>

## What changed

The facts, in order, with dates. This section carries the reporting: who did what, when, and what is different from a month ago. Attribute anything contested.

## Why it happened

The causes, ranked. Distinguish what is structural from what is contingent — the reader wants to know which parts would have happened anyway.

## What it means

The argument proper. This is where the piece earns its place: read the evidence above against the way the system usually behaves, and say where it is breaking.

> A line worth pulling out, if the piece has one.

## What to watch

Two or three concrete, checkable things. Name the date, the meeting, the number or the vote that would confirm or refute the argument above.
`,
  },
  {
    id: "news",
    name: "News report",
    blurb: "Something happened. Straight reporting, hardest fact first, no argument.",
    length: "500–900 words",
    type: "news",
    category: "Politics",
    standfirst: "The second most important fact, in one line",
    body: `The most important fact, in one sentence. Who, what, where, when. If the reader stops here they should still have the story.

The second paragraph adds the detail the first had to leave out: the scale, the timing, the immediate consequence.

## The detail

What is actually in the decision, the document or the announcement. Numbers with their units. Dates with their years.

## The context

What this follows. One paragraph of history, no more — enough for a reader who has not been watching to place it.

<WhyItMatters>
Two or three sentences on the consequence. Reported, not argued: what changes for whom, on what timetable.
</WhyItMatters>

## What happens next

The next fixed point in the calendar, and what would count as a surprise.
`,
  },
  {
    id: "opinion",
    name: "Opinion",
    blurb: "A signed argument. First person allowed, and the conclusion is the point.",
    length: "800–1,200 words",
    type: "opinion",
    standfirst: "The argument, compressed to one line",
    body: `Open with the claim. An opinion piece that buries its argument has wasted its first paragraph.

Then the reason the claim is worth making now — the decision, the vote or the drift that makes it urgent rather than merely true.

## The case

The strongest version of the argument, in evidence rather than adjectives. Each paragraph should be a step the reader can refuse.

## The objection

State the best counter-argument in its own words, without weakening it. Then answer it. A piece that skips this reads as advocacy.

## What follows

What should be done, or what should be expected. Be specific enough to be wrong.
`,
  },
  {
    id: "briefing",
    name: "Briefing",
    blurb: "A fast read on a moving story: numbered points, no argument, no scene-setting.",
    length: "400–700 words",
    type: "analysis",
    standfirst: "What a reader needs to know this morning, in one line",
    body: `One paragraph on the state of play. Written for a reader who has been away a week.

## 1. The first point

Two or three sentences. One idea per point, the sharpest first.

## 2. The second point

Two or three sentences.

## 3. The third point

Two or three sentences.

<TheBigPicture>
Where this sits in the longer story: the trend the week's news is a data point in.
</TheBigPicture>

## The diary

- The date, and what happens on it
- The next one
`,
  },
  {
    id: "interview",
    name: "Interview",
    blurb: "A conversation, edited for length and clarity, with the questions kept in.",
    length: "1,000–1,600 words",
    type: "analysis",
    standfirst: "Who this is, and why the conversation is worth reading",
    body: `Introduce the person in two paragraphs: what they have done, what they are in a position to know, and why the conversation happened now. Say where and when it took place.

*The conversation has been edited for length and clarity.*

---

**Where does this leave the question the reader came for?**

The answer, in their words. Long answers can be broken into paragraphs; do not paraphrase inside quotation marks.

**The follow-up, which should press rather than change the subject.**

The answer.

**A question about the thing they would rather not discuss.**

The answer.

## Afterwards

A short closing note in the writer's own voice: what the answers did and did not settle.
`,
  },
  {
    id: "theory",
    name: "Theory essay",
    blurb: "A concept explained and then tested against a case. The Theory desk's form.",
    length: "1,500–2,500 words",
    type: "analysis",
    category: "Theory",
    standfirst: "The idea, and what it is good for",
    body: `Start with the puzzle the theory was invented to solve. A reader who does not already know the term should still understand the question.

## The idea

Define it once, carefully, and stay with that definition for the rest of the piece. Name the thinkers who built it and the argument they were having.

## How it is meant to work

The mechanism, step by step. What the theory predicts, and what would count as evidence against it.

<TheBigPicture>
Where this sits among the other explanations on offer, and what it is competing with.
</TheBigPicture>

## The case

One worked example at length, rather than four in passing. Show the theory doing its work, including where it strains.

## Where it fails

The known objections and the cases the theory handles badly. An essay that only defends its subject is a brochure.

## What it is still good for

The honest residue: the part of the idea that survives the objections, and what it explains that nothing else does.
`,
  },
];

export const templateById = (id: string): Template | undefined =>
  TEMPLATES.find((t) => t.id === id);
