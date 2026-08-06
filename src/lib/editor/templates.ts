// ============================================================
// EDITOR — the forms a piece can take
// ------------------------------------------------------------
// A template is the skeleton of a Statevera piece: the sections
// it is expected to have, in the order the house writes them.
// The writer picks one, then types over it.
//
// `body` is the blank form the writer types into.
// `sample` is a finished fake piece used only by Preview, so the
// design can be judged with real words and a lead photograph.
// Bodies are markdown in the vocabulary the canvas understands,
// so markdownToHtml turns them straight into editable blocks.
// ============================================================

export interface TemplateSample {
  headline: string;
  standfirst: string;
  desk: string;
  minutes: number;
  /** Path under public/, e.g. /images/previews/analysis-nato.jpg */
  image: string;
  imageAlt: string;
  imageCredit: string;
  /** Finished markdown used only in the Preview modal. */
  body: string;
}

export interface Template {
  id: string;
  name: string;
  /** One line on the page: what this form is for. */
  blurb: string;
  /** Roughly how long the finished piece runs. */
  length: string;
  /** Frontmatter type, which decides how the piece is labelled on the site. */
  type: "analysis" | "news" | "opinion";
  /** Preselected desk, where the form implies one. */
  category?: string;
  /** The run of the piece, for the card. Not every form marks its parts with headings. */
  shape: string[];
  /** Placeholder standfirst, shown as a prompt rather than saved. */
  standfirst: string;
  /** Invented finished piece, used only to make the preview read like the site. */
  sample: TemplateSample;
  body: string;
}

export const TEMPLATES: Template[] = [
  {
    id: "analysis",
    name: "Analysis",
    blurb: "The house piece. A claim about how something works, argued through in sections.",
    length: "1,200–1,800 words",
    type: "analysis",
    shape: ["Opening", "Key takeaways", "What changed", "Why it happened", "What it means", "What to watch"],
    standfirst: "One line on what this argues, and why now",
    sample: {
      headline: "NATO is relearning deterrence, and paying for the lesson late",
      standfirst:
        "Three summits of promises have produced real money and no doctrine. The gap is where the next crisis will happen.",
      desk: "Security",
      minutes: 8,
      image: "/images/previews/analysis-nato.jpg",
      imageAlt: "NATO headquarters in Brussels",
      imageCredit: "Romaine / Wikimedia Commons",
      body: `For thirty years after the Cold War, NATO treated deterrence as a solved problem. The alliance still wrote the word into communiqués, still flew aircraft over the Baltic, still kept a nuclear sharing arrangement that nobody wanted to explain in public. What it stopped doing was the harder work: deciding what it was prepared to risk, and against whom.

That habit is now expensive. Russia’s war on Ukraine forced capitals to rearm on a timetable they had spent a generation avoiding. The money is arriving. The doctrine is not.

<KeyTakeaways>
- Allied defence spending is rising faster than the plans that are meant to absorb it.
- Deterrence has been treated as a budget line, not a theory of how the other side decides.
- The next crisis will test political will before it tests stockpiles.
</KeyTakeaways>

## What changed

Since 2022, every major NATO member has rewritten its force goals at least once. Germany’s special fund, Poland’s hard push past 4% of GDP, the Nordic accessions — these are not symbolic. Stocks of artillery shells, air defence interceptors and long-range strike munitions are being rebuilt on multi-year contracts.

What has not been rewritten with the same urgency is the political theory underneath. Summit language still leans on “credibility” and “unity” without saying what either requires when a member is under pressure short of Article 5, or when the United States is distracted.

## Why it happened

Part of the lag is institutional. Alliances design themselves for the last settled threat. The post-1991 NATO was built to manage enlargement, crisis response and partnerships — not to hold a high-intensity conventional fight on its own continent.

Part of it is domestic. Defence reviews are easier to sell as procurement than as strategy. Parliaments will vote for factories before they will vote for the scenarios in which those factories matter. And part of it is American: European planning still assumes a level of U.S. enablers that Washington has never formally guaranteed in the form allies now need.

## What it means

The risk is not that NATO fails to spend. The risk is that it spends into a hollow posture: impressive inventories, unclear red lines, and a public that has been told rearmament is insurance without being told what the premium buys.

Deterrence is a claim about the other side’s mind. If Moscow, or any future adversary, believes allied resolve is softer than allied budgets, the budgets will not do the work. That is the lesson being relearned late — and at a cost that will keep rising until the political argument catches up with the industrial one.

> An alliance can buy readiness. It cannot buy a decision it has not practised making.

## What to watch

- Whether the next NATO force model names the enablers Europe must own if U.S. attention splits.
- The first serious test of ammunition co-production targets against real delivery dates, not pledges.
- How capitals talk about nuclear sharing when the subject can no longer be left in the basement of summits.
`,
    },
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
    shape: ["The news", "The detail", "The context", "Why it matters", "What happens next"],
    standfirst: "The second most important fact, in one line",
    sample: {
      headline: "EU agrees a twelfth sanctions package after two days of talks",
      standfirst: "The measures cover shipping insurance and take effect in January.",
      desk: "Politics",
      minutes: 4,
      image: "/images/previews/news-eu.jpg",
      imageAlt: "Hemicycle of the European Parliament in Strasbourg",
      imageCredit: "inyucho / Wikimedia Commons",
      body: `European Union ambassadors approved a twelfth package of sanctions against Russia on Tuesday evening, ending two days of stalled talks in Brussels over shipping insurance and the scope of a new price mechanism for oil products.

The package takes effect in January. Diplomats said the hardest clause — a ban on EU companies insuring vessels that carry Russian crude above a revised price cap — survived after Germany and Greece dropped a demand for a longer phase-in.

## The detail

Under the agreed text, EU insurers and reinsurers will be barred from covering tankers that load Russian oil sold above the new cap. The package also adds 48 individuals and 19 entities to the asset-freeze list, tightens export controls on dual-use machine tools, and closes a loophole that had allowed some diamond imports through third countries.

Officials declined to publish the full annexes until member states complete a legal scrub, expected within 72 hours. Two diplomats said the shipping clause was rewritten three times on Tuesday to satisfy coastal states worried about a sudden exit of Western insurers from the market.

## The context

Brussels has layered sanctions since February 2022. Earlier packages hit finance, technology and seaborne crude; enforcement has been uneven, and a shadow fleet of older tankers has grown outside Western cover. The twelfth round was originally due last month and slipped after capitals disagreed on whether insurance rules should lead or follow a G7 decision.

<WhyItMatters>
Insurers are one of the few chokepoints still largely inside EU and UK jurisdiction. If the January start date holds, the cost of moving Russian barrels on non-compliant ships should rise quickly — unless alternative cover from other jurisdictions fills the gap first.
</WhyItMatters>

## What happens next

National measures implementing the package are due before the Christmas break. Trade ministers meet again in early January; any sign that the insurance ban is being soft-applied in Mediterranean ports will be the first test of whether the twelfth round bites.
`,
    },
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
    shape: ["The claim", "The case", "The objection", "What follows"],
    standfirst: "The argument, compressed to one line",
    sample: {
      headline: "Europe should stop pretending the American guarantee is permanent",
      standfirst: "Planning for the alliance you have is not disloyalty. It is the only serious response left.",
      desk: "Opinion",
      minutes: 6,
      image: "/images/previews/opinion-europe.jpg",
      imageAlt: "European capital streetscape at dusk",
      imageCredit: "Unsplash",
      body: `Europe has spent a decade talking about strategic autonomy as if it were a slogan for speeches. It is not. It is a planning assumption — and the assumption that the American security guarantee will look the same in ten years as it did in 2015 is no longer a serious one.

I am not arguing that the United States is about to abandon NATO tomorrow. I am arguing that European governments are still writing force plans, industrial strategies and public expectations as if Washington’s attention, budget and politics were a fixed external condition. They are not.

## The case

Look at what allies actually depend on the United States for: intelligence fusion, long-range strike, air-to-air refuelling, missile defence architecture, and the political act of treating an attack on one as an attack on all. European rearmament has made progress on stocks and platforms. It has barely begun on the enablers that make a coalition fight coherent.

American politics does not need to produce a clean break to change European security. A slower drawdown of attention, a higher price for U.S. munitions, or a president who treats Article 5 as a negotiation rather than a fact would be enough. Any of those is more plausible than the quiet permanence European budgets still price in.

If that is true, then every year spent waiting for the old equilibrium to return is a year spent transferring risk onto the publics who will discover the gap only when it matters.

## The objection

The strongest reply is that loud European hedging could itself weaken the guarantee — that talking about life after America becomes a self-fulfilling prophecy, and that the rational course is to bind Washington closer with purchases, basing and political loyalty.

There is something in that. Alliances are partly theatre. But theatre is not a substitute for capacity. A Europe that cannot move forces, refill magazines or contest the first week of a fight without American scaffolding is not being loyal. It is being dependent, and calling the dependency strategy.

## What follows

Stop treating “burden sharing” as a percentage of GDP and start treating it as a list of tasks Europe must be able to perform if the United States is late, limited or absent. Fund the dull enablers. Write the scenarios out loud. Tell voters the truth about timelines.

Planning for the alliance you have — not the one you remember — is not disloyalty. It is the minimum required of governments that claim to take security seriously.
`,
    },
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
    shape: ["State of play", "Three points", "The big picture", "The diary"],
    standfirst: "What a reader needs to know this morning, in one line",
    sample: {
      headline: "The Red Sea, in three points",
      standfirst: "Insurance, rerouting and one naval decision that has not been taken yet.",
      desk: "Economy",
      minutes: 3,
      image: "/images/previews/briefing-red-sea.jpg",
      imageAlt: "Container ship on open water",
      imageCredit: "Unsplash",
      body: `Attacks on commercial shipping have pushed a growing share of Asia–Europe container traffic around the Cape of Good Hope. Transit times are up, insurance language is tightening, and navies are present without a shared mandate that shipowners fully trust.

## 1. The first point

Major carriers have normalised the long route for a non-trivial share of schedules. That is no longer a temporary diversion; it is a capacity decision that shows up in blank sailings, bunker burn and delayed empties returning to Asia.

## 2. The second point

War-risk premiums and contractual clauses now matter as much as the physical threat. Even when a corridor is technically open, boards will not send ships if cover is expensive, conditional or withdrawn at short notice.

## 3. The third point

Naval deployments have multiplied faster than the rules of engagement and the political ownership of escort tasks. Shipowners are watching whether protection is predictable — not whether a task force exists on paper.

<TheBigPicture>
The Red Sea story is a logistics story wearing a security headline. Freight rates, inventory buffers and manufacturer lead times are adjusting to a longer world, and they will not snap back the week the first quiet month arrives.
</TheBigPicture>

## The diary

- Next industry schedule updates from the main East–West alliances
- Any coordinated change in war-risk insurance guidance from London markets
- The next formal review of the multinational maritime mission’s mandate
`,
    },
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
    shape: ["Who they are", "Three questions", "Afterwards"],
    standfirst: "Who this is, and why the conversation is worth reading",
    sample: {
      headline: "“We wrote the strategy for a war we did not expect”",
      standfirst: "A former planning chief on what the last decade of European defence reviews got wrong.",
      desk: "Diplomacy",
      minutes: 9,
      image: "/images/previews/interview-defence.jpg",
      imageAlt: "Formal briefing room before an interview",
      imageCredit: "Unsplash",
      body: `For eight years, Marta Keller sat inside the machinery that turns political ambition into force plans — first nationally, then in a multinational staff that few voters could name. She left government last spring. This conversation, held in Berlin in late July, is her first on the record about what those plans quietly assumed.

Keller is careful with classified detail and blunt about incentives. She is not nostalgic for the old reviews. She is angry at how long they were allowed to pretend the world had not changed.

*The conversation has been edited for length and clarity.*

---

**Where does this leave European defence planning after Ukraine?**

“We wrote elegant strategies for a war of choice, expeditionary and limited. What we got was a war of mass, attrition and industrial tempo on our own continent. The documents were not stupid. They were complete for a different problem. That is worse, in a way, because it lets people feel rigorous while missing the point.”

**The follow-up, which should press rather than change the subject.**

“So was the failure intelligence, or politics?”

“Both, but politics wore the trousers. Plenty of analysts flagged stockpile depth and ammunition. The system rewarded plans that fit budget envelopes and alliance choreography. Nobody got promoted for saying: your shiny medium-term review collapses in week three of high intensity. We measured what was comfortable to measure.”

**A question about the thing they would rather not discuss.**

“Allied capitals still talk as if American enablers are weather — always there. Did you believe that inside the building?”

“We planned as if they were highly likely, which is not the same as weather. Likelihood is not a logistics chain. The honest version is: Europe under-owned the boring things that make a coalition fight — tankers, magazines, integrated air defence, munitions co-production. Admitting that sounded like criticising the United States. So we softened it into ‘interoperability.’ Words did a lot of unearned work.”

## Afterwards

Keller will not sketch a full alternative force model on the record. What she will say is simpler, and harder to dismiss: the next review should be scored against a bad week, not a tidy decade. If a plan only works when every assumption holds, it is not a plan. It is a hope with annexes.
`,
    },
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
    shape: ["The puzzle", "The idea", "How it works", "The case", "Where it fails", "What survives"],
    standfirst: "The idea, and what it is good for",
    sample: {
      headline: "Balance of power: the oldest idea in the field, and its worst habit",
      standfirst: "It explains a great deal about the nineteenth century and rather less about this one.",
      desk: "Theory",
      minutes: 12,
      image: "/images/previews/theory-balance.jpg",
      imageAlt: "The Congress of Vienna, 1815",
      imageCredit: "Jean-Baptiste Isabey / Wikimedia Commons",
      body: `International relations has a small set of ideas it cannot stop reusing. Balance of power is the most durable of them. It promises a simple answer to a hard question: why do states sometimes combine against a rising force instead of bandwagoning with it? The trouble begins when the phrase is asked to do work it was never built for.

## The idea

In its classical form, balance of power is a claim about equilibrium. When one state threatens to dominate, others align to check it. The mechanism can be automatic — fear producing counterweight — or managed, as in the concert diplomacy that followed 1815. The unit of analysis is the great power; the currency is relative capability; the nightmare is hegemony.

That definition is already a choice. It privileges military and territorial power, treats smaller states as terrain, and assumes a system closed enough that alignments are the main variable. Much of modern politics violates at least one of those assumptions.

## How it is meant to work

The theory predicts that significant power shifts trigger external balancing: alliances, arms build-ups, and diplomatic containment. Internal balancing — reforming the state to extract more power — is the domestic twin. Evidence for the theory is a counter-coalition that forms before domination is complete. Evidence against it is prolonged bandwagoning, successful unopposed hegemony, or a system in which the decisive capabilities are not the ones balancers can easily pool.

<TheBigPicture>
Balance of power sits beside hegemony theories, democratic peace arguments and economic interdependence stories. It is strongest where military threat is clear and alignment is possible. It is weakest where the “power” that matters is financial, technological or networked across borders that armies do not control.
</TheBigPicture>

## The case

Nineteenth-century Europe is the theory’s home pitch. The coalitions against Napoleonic France, the Vienna settlement, and the shifting alignments before 1914 can all be told as balancing stories — imperfect, delayed, sometimes tragic, but recognisable. Statesmen talked in the theory’s language because the system rewarded it: multipolar, territorially obsessed, and run by elites who could move armies without mass publics vetoing every step.

Stretch the same frame over the present and it starts to tear. Nuclear weapons change the cost of direct great-power war. Economic networks punish pure military logic. Non-state and transnational actors scramble the cast list. A “balance” measured in brigades can coexist with deep imbalance in semiconductors, payment systems or information infrastructure. Policymakers still reach for the old vocabulary because it is legible. Legibility is not the same as fit.

## Where it fails

The theory’s worst habit is nostalgia dressed as realism: treating every rivalry as a rerun of cabinet diplomacy. It under-explains cases where states do not balance, over-explains cases where they do for other reasons, and quietly imports a European great-power template into regions organised differently. It also struggles with hierarchy inside alliances — the fact that “balancing with” a patron is not the same politics as balancing among equals.

## What it is still good for

What survives is narrower and more useful. Balance of power remains a sharp question to ask, not a complete map: who would bear the cost of stopping whom, with what tools, and on what timeline? Used that way, it disciplines wishful thinking. Used as a master key to the twenty-first century, it mostly unlocks the nineteenth.
`,
    },
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
