# ApexTrade — Algorithmic Stock Broker Platform

[![.NET 8.0](https://img.shields.io/badge/.NET-8.0-purple.svg)](https://dotnet.microsoft.com/)
[![Model Context Protocol](https://img.shields.io/badge/Tradier-Model%20Context%20Protocol%20(MCP)-emerald.svg)](https://modelcontextprotocol.io)
[![Tradier Sandbox](https://img.shields.io/badge/Account-6YC17358-blue.svg)](https://tradier.com)
[![GitHub Actions](https://img.shields.io/badge/GitHub%20Actions-24%2F7%20Scheduler-orange.svg)](https://github.com/features/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A high-performance algorithmic stock brokerage and portfolio management platform featuring a clean, MCP-driven execution model:
1. **C# Core Portfolio & Calculation Engine (.NET 8.0)**: Real-time weighted average cost basis, realized P&L, thread-safe ticker ingestion, mean-reversion dip evaluations on target stocks (**INTC**, **AMD**, **F**), dynamic lot sizing (1 to 3 shares max), and a strict bid-ask spread guardrail ($\le 1.0\%$).
2. **SQLite Vault Layer (`apextrade.db`)**: High-concurrency WAL-mode persistence managing `PortfolioState`, `TradeHistory`, `signals` queue, `execution_logs`, and `notifications`.
3. **Tradier Model Context Protocol (MCP) Server**: Fully hosted MCP endpoint (`https://mcp.tradier.com/v1`) providing natural language tools for account telemetry, real-time quotes, and order routing for Sandbox Account **6YC17358**.
4. **Real-Time Push Webhooks (Discord & Telegram)**: Instantaneous alerting upon signal detection, order execution, trade reconciliation, and network errors.
5. **Cloud Deployment & 24/7 Automation (.github/workflows/trading_bot.yml)**: GitHub Actions workflow scheduled to run every 5 minutes during US regular market hours (Monday–Friday, 9:30 AM – 4:00 PM EST / 13:30 – 20:00 UTC).

---

## 🏛 Architecture Layout

```
                               ┌───────────────────────────────────────────────┐
                               │           ApexTrade React Dashboard           │
                               │        (Port 3000 • Vite + Tailwind)          │
                               └──────────────────────┬────────────────────────┘
                                                      │ REST / SSE
                                                      ▼
                               ┌───────────────────────────────────────────────┐
                               │            Node.js / Express Gateway          │
                               │                   (server.ts)                 │
                               └───────────┬──────────────────────┬────────────┘
                                           │                      │
                       dotnet CLI / DLL    │                      │  MCP SSE Transport
                                           ▼                      ▼
┌───────────────────────────────────────────────┐      ┌───────────────────────────────────────────────┐
│     C# Portfolio & TradingTriggerEngine       │      │        Tradier Hosted MCP Server              │
│               (/src/csharp/)                  │      │         (https://mcp.tradier.com/v1)          │
│                                               │      │                                               │
│ • Mean-Reversion Evaluation (INTC, AMD, F)    │      │ • tradier_get_balances (Account 6YC17358)     │
│ • Slippage Guardrail ((Ask-Bid)/Bid <= 1%)    │      │ • tradier_get_quotes (Real-time spreads)      │
│ • Capital Controller ($100-$500 budget)       │      │ • tradier_get_orders (Execution statuses)     │
│ • Dynamic Micro-Lots (1-3 shares max)         │      │ • tradier_get_positions (Held equities)       │
│ • $50 Minimum Liquid Cash Reserve Buffer      │      │ • tradier_place_order (Smart Order Router)    │
└──────────────────────┬────────────────────────┘      └──────────────────────┬────────────────────────┘
                       │                                                      │
                       │ Writes PENDING signals                               │ Updates FILLED & Logs Audit
                       ▼                                                      ▼
               ┌──────────────────────────────────────────────────────────────────────┐
               │                     SQLite Vault Database Layer                      │
               │                   (apextrade.db • PRAGMA journal=WAL)                │
               │                                                                      │
               │  • PortfolioState (Cash balance, total valuation, realized P&L)      │
               │  • TradeHistory (Execution journal with running win/loss stats)      │
               │  • signals (Queue: id, symbol, side, qty, price, status, response)   │
               │  • execution_logs (Audit: order_id, action, status_code, payload)    │
               │  • notifications (Push alert history: event_type, channels, status)  │
               └──────────────────────────────────────────────────────────────────────┘
```

---

## 🤖 Tradier Model Context Protocol (MCP) Integration

ApexTrade connects directly to Tradier's hosted Model Context Protocol (MCP) server running on `https://mcp.tradier.com/v1` over Server-Sent Events (SSE).

### Connection Parameters
- **Endpoint**: `https://mcp.tradier.com/v1`
- **Transport**: `sse`
- **Sandbox Account ID**: `6YC17358`
- **Authorization**: `Bearer {TRADIER_TOKEN}`

### Available MCP Tools Catalog
1. `tradier_get_balances`: Fetch cash balance, total equity, and margin buying power for Tradier sandbox account `6YC17358`.
2. `tradier_get_quotes`: Retrieve real-time bid, ask, last price, and spread percentage for target tickers `INTC`, `AMD`, and `F`.
3. `tradier_get_orders`: Retrieve execution status, fill timestamps, and order histories for account `6YC17358`.
4. `tradier_get_positions`: Inspect currently held equity positions and cost basis for account `6YC17358`.
5. `tradier_place_order`: Submit a market or limit order with micro-lot sizing (1–3 shares) adhering to liquid buffer controls.

### Natural Language Tool Commands
You can interact with the Tradier MCP server using natural language prompts in the dashboard or via API:
- *"Check my Tradier sandbox cash balance and buying power for account 6YC17358"*
- *"Fetch live bid/ask quotes and spread for INTC, AMD, and F"*
- *"Check order execution statuses for account 6YC17358"*
- *"Inspect open equity positions and cost basis for account 6YC17358"*
- *"Route a market buy order for 2 shares of INTC on account 6YC17358"*

---

## 🎯 Target Stock Strategy & Rules

The C# engine continuously evaluates mean-reversion dip conditions for three target stocks:

| Ticker | Company | Approx Price | Target Dip Threshold | Dynamic Lot Size | Est. Trade Cost |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **INTC** | Intel Corp | ~$23.50 | $\ge 2.0\%$ drop vs Prior Close | **1 to 2 shares** | ~$23.50 – $47.00 |
| **AMD** | Advanced Micro Devices | ~$140.00 | $\ge 2.0\%$ drop vs Prior Close | **1 share** | ~$140.00 (if cash permits) |
| **F** | Ford Motor Company | ~$10.50 | $\ge 2.0\%$ drop vs Prior Close | **2 to 3 shares** | ~$21.00 – $31.50 |

### 1. Slippage & Spread Safety Guardrail
Before queuing any BUY order, the C# engine computes the current bid-ask spread:
$$\text{Spread Ratio} = \frac{\text{Ask Price} - \text{Bid Price}}{\text{Bid Price}}$$

- **Safety Limit**: `0.0100` (1.00%).
- **Rule**: If the spread ratio exceeds $1.00\%$ (e.g. 1.50%), the signal is **immediately aborted**:
  > *"Slippage Guardrail Abort: Bid-Ask spread of 1.52% exceeds 1.00% safety limit (Bid: $23.71, Ask: $24.07). BUY signal aborted to prevent high slippage rejections."*

### 2. Capital Controller ($100 – $500 Bankroll)
- **Small-Account Equity Target**: Tuned for $100 – $500 initial balances (default: $250).
- **Maximum Trade Allocation**: $15\% - 20\%$ of available cash per order.
- **Dynamic Lot Sizing**: 1 to 3 shares maximum per entry (never oversized 10-share orders).
- **Safety Reserve**: Engine enforces that total cash will never drop below **$50.00 liquid buffer**.

---

## 🔔 Discord & Telegram Real-Time Push Alerts

Push notification credentials can be configured via environment variables or `.env`:

```bash
# Push Notification Webhooks
DISCORD_WEBHOOK_URL="https://discord.com/api/webhooks/YOUR_ID/YOUR_TOKEN"
TELEGRAM_BOT_TOKEN="123456789:ABCdefGHIjklMNOpqrSTUvwxYZ"
TELEGRAM_CHAT_ID="-1001234567890"
```

### Alert Triggers
1. **Signal Detected**: When a new dip trigger is evaluated by C# and placed into the SQLite `signals` queue (`event_type: SIGNAL_DETECTED`).
2. **Order Executed**: When the order is successfully routed via Tradier MCP, including symbol, share quantity, order type, price, and Order ID (`event_type: ORDER_EXECUTED`).
3. **Order Reconciled**: When the order is confirmed `FILLED` on account `6YC17358` (`event_type: ORDER_RECONCILED`).
4. **Error & Timeout Warnings**: Dispatched immediately on any network timeouts, HTTP error codes, or safety halts (`event_type: API_ERROR`).

---

## ☁️ GitHub Actions 24/7 Automation Scheduler

The repository includes `.github/workflows/trading_bot.yml` configured to run automatically during US stock market hours:

- **Schedule**: Every 5 minutes, Monday through Friday, between **13:00 and 20:59 UTC** (9:30 AM – 4:00 PM Eastern US regular market session).
- **Manual Trigger**: Supports `workflow_dispatch` for manual on-demand triggers and test notifications.

```yaml
on:
  schedule:
    - cron: '*/5 13-20 * * 1-5'
  workflow_dispatch:
```

### GitHub Repository Secrets Checklist
In your GitHub repository settings under **Settings > Secrets and variables > Actions**, add:

| Secret Name | Required | Description |
| :--- | :--- | :--- |
| `TRADIER_TOKEN` | **Yes** | Tradier Sandbox Bearer Access Token |
| `TRADIER_ACCOUNT_ID` | **Yes** | Sandbox Account ID (`6YC17358`) |
| `TRADIER_MCP_ENDPOINT` | No | `https://mcp.tradier.com/v1` (default) |
| `DISCORD_WEBHOOK_URL` | Optional | Discord Channel Incoming Webhook URL |
| `TELEGRAM_BOT_TOKEN` | Optional | Telegram Bot Token from `@BotFather` |
| `TELEGRAM_CHAT_ID` | Optional | Telegram Group/Channel Chat ID |

---

## 🚀 Local Quickstart & Commands

### Prerequisites
- .NET SDK 8.0+
- Node.js 18+ (for Web Dashboard & Gateway)
- Python 3.10+ (for SQLite helper scripts)

### 1. Install Dependencies
```bash
npm install
```

### 2. Inspect SQLite Vault Database Status
```bash
dotnet run --project csharp/ApexTrade.Portfolio -- --db-status
```

### 3. Run the C# Calculation Engine
```bash
# Compile and evaluate INTC, AMD, F market dips with Slippage Guardrail
dotnet run --project csharp/ApexTrade.Portfolio -- --trigger-engine

# Reset database to $250 small-account seed cash
dotnet run --project csharp/ApexTrade.Portfolio -- --reset-db 250
```

### 4. Start the Full-Stack Web Dashboard
```bash
npm run dev
# Opens on http://localhost:3000
```

---

## 📁 Repository Directory Structure

```
├── .github/
│   └── workflows/
│       └── trading_bot.yml           # Phase 6: GitHub Actions US Market Hours Scheduler
├── src/
│   ├── csharp/                       # C# Core Engine & SQLite Connection Handlers
│   │   ├── ApexTrade.Portfolio.csproj
│   │   ├── Portfolio.cs
│   │   ├── Program.cs
│   │   ├── TradingTriggerEngine.cs
│   │   └── VaultDb.cs
│   ├── components/                   # React Dashboard & Real-Time Monitoring UI
│   │   ├── AutomatedTradingTriggerPanel.tsx
│   │   ├── PortfolioDashboard.tsx
│   │   └── VaultDatabaseViewer.tsx
│   ├── App.tsx
│   └── types.ts
├── csharp/                           # .NET 8.0 Executable Project
│   └── ApexTrade.Portfolio/
├── tradier_mcp_config.json           # Tradier Model Context Protocol (MCP) Server Schema
├── apextrade.db                      # Local SQLite Database (git-ignored)
├── .gitignore                        # Production gitignore excluding databases & secrets
├── .env.example                      # Environment variable reference template
├── server.ts                         # Full-stack Node.js / Express proxy & MCP Gateway
└── README.md                         # Complete platform documentation
```

---

## 🛡 License
MIT License. Created for ApexTrade algorithmic trading and sandbox execution verification.
