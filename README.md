# Natura Wellness frontend test

Natura Wellness is a fictional brand made up for this test. The full brief is in `INSTRUCTIONS.md`.

```
npm install
npm run dev
```

- **Part A:** `src/part-a/SubscriptionCard.tsx`. Open `/?part=a&fixture=active`. The mock API is in `src/api/`; switch cases with `?fixture=active|paused|cancelled|error` and force the "changed elsewhere" error with `&conflict=always`. Other products are in `catalog` in `src/api/fixtures.ts`.
- **Part B:** `src/part-b/BuyBox.tsx`. Open `/?part=b`. Match `public/reference/buy-box.png`, which is a 2x screenshot of a 1200px-wide browser window. Copy is in `src/part-b/copy.ts`; Fraunces and Inter are loaded in `index.html`.

You can add any libraries you like.

## How I worked

I used Claude Code for implementation. I also used the context7 MCP server so Claude checked current documentation and package versions instead of relying on memory. I made the product, UX, copy and architecture decisions: Claude proposed options with trade-offs, and I chose, changed or rejected them. The full sessions are in `ai-logs/`.

## Part A: product decisions

### What I prioritized

- **The right alternative at the right moment.** Customers come to this page to change something, so frequency and quantity are on the main page, and the cancel flow offers an alternative matched to the reason.
- **Exact outcomes.** Every result states what happened with real dates and amounts, including failures
- **No trapping.** "Continue to cancel" is on every step.
- **Only real numbers.** No hardcoded figures; savings are derived per shipment from the data.

### Key Decisions

- **Retention: cancel offers plus a plan editor.** I first put changes only inside the cancel flow. The review against the brief showed this forced customers who just wanted less product down the cancellation path, so I added frequency and quantity controls to the main page.
- **Offers by reason.**
    - Too much product → skip or ship less often.
    - Costs too much → lower quantity or ship less often, shown as the monthly cost, because someone who finds it expensive thinks in monthly spend, not per shipment.
    - Different product → swap.
    - No results and other → straight to confirmation.
- **No extra discount.** That's a margin decision the brief doesn't support
- **409: refetch and ask again.** The customer never skips against details they haven't seen.
- **A lock, not a debounce, against double taps.** I first asked for a debounce, but agreed the lock is what actually prevents a double skip, and a debounce doens't help with conflicts.
- **Dead ends.** After 2 failures of any kind, the message restates the unchanged charge and adds a customer care line. Requests time out after 15s so a hung call can't trap anyone.
- **Local changes survive conflicts.** After a 409, only changes whose fields actually changed on the server are dropped, and the customer is told which. My first rule dropped everything on any version change, which was too blunt.
- **Charges never move earlier than a skip.** Shortening the frequency after a skip keeps the skipped date, because an earlier surprise charge is worse than a later one.
- **Paused subscriptions resume automatically.** on the end date, and the banner says when and how much.
- **Bottom sheet on mobile, modal on desktop.**
- **Tailwind.** Tailwind. It’s what I work with day to day, and utility classes kept styling close to the components. The trade-off is a global reset, which Part B handles explicitly.
- **Copy in typed `.ts` files.**, All strings live in one place with a per-language shape `({ en: "..." })`, so adding a language or moving the copy to a CMS later means changing where the strings come from, not the components. I chose .ts over JSON because it gives compile-time checks for keys and placeholders without a generator script. A CMS would bring back JSON plus generated types.

### Left out on purpose.

- **Pause.** The paused state exists, but customers can't enter it. Part B's copy promises it, so it's first on my list
- **Add product, and swap outside the cancel flow.**
- **A back button in the cancel flow.** Claude suggested it, but the flow is short: picking the wrong reason means closing the dialog and starting again, which is only 2–3 taps. I preferred fewer controls on a small screen.

### Simulated vs real

- **Mock API:** loading and skipping, including slow responses, 409s and errors.
- **Local state, lost on reload:** frequency, quantity, swap, cancel, resume and restart. A skip after a local resume is simulated.

### Known limitations and assumptions

- A server change to one product drops the customer's changes to any product.
- A pause end date already in the past isn't handled. A real API would return the subscription as active.
- No real support contact. The app doesn’t invent one.
- Assumed: quantity cap of 10, resume and restart charge within 3 days, "a month" is 30 days, bundle content hardcoded, USD.
- Not tested on a real phone, with a real screen reader, or in Safari and Firefox.

## Part B

- One state (option, frequency, quantity). Prices, totals and fine print are all derived from it.
- The fine print is built from a template, with a test that the default state matches the provided copy exactly.
- Note: the product is 60 softgels but ships every 30 days by default. I built it as designed, but the copy may need a look.
- Tailwind's reset is global, so Part B sets every text size, line height and border explicitly.

## What I'd do next

- Add pause, as an option on the main page and cancel offer for "too much product"
- Test on a real phone and with a screen reader.