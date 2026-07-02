# Edgewise — Project Rules

Reference document for all Cursor prompts building Edgewise.

## Product

**Edgewise** is a real-money-aware Kalshi sports betting/trading assistant.

Goal: Build a profit-first Kalshi sports edge hunter that aggressively finds real, executable, risk-adjusted positive expected value opportunities while blocking fake, stale, mismatched, low-liquidity, overconfident, or unsafe trades.

## Optimization Targets

- Highest realistic win rate (not guaranteed)
- Highest verified expected profit
- Highest expected dollar value
- Strongest risk-adjusted return
- Fastest edge detection
- Fastest verified edge capture
- Best protection from fake edges, stale data, wrong-market execution
- Best bankroll survival

## What Edgewise Is NOT

- A fake demo gambling app
- Paper-money-only (Paper mode exists but is not the only mode)
- A random betting picker
- A sportsbook execution app
- A Polymarket bot
- A martingale / chase-loss / guaranteed-profit machine

## 100% Validation Target

**100_PERCENT_VALIDATION_TARGET** — Every trade must pass 100% of required validation gates before execution.

- Good verified trades may execute
- Bad, unclear, stale, mismatched, or weak trades must be blocked

### Never Display

- guaranteed win
- 100% win rate
- free money
- lock
- sure thing
- risk-free

### Use Instead

- highest-confidence
- verified edge
- validation passed / validation failed
- positive expected value
- risk-adjusted opportunity
- blocked per trade

## Money-First Ranking

Rank opportunities by:

1. Expected dollar profit
2. Net EV after fees, spread, slippage, stale-data penalty
3. Edge Quality Score
4. Money Confidence Score
5. Profit Priority Score
6. Fill probability
7. Liquidity
8. Edge survival
9. Market match confidence
10. Settlement confidence
11. Closing price value potential
12. Bankroll impact
13. Speed needed to capture

## Edge Hunt Targets

- $1–$5 verified small edges
- $5–$15 target opportunities
- $15–$50 strong opportunities
- $50+ high-value (extra verification)
- 30% / 60% / 70% apparent edges
- Live market lag
- Sportsbook consensus vs Kalshi mispricing
- Stale odds, Kalshi underreaction
- Totals / over-under, score-pace
- High-liquidity, fast-decay, near-BETTABLE

**Aggressive discovery. Conservative execution validation.**

## Non-Negotiable Rules

Never:

- Guarantee profit or 100% win rate
- Chase losses, martingale, double down, increase stake after losses
- Risk 100% bankroll on one trade
- Trade unclear / stale / mismatched markets
- Use midpoint as executable price
- Expose secrets; put Kalshi signing or provider API keys in browser code
- Fake balances, fills, scores, odds, markets, P&L, backtests, profitability
- Hide failed commands or tests
- Pretend real-money trading is safe

## Execution Modes

User-selectable from UI (never hidden or locked):

| Mode   | Description                                      |
|--------|--------------------------------------------------|
| MANUAL | User confirms each trade after validation        |
| AUTO   | Auto scan/rank/execute when gates pass           |
| WATCH  | Monitor and alert only                           |
| PAPER  | Simulated execution, no live orders              |
| SHADOW | Hypothetical fill tracking                       |

### Auto Statuses (allowed)

- AUTO_SELECTABLE
- AUTO_SELECTED
- AUTO_ACTIVE
- AUTO_SCANNING
- AUTO_WAITING_FOR_VALID_TRADE
- AUTO_TRADE_READY
- AUTO_TRADE_SUBMITTED
- AUTO_TRADE_BLOCKED_PER_TRADE
- AUTO_PAUSED_BY_USER
- AUTO_EMERGENCY_STOP

### Auto Statuses (forbidden)

- AUTO_LOCKED
- AUTO_DISABLED
- LIVE_AUTO_LOCKED
- LIVE_AUTO_GLOBALLY_BLOCKED

Every live order must pass per-trade server validation before placement.

## Stake Rules

Stake modes: fixed dollar, fixed percent, AI recommended, AI with user max, auto risk-capped.

For every opportunity show:

- User requested stake
- AI recommended stake
- Final allowed stake
- Max loss
- Expected dollar profit
- Reason stake was allowed, reduced, or blocked

**100% bankroll stake → BLOCKED — 100_PERCENT_BANKROLL_STAKE_NOT_ALLOWED**

## Risk Defaults

| Limit                    | Default   |
|--------------------------|-----------|
| Max manual stake         | 1% bankroll |
| Conservative stake       | 0.5% bankroll |
| Max daily realized loss  | 3% bankroll |
| Max daily exposure       | 10% bankroll |
| Max exposure per game    | 3% bankroll |
| Max exposure per league  | 6% bankroll |
| Max open trades          | 10 |
| Max trades per day       | 25 |

No martingale. No chasing. No 100% bankroll trade.

## Build Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- Server-side API routes
- Clean component structure
- Local server-side storage first (no DB unless required)
- No provider keys hardcoded
- No real orders until execution gates exist
- No fake real-money claims

## Current Default Status

| Component          | Status                          |
|--------------------|---------------------------------|
| Manual execution   | BUILT — per-trade gated, blocked by default until keys + env |
| Auto mode          | BUILT — selectable, active, per-trade validation            |
| Live Auto trading  | BUILT — per-trade gated, not globally blocked               |
| Profitability      | UNPROVEN                        |
| Provider keys      | NOT_BUILT_YET                   |

## Prompt Workflow

At the end of every prompt, return initialization report fields and **STOP**. Wait for user to type **CONTINUE**.
