# Project
Vite + React + TypeScript skills test. Two parts:
- Part A: src/part-a/SubscriptionCard.tsx (uses mock API in src/api/)
- Part B: src/part-b/BuyBox.tsx (match public/reference/buy-box.png)

# Rules
- TypeScript strict, no `any`. Functional components + hooks.
- Mobile-first (375px) for Part A.
- Do not add dependencies without asking me first.
- Do not modify src/api/ or fixtures.
- Keep components small; colocate types.
- Accessible: semantic HTML, labels, focus management in dialogs.

# Commands
- Dev: npm run dev
- Typecheck: npx tsc --noEmit
- Build: npm run build

# Working style
- Show a plan before large changes. Keep responses short; no recap of the diff.
- Never make product, UX, copy, or architecture decisions on your own. If the spec is ambiguous, stop and ask me. Offer 2–3 options with trade-offs, and say which one you'd pick and why.
- Always ask before: adding a dependency, changing the folder structure, touching src/api/ or fixtures, or changing behavior I already approved.
- For small implementation details (naming, internal helpers, styling values I haven't specified), decide yourself but list your assumptions at the end of your response in one short line each.
- Batch your questions: ask everything you need at once, not one per message.