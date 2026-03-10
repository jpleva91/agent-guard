# Skill: Marketing Content Generator

Generate a weekly content calendar with ready-to-post drafts for LinkedIn, Twitter/X, and blog posts based on recent project activity, releases, and milestones. Publish the content pack as a GitHub issue for human review before posting. Designed for weekly scheduled execution.

## Prerequisites

Run `start-governance-runtime` first. All scheduled skills must operate under governance.

## Steps

### 1. Start Governance Runtime

Invoke the `start-governance-runtime` skill to ensure the AgentGuard kernel is active and intercepting all tool calls. If governance cannot be activated, STOP — do not proceed without governance.

### 2. Gather Recent Activity

Collect all project activity from the last 7 days to use as content source material.

**Merged PRs** (primary content source):

```bash
gh pr list --state merged --limit 20 --json number,title,body,mergedAt,labels,additions,deletions,headRefName
```

Filter to only PRs merged in the last 7 days.

**Closed issues**:

```bash
gh issue list --state closed --limit 30 --json number,title,body,closedAt,labels
```

Filter to only issues closed in the last 7 days.

**Recent releases**:

```bash
gh release list --limit 5 --json tagName,name,publishedAt,body,isPrerelease
```

Filter to releases published in the last 7 days. Flag these as **high-priority content** — each release gets a dedicated announcement post.

**Roadmap progress** (for narrative context):

```bash
cat ROADMAP.md
```

Parse the current phase, overall progress percentage, and any recently checked-off items.

### 3. Categorize Content Themes

Group the gathered activity into content themes. Each theme becomes a content piece:

| Theme Type | Source | Content Priority |
|---|---|---|
| **Release Announcement** | New release published | HIGH — always draft |
| **Feature Spotlight** | Merged PR with `task:feature` label or significant additions | HIGH |
| **Technical Deep Dive** | Merged PR with complex changes (>200 lines) or architectural impact | MEDIUM |
| **Milestone Update** | ROADMAP phase completion or significant progress | MEDIUM |
| **Bug Fix Roundup** | Multiple merged PRs with `task:bug-fix` label | LOW |
| **Community/OSS** | New contributors, dependency updates, security fixes | LOW |
| **Behind the Scenes** | Interesting governance events, agent swarm activity, CI improvements | LOW |

Select the **top 5 themes** by priority for the weekly content calendar. Always include release announcements if any exist.

### 4. Generate Content Calendar

Create a 5-day content calendar (Monday through Friday) assigning one theme per day:

- **Monday**: Strongest theme (release announcement or major feature) — highest engagement day
- **Tuesday**: Technical deep dive or feature spotlight
- **Wednesday**: Milestone update or behind-the-scenes
- **Thursday**: Community-focused or educational content
- **Friday**: Lighter content — roundup, tips, or forward-looking teaser

If fewer than 5 themes were identified, consolidate to fewer days and note which days to skip.

### 5. Draft LinkedIn Posts

For each calendar slot, draft a LinkedIn post following this structure:

**Format guidelines:**
- **Hook line**: First line must grab attention (question, bold statement, or surprising metric). This line appears before the "see more" fold — it must compel the click.
- **Body**: 3-5 short paragraphs. Use line breaks liberally. LinkedIn rewards readability.
- **Specifics**: Include concrete numbers (lines of code, PRs merged, issues closed, test counts). Avoid vague claims.
- **Narrative**: Frame technical work in terms of the problem it solves, not the implementation details. Speak to the "why."
- **CTA**: End with a question or call-to-action (try the tool, star the repo, share thoughts).
- **Hashtags**: 3-5 relevant hashtags at the end. Always include `#OpenSource` and `#DevTools`. Add topic-specific tags.
- **Length**: 800-1300 characters (LinkedIn sweet spot for engagement).
- **Tone**: Conversational but knowledgeable. First person. Enthusiastic without being salesy. Share the builder's perspective.

**For release announcements specifically:**
- Lead with the version number and the single most impactful change
- Include a "what's new" bullet list (max 5 items)
- Link to the release/changelog
- Frame it as a milestone in the larger vision

### 6. Draft Twitter/X Posts

For each calendar slot, draft a Twitter/X post (thread if needed):

**Format guidelines:**
- **Single tweet**: 280 characters max. Punchy, direct, one key point.
- **Thread (for releases or features)**: 3-5 tweets max. First tweet must stand alone. Number tweets (1/N format).
- **Visuals**: Note where a screenshot, diagram, or code snippet would add value (mark as `[IMAGE: description]`).
- **Tone**: More casual than LinkedIn. Technical audience. Can use dev humor.
- **Hashtags**: 1-2 max on Twitter. `#opensource` plus one topic tag.

### 7. Draft Blog Post Outlines

For the **top 2 themes** of the week, create a blog post outline:

**Outline structure:**
- **Title**: SEO-friendly, specific (not generic)
- **Subtitle**: One-sentence hook
- **Target audience**: Who should read this
- **Sections** (3-5): Section title + 2-3 bullet points of what to cover
- **Key code examples**: Note which code snippets or configurations to showcase
- **Estimated length**: Word count target (800-1500 words)

These are outlines only — not full blog posts. They give the human author a head start.

### 8. Check for Previous Content Pack

Look for existing content pack issues:

```bash
gh issue list --state open --label "source:marketing-agent" --json number --jq '.[0].number'
```

If a previous content pack exists, close it with a forward reference:

```bash
gh issue close <PREV_NUMBER> --comment "Superseded by new weekly content pack."
```

### 9. Publish Content Pack Issue

Ensure the label exists:

```bash
gh label create "source:marketing-agent" --color "FFA500" --description "Auto-created by Marketing Content Agent" 2>/dev/null || true
```

Create the content pack issue:

```bash
gh issue create \
  --title "Weekly Content Pack — $(date +%Y-%m-%d)" \
  --body "<content pack markdown>" \
  --label "source:marketing-agent" --label "status:pending"
```

**Issue body structure:**

```markdown
## Weekly Content Pack

**Generated**: <timestamp UTC>
**Period**: <7-day date range>
**Activity summary**: <N PRs merged, N issues closed, N releases>

---

## Content Calendar

| Day | Theme | Platform Focus |
|---|---|---|
| Monday | ... | LinkedIn + Twitter |
| Tuesday | ... | LinkedIn |
| ... | ... | ... |

---

## LinkedIn Posts

### Monday — <Theme Title>

<full draft post text>

---

### Tuesday — <Theme Title>

<full draft post text>

---

(repeat for each day)

---

## Twitter/X Posts

### Monday — <Theme Title>

<draft tweet or thread>

---

(repeat for each day)

---

## Blog Post Outlines

### 1. <Blog Title>

<outline>

### 2. <Blog Title>

<outline>

---

## Source Material

<bulleted list of PR numbers, issue numbers, and release tags used as source>

---

*Generated by marketing-content-agent on <timestamp>*
```

### 10. Summary

Report:
- **Activity scanned**: N PRs merged, N issues closed, N releases
- **Themes identified**: N (list theme types)
- **Content calendar days filled**: N/5
- **LinkedIn posts drafted**: N
- **Twitter/X posts drafted**: N
- **Blog outlines created**: N
- **Content pack issue created**: #N
- **Previous pack closed**: #N (or "none")

## Rules

- Create a maximum of **1 content pack issue per run**
- **Never post content to any external platform** — this skill only creates GitHub issue drafts for human review
- **Never close issues** — only close previous content pack issues labeled `source:marketing-agent`
- **Never modify other issues** — this skill is create-only for its own content pack
- **Never fabricate metrics** — only use real numbers from the GitHub data gathered in Step 2
- **Never invent features or capabilities** — only describe what was actually merged or released
- If no significant activity occurred in the last 7 days, create a minimal content pack noting the quiet week and suggest evergreen content topics instead
- If `gh` CLI is not authenticated, report the error and STOP
- Release announcements always take priority — if a release was published, it must appear in the calendar
- Blog outlines are suggestions only — keep them concise (not full drafts)
- Hashtag recommendations should be relevant to the actual content, not generic padding
- All content should be written from the perspective of the project maintainer/builder
- Content should be authentic and technical — avoid marketing buzzwords and hype language
