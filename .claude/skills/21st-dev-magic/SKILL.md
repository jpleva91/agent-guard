---
name: 21st-dev-magic
description: "Generate UI components using 21st.dev Magic MCP. Actions: create component, generate UI, build interface, design element, make button, create card, build navbar, generate form, create modal, design layout, create hero section, build sidebar, generate table, create dashboard widget. Triggers on requests for polished UI components when 21st.dev Magic MCP tools are available."
---

# 21st.dev Magic - AI Component Generation

Use the 21st.dev Magic MCP server to generate production-quality UI components from natural language descriptions.

## When to Apply

Use this skill when:
- User asks to create or generate a UI component
- User wants a polished, modern component quickly
- User references 21st.dev or "magic" component generation
- The 21st.dev Magic MCP tools are available in the current session

## Workflow

### Step 1: Understand the Request

Extract from the user's request:
- **Component type**: button, card, navbar, modal, form, hero, sidebar, table, etc.
- **Style preferences**: dark mode, glassmorphism, minimal, colorful, etc.
- **Framework**: React, Next.js, Vue, Svelte, or vanilla HTML
- **Content/context**: what the component is for (e.g., pricing card for SaaS)

### Step 2: Use Magic MCP Tools

Call the 21st.dev Magic MCP tools to generate the component. Provide a detailed natural language description including:
- Component type and purpose
- Visual style and theme
- Color scheme preferences
- Responsive requirements
- Accessibility needs
- Any specific interactions (hover states, animations)

### Step 3: Integrate the Output

After receiving the generated component:
1. Review the code for quality and completeness
2. Adapt it to fit the project's existing tech stack and conventions
3. Ensure it matches the project's color scheme and design language
4. Add any missing accessibility attributes
5. Test responsiveness

## Tips for Better Results

- **Be specific**: "A glassmorphic pricing card with 3 tiers, dark theme, purple accent" beats "a pricing card"
- **Mention interactions**: "with hover lift effect and smooth transitions"
- **Specify framework**: "React component using Tailwind CSS"
- **Include context**: "for a developer tools SaaS product"
- **Reference existing design**: "matching the existing navbar style"

## Integration with UI/UX Pro Max

When both this skill and UI/UX Pro Max are available:
1. Use UI/UX Pro Max first to generate a design system (colors, typography, style)
2. Then use 21st.dev Magic to generate components that follow that design system
3. Pass the design system details (colors, fonts, style) into the Magic prompt for consistency
