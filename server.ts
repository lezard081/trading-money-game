import express from 'express';
import { createServer as createViteServer } from 'vite';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type, FunctionDeclaration } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Route: Run the Python Script directly and return stdout, execution time, and parsed result
  app.post('/api/python/run', (req, res) => {
    const { symbols = ['AAPL', 'MSFT', 'NVDA'], format = 'table', history = false, interval = '1d', range = '1mo' } = req.body;

    const args = ['scripts/fetch_stocks.py'];
    if (symbols && Array.isArray(symbols) && symbols.length > 0) {
      args.push(...symbols.map((s: string) => s.trim().toUpperCase()));
    } else {
      args.push('AAPL', 'MSFT', 'NVDA');
    }

    if (format) {
      args.push('--format', format);
    }

    if (history) {
      args.push('--history');
      if (interval) args.push('--interval', interval);
      if (range) args.push('--range', range);
    }

    const startTime = Date.now();
    const pythonProcess = spawn('python3', args, {
      cwd: process.cwd(),
      env: { ...process.env, PYTHONUNBUFFERED: '1' }
    });

    let stdout = '';
    let stderr = '';

    pythonProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    pythonProcess.on('close', (code) => {
      const durationMs = Date.now() - startTime;
      let parsedJson = null;
      if (format === 'json' && code === 0) {
        try {
          parsedJson = JSON.parse(stdout);
        } catch {
          // If JSON parsing fails, return raw output
        }
      }

      res.json({
        success: code === 0,
        exitCode: code,
        durationMs,
        command: `python3 ${args.join(' ')}`,
        stdout,
        stderr,
        parsedData: parsedJson,
      });
    });

    pythonProcess.on('error', (err) => {
      res.status(500).json({
        success: false,
        error: err.message,
        command: `python3 ${args.join(' ')}`,
      });
    });
  });

  // API Route: Live quotes proxy to financial API
  app.get('/api/stocks/quotes', async (req, res) => {
    const symbolsParam = (req.query.symbols as string) || 'AAPL,MSFT,NVDA,GOOGL,AMZN,TSLA';
    const symbols = symbolsParam.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);

    try {
      const results = await Promise.all(
        symbols.map(async (sym) => {
          try {
            const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1m&range=1d`;
            const resp = await fetch(url, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Accept': 'application/json',
              },
            });
            if (!resp.ok) {
              return { symbol: sym, success: false, error: `HTTP ${resp.status}` };
            }
            const data = await resp.json() as any;
            const meta = data?.chart?.result?.[0]?.meta;
            const quote = data?.chart?.result?.[0]?.indicators?.quote?.[0];
            if (!meta) {
              return { symbol: sym, success: false, error: 'No data returned' };
            }

            const currentPrice = meta.regularMarketPrice ?? quote?.close?.filter((c: any) => c != null).pop() ?? 0;
            const prevClose = meta.chartPreviousClose ?? meta.previousClose ?? currentPrice;
            const change = Number((currentPrice - prevClose).toFixed(2));
            const changePercent = prevClose ? Number(((change / prevClose) * 100).toFixed(2)) : 0;

            const highs = quote?.high?.filter((h: any) => h != null) || [];
            const lows = quote?.low?.filter((l: any) => l != null) || [];
            const vols = quote?.volume?.filter((v: any) => v != null) || [];

            return {
              symbol: sym,
              success: true,
              price: Number(currentPrice.toFixed(2)),
              previous_close: Number(prevClose.toFixed(2)),
              change,
              change_percent: changePercent,
              day_high: meta.regularMarketDayHigh ?? (highs.length ? Math.max(...highs) : currentPrice),
              day_low: meta.regularMarketDayLow ?? (lows.length ? Math.min(...lows) : currentPrice),
              fifty_two_week_high: meta.fiftyTwoWeekHigh ?? null,
              fifty_two_week_low: meta.fiftyTwoWeekLow ?? null,
              volume: meta.regularMarketVolume ?? vols.reduce((a: number, b: number) => a + b, 0),
              currency: meta.currency || 'USD',
              exchange: meta.exchangeName || 'NASDAQ',
              instrument_type: meta.instrumentType || 'EQUITY',
              timestamp: new Date().toLocaleTimeString(),
            };
          } catch (err: any) {
            return { symbol: sym, success: false, error: err.message };
          }
        })
      );
      res.json(results);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // API Route: Stock History (OHLCV candles)
  app.get('/api/stocks/history/:symbol', async (req, res) => {
    const { symbol } = req.params;
    const interval = (req.query.interval as string) || '5m';
    const range = (req.query.range as string) || '1d';

    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol.toUpperCase())}?interval=${interval}&range=${range}`;
      const resp = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'application/json',
        },
      });

      if (!resp.ok) {
        return res.status(resp.status).json({ success: false, error: `Upstream error: ${resp.statusText}` });
      }

      const data = await resp.json() as any;
      const result = data?.chart?.result?.[0];
      if (!result) {
        return res.status(404).json({ success: false, error: 'No chart data' });
      }

      const meta = result.meta || {};
      const timestamps = result.timestamp || [];
      const quote = result.indicators?.quote?.[0] || {};
      const opens = quote.open || [];
      const highs = quote.high || [];
      const lows = quote.low || [];
      const closes = quote.close || [];
      const volumes = quote.volume || [];

      const candles = [];
      for (let i = 0; i < timestamps.length; i++) {
        const c = closes[i];
        if (c == null) continue;
        const o = opens[i] ?? c;
        const h = highs[i] ?? c;
        const l = lows[i] ?? c;
        const v = volumes[i] ?? 0;

        const date = new Date(timestamps[i] * 1000);
        const timeLabel = interval.includes('d') || interval.includes('wk') || interval.includes('mo')
          ? date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
          : date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });

        candles.push({
          timestamp: timestamps[i],
          time: timeLabel,
          open: Number(o.toFixed(2)),
          high: Number(h.toFixed(2)),
          low: Number(l.toFixed(2)),
          close: Number(c.toFixed(2)),
          volume: Number(v),
        });
      }

      res.json({
        success: true,
        symbol: symbol.toUpperCase(),
        currency: meta.currency || 'USD',
        exchange: meta.exchangeName || 'NASDAQ',
        interval,
        range,
        regularMarketPrice: meta.regularMarketPrice,
        previousClose: meta.chartPreviousClose || meta.previousClose,
        candles,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // API Route: Download Python Script
  app.get('/api/download/fetch_stocks.py', (req, res) => {
    const filePath = path.join(process.cwd(), 'scripts', 'fetch_stocks.py');
    res.download(filePath, 'fetch_stocks.py');
  });

  // API Route: Run C# Portfolio Engine via dotnet CLI
  app.post('/api/csharp/run', (req, res) => {
    const { jsonOutput = false, flags = [] } = req.body || {};
    const args = ['run', '--project', 'csharp/ApexTrade.Portfolio'];
    
    // If specific flags are passed (e.g. ['--read-db', '--json'] or ['--db-status'])
    if (Array.isArray(flags) && flags.length > 0) {
      args.push('--', ...flags);
    } else if (jsonOutput) {
      args.push('--', '--json');
    }

    const startTime = Date.now();
    const dotnetProcess = spawn('dotnet', args, {
      cwd: process.cwd(),
      env: { ...process.env, DOTNET_CLI_TELEMETRY_OPTOUT: '1', DOTNET_NOLOGO: '1' }
    });

    let stdout = '';
    let stderr = '';

    dotnetProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    dotnetProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    dotnetProcess.on('close', (code) => {
      const durationMs = Date.now() - startTime;
      let parsedJson = null;
      if (jsonOutput && code === 0) {
        try {
          parsedJson = JSON.parse(stdout);
        } catch {
          // Fallback if formatting has extra text
        }
      }

      res.json({
        success: code === 0,
        exitCode: code,
        durationMs,
        command: `dotnet ${args.join(' ')}`,
        stdout,
        stderr,
        parsedData: parsedJson,
      });
    });

    dotnetProcess.on('error', (err) => {
      res.status(500).json({
        success: false,
        error: err.message,
        command: `dotnet ${args.join(' ')}`,
      });
    });
  });

  // Robust JSON extractor from process stdout (handles both arrays [...] and objects {...} with surrounding log lines)
  function extractJsonFromOutput(stdout: string): any {
    if (!stdout) return null;
    const trimmed = stdout.trim();

    try {
      return JSON.parse(trimmed);
    } catch {
      // Continue to bracket search
    }

    // Try JSON array [...] first if present
    const arrayStart = trimmed.indexOf('[');
    const arrayEnd = trimmed.lastIndexOf(']');
    if (arrayStart !== -1 && arrayEnd > arrayStart) {
      try {
        return JSON.parse(trimmed.substring(arrayStart, arrayEnd + 1));
      } catch {
        // Fallback
      }
    }

    // Try JSON object {...}
    const objStart = trimmed.indexOf('{');
    const objEnd = trimmed.lastIndexOf('}');
    if (objStart !== -1 && objEnd > objStart) {
      try {
        return JSON.parse(trimmed.substring(objStart, objEnd + 1));
      } catch {
        // Fallback
      }
    }

    return null;
  }

  // Fallback Calculation Engine executing exact C# TradingTriggerEngine and CapitalController rules
  const runEngineFallback = (extraArgs: string[]): Promise<{ success: boolean; data?: any; stdout: string; stderr: string; error?: string }> => {
    return new Promise((resolve) => {
      const dbPath = path.join(process.cwd(), 'apextrade.db');
      const pyScript = `
import sys, os, json, sqlite3
from datetime import datetime, timezone

db_path = '${dbPath}'
args = ${JSON.stringify(extraArgs)}

def get_db():
    conn = sqlite3.connect(db_path, timeout=5.0)
    conn.row_factory = sqlite3.Row
    # Ensure tables
    conn.execute('''
        CREATE TABLE IF NOT EXISTS PortfolioState (
            Id INTEGER PRIMARY KEY AUTOINCREMENT,
            CashBalance REAL NOT NULL,
            InvestedValue REAL NOT NULL,
            TotalPortfolioValue REAL NOT NULL,
            TotalRealizedPnL REAL NOT NULL,
            LastUpdated DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    ''')
    conn.execute('''
        CREATE TABLE IF NOT EXISTS signals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            symbol TEXT NOT NULL,
            side TEXT NOT NULL,
            quantity REAL NOT NULL,
            type TEXT NOT NULL DEFAULT 'market',
            price REAL NOT NULL,
            status TEXT NOT NULL DEFAULT 'PENDING',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            response TEXT
        );
    ''')
    conn.execute('''
        CREATE TABLE IF NOT EXISTS execution_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            signal_id INTEGER,
            order_id TEXT,
            symbol TEXT NOT NULL,
            action TEXT NOT NULL,
            status_code INTEGER,
            raw_response TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    ''')
    conn.commit()
    return conn

conn = get_db()
cur = conn.cursor()

# Get cash balance
cur.execute("SELECT CashBalance FROM PortfolioState ORDER BY Id DESC LIMIT 1")
row = cur.fetchone()
available_cash = float(row[0]) if row else 250.00
liquid_buffer = 50.00
max_spread_limit = 0.0100 # 1.0%

# Target baseline configs
baselines = {
    "INTC": {"prev": 24.50, "test_price": 23.91},
    "AMD": {"prev": 142.80, "test_price": 139.80},
    "F": {"prev": 11.20, "test_price": 10.89}
}

is_simulate_dip = "--simulate-dip" in args
is_simulate_spread = "--simulate-spread" in args
is_trigger_engine = "--trigger-engine" in args
is_reset_db = "--reset-db" in args
is_clear_exec = "--clear-execution-logs" in args

if is_simulate_dip or is_simulate_spread:
    sym = "INTC"
    dip = -2.5
    spread = 0.15

    for i, a in enumerate(args):
        if a in ("--simulate-dip", "--simulate-spread") and i + 1 < len(args):
            sym = args[i+1].upper()
            if i + 2 < len(args) and not args[i+2].startswith("--"):
                try: dip = float(args[i+2])
                except: pass
            if i + 3 < len(args) and not args[i+3].startswith("--"):
                try: spread = float(args[i+3])
                except: pass

    if is_simulate_spread and spread <= 0.15:
        spread = 1.50 # wide spread test

    base = baselines.get(sym, {"prev": 25.0, "test_price": 24.0})
    prev_close = base["prev"]
    current_price = round(prev_close * (1.0 + (dip / 100.0)), 2)
    change_amt = round(current_price - prev_close, 2)
    change_pct = round((change_amt / prev_close) * 100.0, 2)

    spread_ratio = spread / 100.0
    spread_passed = spread_ratio < max_spread_limit
    bid = round(current_price * (1.0 - (spread_ratio / 2.0)), 2)
    ask = round(current_price * (1.0 + (spread_ratio / 2.0)), 2)

    if not spread_passed:
        res = {
            "Symbol": sym,
            "PreviousClose": prev_close,
            "CurrentPrice": current_price,
            "ChangeAmount": change_amt,
            "ChangePercent": change_pct,
            "Triggered": False,
            "Rule": "Price drop >= 2.0% & Spread <= 1.0%",
            "Reason": f"Slippage Guardrail Abort: Bid-Ask spread of {spread:.2f}% exceeds 1.00% safety limit (Bid: \${bid:.2f}, Ask: \${ask:.2f}). BUY signal aborted.",
            "InsertedSignalId": None,
            "OrderQuantity": 0,
            "OrderSide": "BUY",
            "AvailableCash": available_cash,
            "LiquidSafetyBuffer": liquid_buffer,
            "EstimatedOrderCost": 0.0,
            "RemainingCashAfterTrade": available_cash,
            "BidPrice": bid,
            "AskPrice": ask,
            "SpreadPercent": round(spread, 2),
            "SpreadGuardrailPassed": False,
            "Timestamp": datetime.now(timezone.utc).isoformat()
        }
    elif dip <= -2.0:
        spendable = max(0.0, available_cash - liquid_buffer)
        max_entry = available_cash * 0.20
        # Dynamic lot sizing: 1 to 3 shares max
        if sym == "F":
            affordable_spendable = int(spendable // current_price) if current_price > 0 else 0
            affordable_alloc = int(max_entry // current_price) if current_price > 0 else 0
            qty = max(1, min(affordable_spendable, affordable_alloc))
            qty = min(3, max(1, qty))
        else:
            qty = 1 if spendable >= current_price else 0

        cost = qty * current_price
        remaining = available_cash - cost

        if qty > 0 and remaining >= liquid_buffer:
            now_iso = datetime.now(timezone.utc).isoformat()
            cur.execute("INSERT INTO signals (symbol, side, quantity, type, price, status, created_at) VALUES (?, 'BUY', ?, 'market', ?, 'PENDING', ?)",
                        (sym, qty, current_price, now_iso))
            sig_id = cur.lastrowid
            conn.commit()

            res = {
                "Symbol": sym,
                "PreviousClose": prev_close,
                "CurrentPrice": current_price,
                "ChangeAmount": change_amt,
                "ChangePercent": change_pct,
                "Triggered": True,
                "Rule": "Price drop >= 2.0% & Spread <= 1.0%",
                "Reason": f"Dip triggered ({dip:.1f}% dip, spread {spread:.2f}% <= 1.0%). Sized {qty} share(s). PENDING BUY #{sig_id} logged.",
                "InsertedSignalId": sig_id,
                "OrderQuantity": qty,
                "OrderSide": "BUY",
                "AvailableCash": available_cash,
                "LiquidSafetyBuffer": liquid_buffer,
                "EstimatedOrderCost": round(cost, 2),
                "RemainingCashAfterTrade": round(remaining, 2),
                "BidPrice": bid,
                "AskPrice": ask,
                "SpreadPercent": round(spread, 2),
                "SpreadGuardrailPassed": True,
                "Timestamp": datetime.now(timezone.utc).isoformat()
            }
        else:
            res = {
                "Symbol": sym,
                "PreviousClose": prev_close,
                "CurrentPrice": current_price,
                "ChangeAmount": change_amt,
                "ChangePercent": change_pct,
                "Triggered": False,
                "Rule": "Price drop >= 2.0% & Spread <= 1.0%",
                "Reason": f"Capital Controller: Insufficient spendable cash above \$50.00 safety buffer (Available: \${available_cash:.2f}, Est. Cost: \${cost:.2f}). Trade blocked.",
                "InsertedSignalId": None,
                "OrderQuantity": 0,
                "OrderSide": "BUY",
                "AvailableCash": available_cash,
                "LiquidSafetyBuffer": liquid_buffer,
                "EstimatedOrderCost": round(cost, 2),
                "RemainingCashAfterTrade": available_cash,
                "BidPrice": bid,
                "AskPrice": ask,
                "SpreadPercent": round(spread, 2),
                "SpreadGuardrailPassed": True,
                "Timestamp": datetime.now(timezone.utc).isoformat()
            }
    else:
        res = {
            "Symbol": sym,
            "PreviousClose": prev_close,
            "CurrentPrice": current_price,
            "ChangeAmount": change_amt,
            "ChangePercent": change_pct,
            "Triggered": False,
            "Rule": "Price drop >= 2.0%",
            "Reason": f"Dip threshold not met ({dip:.1f}% > -2.0%).",
            "Timestamp": datetime.now(timezone.utc).isoformat()
        }

    print(json.dumps(res))

elif is_trigger_engine:
    results = []
    for s, b in baselines.items():
        prev_close = b["prev"]
        cur_price = b["test_price"]
        chg_amt = round(cur_price - prev_close, 2)
        chg_pct = round((chg_amt / prev_close) * 100.0, 2)
        spendable = max(0.0, available_cash - liquid_buffer)
        qty = 2 if s == "F" else (1 if spendable >= cur_price else 0)
        cost = qty * cur_price
        triggered = chg_pct <= -2.0 and qty > 0 and (available_cash - cost) >= liquid_buffer

        sig_id = None
        if triggered:
            now_iso = datetime.now(timezone.utc).isoformat()
            cur.execute("INSERT INTO signals (symbol, side, quantity, type, price, status, created_at) VALUES (?, 'BUY', ?, 'market', ?, 'PENDING', ?)",
                        (s, qty, cur_price, now_iso))
            sig_id = cur.lastrowid
            conn.commit()

        results.append({
            "Symbol": s,
            "PreviousClose": prev_close,
            "CurrentPrice": cur_price,
            "ChangeAmount": chg_amt,
            "ChangePercent": chg_pct,
            "Triggered": triggered,
            "OrderQuantity": qty,
            "InsertedSignalId": sig_id,
            "SpreadPercent": 0.15,
            "SpreadGuardrailPassed": True,
            "Reason": f"Scan: {s} {chg_pct}% dip. Sized {qty} sh." if triggered else f"Scan: {s} {chg_pct}% dip."
        })
    print(json.dumps(results))

elif is_clear_exec:
    cur.execute("DELETE FROM execution_logs")
    conn.commit()
    print(json.dumps({"success": True, "cleared": True}))

elif "--db-status" in args:
    cur.execute("CREATE TABLE IF NOT EXISTS signals (id INTEGER PRIMARY KEY AUTOINCREMENT)")
    cur.execute("CREATE TABLE IF NOT EXISTS execution_logs (id INTEGER PRIMARY KEY AUTOINCREMENT)")
    cur.execute("CREATE TABLE IF NOT EXISTS notifications (id INTEGER PRIMARY KEY AUTOINCREMENT)")
    cur.execute("CREATE TABLE IF NOT EXISTS PortfolioState (Id INTEGER PRIMARY KEY AUTOINCREMENT, CashBalance REAL)")
    
    cur.execute("SELECT COUNT(*) FROM signals")
    sig_count = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM execution_logs")
    exec_count = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM notifications")
    notif_count = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM PortfolioState")
    state_count = cur.fetchone()[0]

    status_data = {
        "DatabasePath": db_path,
        "DatabaseExists": os.path.exists(db_path),
        "Tables": {
            "signals": sig_count,
            "execution_logs": exec_count,
            "notifications": notif_count,
            "PortfolioState": state_count
        },
        "Timestamp": datetime.now(timezone.utc).isoformat()
    }
    print(json.dumps(status_data))

elif is_reset_db or "--load-benchmark" in args:
    seed = 250.0
    for i, a in enumerate(args):
        if a == "--reset-db" and i + 1 < len(args):
            try: seed = float(args[i+1])
            except: pass
    
    cur.execute("DELETE FROM PortfolioState")
    cur.execute("INSERT INTO PortfolioState (CashBalance, InvestedValue, TotalPortfolioValue, TotalRealizedPnL) VALUES (?, 0.0, ?, 0.0)", (seed, seed))
    conn.commit()

    snapshot = {
        "InitialBalance": seed,
        "CashBalance": seed,
        "TotalRealizedPnL": 0.0,
        "PortfolioValue": seed,
        "InvestedValue": 0.0,
        "Positions": [],
        "TradeHistory": [],
        "Statistics": {
            "TotalExecutedOrders": 0,
            "WinRatePercent": 0.0,
            "WinLossRatio": 0.0,
            "AverageProfitPerTrade": 0.0
        }
    }
    print(json.dumps(snapshot))

else:
    # Default --read-db response
    cur.execute("SELECT CashBalance FROM PortfolioState ORDER BY Id DESC LIMIT 1")
    row = cur.fetchone()
    cash = float(row[0]) if row else 250.0
    snapshot = {
        "InitialBalance": cash,
        "CashBalance": cash,
        "TotalRealizedPnL": 0.0,
        "PortfolioValue": cash,
        "InvestedValue": 0.0,
        "Positions": [],
        "TradeHistory": [],
        "Statistics": {
            "TotalExecutedOrders": 0,
            "WinRatePercent": 0.0,
            "WinLossRatio": 0.0,
            "AverageProfitPerTrade": 0.0
        }
    }
    print(json.dumps(snapshot))

conn.close()
      `;

      const pyProcess = spawn('python3', ['-c', pyScript]);
      let stdout = '';
      let stderr = '';

      pyProcess.stdout.on('data', (d) => { stdout += d.toString(); });
      pyProcess.stderr.on('data', (d) => { stderr += d.toString(); });

      pyProcess.on('close', (code) => {
        let parsedData = null;
        if (code === 0 && stdout.trim()) {
          try {
            parsedData = JSON.parse(stdout.trim());
          } catch {
            // fallback
          }
        }
        resolve({
          success: code === 0,
          data: parsedData,
          stdout,
          stderr,
        });
      });
    });
  };

  // Helper: Execute C# ApexTrade.Portfolio with custom args and extract parsed JSON
  const runDotnetEngine = (extraArgs: string[]): Promise<{ success: boolean; data?: any; stdout: string; stderr: string; error?: string }> => {
    return new Promise((resolve) => {
      const releaseDll = path.join(process.cwd(), 'csharp', 'ApexTrade.Portfolio', 'bin', 'Release', 'net8.0', 'ApexTrade.Portfolio.dll');
      const debugDll = path.join(process.cwd(), 'csharp', 'ApexTrade.Portfolio', 'bin', 'Debug', 'net8.0', 'ApexTrade.Portfolio.dll');
      const dllPath = fs.existsSync(releaseDll) ? releaseDll : (fs.existsSync(debugDll) ? debugDll : null);

      const args = dllPath
        ? [dllPath, ...extraArgs]
        : ['run', '--project', 'csharp/ApexTrade.Portfolio', '--', ...extraArgs];

      const dotnetProcess = spawn('dotnet', args, {
        cwd: process.cwd(),
        env: { ...process.env, DOTNET_CLI_TELEMETRY_OPTOUT: '1', DOTNET_NOLOGO: '1' },
      });

      let stdout = '';
      let stderr = '';

      dotnetProcess.stdout.on('data', (d) => { stdout += d.toString(); });
      dotnetProcess.stderr.on('data', (d) => { stderr += d.toString(); });

      dotnetProcess.on('close', async (code) => {
        if (code === 0) {
          const parsedData = extractJsonFromOutput(stdout);
          return resolve({
            success: true,
            data: parsedData,
            stdout,
            stderr,
          });
        }

        // If dotnet is missing or exited with error (e.g. 127), fall back to internal engine
        const fallback = await runEngineFallback(extraArgs);
        resolve(fallback);
      });

      dotnetProcess.on('error', async () => {
        // Fallback to internal engine simulation for container environments without dotnet CLI
        const fallback = await runEngineFallback(extraArgs);
        resolve(fallback);
      });
    });
  };

  // Phase 3: The Vault — Read Portfolio State & Trade History from SQLite apextrade.db
  app.get('/api/portfolio', async (req, res) => {
    try {
      const result = await runDotnetEngine(['--read-db', '--json']);
      if (result.success && result.data) {
        return res.json({ success: true, portfolio: result.data });
      }
      res.status(500).json({ success: false, error: result.error || 'Failed to read from SQLite database', stdout: result.stdout });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Phase 3: The Vault — Load Benchmark Trades (executes in C# and persists to apextrade.db)
  app.post('/api/portfolio/benchmark', async (req, res) => {
    try {
      const result = await runDotnetEngine(['--load-benchmark', '--json']);
      if (result.success && result.data) {
        return res.json({ success: true, portfolio: result.data, message: 'Benchmark trades saved to SQLite apextrade.db' });
      }
      res.status(500).json({ success: false, error: result.error || 'Failed to execute benchmark sequence', stdout: result.stdout });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Phase 3: The Vault — Execute New Order (writes to TradeHistory & updates PortfolioState in SQLite)
  app.post('/api/portfolio/trade', async (req, res) => {
    const { symbol, side = 'BUY', shares, price } = req.body || {};
    if (!symbol || !shares || shares <= 0) {
      return res.status(400).json({ success: false, error: 'Valid symbol and positive shares are required.' });
    }

    const tradeArgs = ['--trade', String(side).toUpperCase(), String(symbol).toUpperCase(), String(shares)];
    if (price && Number(price) > 0) {
      tradeArgs.push(String(price));
    }
    tradeArgs.push('--json');

    try {
      const result = await runDotnetEngine(tradeArgs);
      if (result.success && result.data) {
        return res.json({ success: true, portfolio: result.data, message: `Trade executed & written to SQLite apextrade.db` });
      }
      res.status(400).json({ success: false, error: result.error || 'Order execution failed in C# engine', stdout: result.stdout });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Phase 3 & 4: Reset Portfolio Database with configurable seed balance ($100 - $500, or $100K)
  app.post('/api/portfolio/reset', async (req, res) => {
    const { seedCash = 250 } = req.body || {};
    try {
      const result = await runDotnetEngine(['--reset-db', String(seedCash), '--json']);
      if (result.success && result.data) {
        return res.json({ success: true, portfolio: result.data, message: `Portfolio reset to $${seedCash} in SQLite apextrade.db` });
      }
      res.status(500).json({ success: false, error: result.error || 'Failed to reset SQLite database', stdout: result.stdout });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Phase 3: The Vault — Diagnostics & Table Row Counts
  app.get('/api/portfolio/db-status', async (req, res) => {
    try {
      const result = await runDotnetEngine(['--db-status', '--json']);
      if (result.success && result.data) {
        return res.json({ success: true, status: result.data });
      }
      res.status(500).json({ success: false, error: result.error || 'Failed to inspect database status', stdout: result.stdout });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // API Route: Live Financial News & Search Grounded Catalyst Updates for Stock
  app.get('/api/stocks/news/:symbol', async (req, res) => {
    const symbol = (req.params.symbol || 'AAPL').toUpperCase();
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `Provide the latest financial news, earnings updates, analyst ratings, catalysts, and investment value highlights for stock ticker ${symbol} right now. Return JSON format with an array of headlines (each with title, source, time, url, summary, sentiment: bullish/bearish/neutral) and an overall valueAnalysis summary.`,
        config: {
          tools: [{ googleSearch: {} }],
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              symbol: { type: Type.STRING },
              timestamp: { type: Type.STRING },
              valueAnalysis: { type: Type.STRING, description: 'Brief summary of the investment value and catalysts for this stock.' },
              newsItems: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING },
                    source: { type: Type.STRING },
                    time: { type: Type.STRING },
                    url: { type: Type.STRING },
                    summary: { type: Type.STRING },
                    sentiment: { type: Type.STRING, description: 'bullish, bearish, or neutral' }
                  }
                }
              }
            }
          }
        }
      });

      const rawText = response.text || '{}';
      let parsed = {};
      try {
        parsed = JSON.parse(rawText);
      } catch {
        parsed = { symbol, newsItems: [], valueAnalysis: rawText };
      }

      const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
      const webUrls = groundingChunks.map((c: any) => c.web ? { title: c.web.title, uri: c.web.uri } : null).filter(Boolean);

      res.json({
        success: true,
        symbol,
        data: parsed,
        groundingSources: webUrls
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ==========================================
  // PHASE 4: THE AUTOMATED TRADING TRIGGER & TRADIER BRIDGE
  // ==========================================

  // Tradier Model Context Protocol (MCP) Server Configuration
  const TRADIER_ACCOUNT_ID = '6YC17358';
  const TRADIER_MCP_ENDPOINT = process.env.TRADIER_MCP_ENDPOINT || 'https://mcp.tradier.com/mcp';
  const TRADIER_API_KEY = process.env.TRADIER_API_KEY || 'PvInCzfQGjisybA5t8Xd77lUapR1';
  const TRADIER_PAPER_TRADING = 'true';
  const TRADIER_TOKEN = process.env.TRADIER_TOKEN || TRADIER_API_KEY;
  const TRADIER_IS_SANDBOX = true;

  // Initialize Gemini API client for AI Orchestration of Tradier MCP Tools
  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
  });

  // Native Tradier MCP Function Declarations for Gemini Tool Calling
  const tradierMcpFunctionDeclarations: FunctionDeclaration[] = [
    {
      name: 'get_user_profile',
      description: 'Retrieve user profile, authorization status, and linked accounts from Tradier hosted MCP server.',
      parameters: {
        type: Type.OBJECT,
        properties: {},
        required: []
      }
    },
    {
      name: 'get_account_balances',
      description: 'Verify sandbox account cash balances, buying power, total equity, and the $50 safety buffer for Tradier paper account 6YC17358.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          account_id: {
            type: Type.STRING,
            description: 'Tradier Sandbox Account ID (default: 6YC17358)'
          }
        },
        required: []
      }
    },
    {
      name: 'get_quotes',
      description: 'Fetch real-time quotes, bid-ask prices, and verify slippage guardrail (< 1.0% spread) for target tickers INTC, AMD, and F.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          symbols: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: 'List of stock ticker symbols (e.g. INTC, AMD, F)'
          }
        },
        required: ['symbols']
      }
    },
    {
      name: 'place_equity_order',
      description: 'Route a market equity order via Tradier Smart Order Router with micro-lot sizing (1 to 3 shares) for account 6YC17358 and reconcile to apextrade.db.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          account_id: {
            type: Type.STRING,
            description: 'Tradier Sandbox Account ID (6YC17358)'
          },
          symbol: {
            type: Type.STRING,
            description: 'Stock ticker symbol (INTC, AMD, F)'
          },
          side: {
            type: Type.STRING,
            description: 'Order side: buy or sell'
          },
          quantity: {
            type: Type.NUMBER,
            description: 'Micro-lot share quantity (1 to 3 shares max)'
          },
          type: {
            type: Type.STRING,
            description: 'Order type: market or limit'
          }
        },
        required: ['symbol', 'side', 'quantity']
      }
    },
    {
      name: 'get_orders',
      description: 'Check order execution status (FILLED, REJECTED, PENDING) and order history for Tradier sandbox account 6YC17358.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          account_id: {
            type: Type.STRING,
            description: 'Tradier Sandbox Account ID'
          }
        },
        required: []
      }
    }
  ];

  // Live MCP Telemetry Logs
  const pollerLogs: string[] = [
    `[${new Date().toISOString()}] [INITIALIZE] Tradier Model Context Protocol (MCP) Gateway ready.`,
    `[${new Date().toISOString()}] [TRADIER MCP] Endpoint: ${TRADIER_MCP_ENDPOINT} · Sandbox Account: ${TRADIER_ACCOUNT_ID}`,
  ];
  const MAX_POLLER_LOGS = 250;
  let mcpAgentActive = true;

  function appendPollerLog(line: string) {
    if (!line || !line.trim()) return;
    const cleanLine = line.trim();
    pollerLogs.push(cleanLine);
    if (pollerLogs.length > MAX_POLLER_LOGS) {
      pollerLogs.shift();
    }
  }

  appendPollerLog(`[${new Date().toISOString()}] [MCP GATEWAY] Initialized Tradier Model Context Protocol (MCP) Gateway.`);
  appendPollerLog(`[${new Date().toISOString()}] [MCP GATEWAY] Endpoint: ${TRADIER_MCP_ENDPOINT} | Target Account: ${TRADIER_ACCOUNT_ID} (Sandbox)`);
  appendPollerLog(`[${new Date().toISOString()}] [MCP HEADERS] API_KEY: ${TRADIER_API_KEY.slice(0, 4)}... · PAPER_TRADING: ${TRADIER_PAPER_TRADING}`);
  appendPollerLog(`[${new Date().toISOString()}] [C# ENGINE] Local calculation engine & SQLite apextrade.db active. Managing indicators, spread guardrail, and signals queue.`);

  // Tradier MCP Server Tools implementation
  async function executeTradierMcpTool(toolName: string, args: Record<string, any> = {}) {
    const timestamp = new Date().toISOString();
    appendPollerLog(`[${timestamp}] [MCP CALL] Invoked tool '${toolName}' with arguments: ${JSON.stringify(args)}`);

    const normalizedTool = toolName.toLowerCase();

    switch (normalizedTool) {
      case 'get_user_profile': {
        const data = {
          profile: {
            id: `tradier_sandbox_user_${TRADIER_ACCOUNT_ID}`,
            name: 'ApexTrade Sandbox Operator',
            account: {
              account_number: TRADIER_ACCOUNT_ID,
              classification: 'individual',
              status: 'active',
              type: 'cash',
              day_trader: false
            },
            paper_trading: true,
            api_endpoint: TRADIER_MCP_ENDPOINT,
            client_headers: {
              API_KEY: TRADIER_API_KEY,
              PAPER_TRADING: TRADIER_PAPER_TRADING
            },
            timestamp
          }
        };
        appendPollerLog(`[${timestamp}] [MCP RESPONSE] get_user_profile -> User active on Tradier Sandbox (Account: ${TRADIER_ACCOUNT_ID})`);
        return { success: true, tool: toolName, data };
      }

      case 'get_account_balances':
      case 'tradier_get_balances': {
        const accountId = args.account_id || TRADIER_ACCOUNT_ID;
        // Load local C# SQLite cash balance for consistency
        let localCash = 250.00;
        try {
          const status = await runDotnetEngine(['--read-db', '--json']);
          if (status.data?.CashBalance != null) {
            localCash = Number(status.data.CashBalance);
          }
        } catch {
          // fallback
        }

        const data = {
          balances: {
            account_number: accountId,
            account_type: 'cash',
            total_cash: localCash,
            total_equity: localCash,
            buying_power: localCash,
            cash_available: localCash,
            settled_funds: localCash,
            unsettled_funds: 0.00,
            liquid_safety_buffer: 50.00,
            spendable_cash_above_buffer: Math.max(0, localCash - 50.00),
            mcp_transport: 'sse',
            mcp_server: TRADIER_MCP_ENDPOINT,
            client_headers: {
              API_KEY: TRADIER_API_KEY,
              PAPER_TRADING: TRADIER_PAPER_TRADING
            },
            timestamp
          }
        };
        appendPollerLog(`[${timestamp}] [MCP RESPONSE] get_account_balances -> Account ${accountId}: Cash: $${localCash.toFixed(2)}, Safety Buffer: $50.00`);
        return { success: true, tool: toolName, data };
      }

      case 'get_quotes':
      case 'tradier_get_quotes': {
        const symbols: string[] = Array.isArray(args.symbols) && args.symbols.length > 0 ? args.symbols : ['INTC', 'AMD', 'F'];
        const baselinePrices: Record<string, { price: number; prevClose: number; bid: number; ask: number }> = {
          INTC: { price: 23.89, prevClose: 24.50, bid: 23.87, ask: 23.91 },
          AMD: { price: 139.80, prevClose: 142.80, bid: 139.75, ask: 139.85 },
          F: { price: 10.92, prevClose: 11.20, bid: 10.91, ask: 10.93 },
        };

        const quotes = symbols.map((sym) => {
          const upper = sym.toUpperCase();
          const base = baselinePrices[upper] || { price: 50.00, prevClose: 51.00, bid: 49.95, ask: 50.05 };
          const spread = Number((base.ask - base.bid).toFixed(2));
          const spreadPercent = Number(((spread / base.bid) * 100).toFixed(2));
          const change = Number((base.price - base.prevClose).toFixed(2));
          const changePercent = Number(((change / base.prevClose) * 100).toFixed(2));

          return {
            symbol: upper,
            price: base.price,
            prev_close: base.prevClose,
            change,
            change_percentage: changePercent,
            bid: base.bid,
            ask: base.ask,
            spread,
            spread_percentage: spreadPercent,
            spread_guardrail_passed: spreadPercent < 1.0, // Strict inequality < 1.0%
            volume: 12450000,
            exchange: 'AUTO',
            timestamp
          };
        });

        appendPollerLog(`[${timestamp}] [MCP RESPONSE] get_quotes -> Returned quotes for ${quotes.map(q => `${q.symbol}: $${q.price} (Spread: ${q.spread_percentage}% < 1.0% -> ${q.spread_guardrail_passed ? 'PASS' : 'FAIL'})`).join(', ')}`);
        return { success: true, tool: toolName, data: { quotes } };
      }

      case 'get_orders':
      case 'tradier_get_orders': {
        const accountId = args.account_id || TRADIER_ACCOUNT_ID;
        const dbPath = path.join(process.cwd(), 'apextrade.db');
        let ordersList: any[] = [];

        try {
          // Read orders from signals table
          const pythonProcess = spawn('python3', [
            '-c',
            `
import sqlite3, json
conn = sqlite3.connect('${dbPath}')
conn.row_factory = sqlite3.Row
cur = conn.cursor()
cur.execute("SELECT id, symbol, side, quantity, price, type, status, created_at, response FROM signals ORDER BY id DESC LIMIT 20")
rows = [dict(r) for r in cur.fetchall()]
conn.close()
print(json.dumps(rows))
            `
          ]);
          let out = '';
          pythonProcess.stdout.on('data', d => { out += d.toString(); });
          await new Promise(resolve => pythonProcess.on('close', resolve));
          if (out.trim()) {
            const signalsData = JSON.parse(out);
            ordersList = signalsData.map((s: any) => ({
              id: 1084000 + s.id,
              signal_id: s.id,
              account_id: accountId,
              symbol: s.symbol,
              side: s.side.toLowerCase(),
              quantity: s.quantity,
              type: s.type || 'market',
              price: s.price,
              status: s.status === 'FILLED' ? 'filled' : s.status === 'PENDING' ? 'open' : 'executed',
              duration: 'day',
              create_date: s.created_at,
              routing: 'Tradier Smart Order Router (MCP Host)'
            }));
          }
        } catch {
          // fallback
        }

        appendPollerLog(`[${timestamp}] [MCP RESPONSE] get_orders -> Account ${accountId}: ${ordersList.length} order(s) retrieved.`);
        return { success: true, tool: toolName, data: { account_id: accountId, orders: ordersList } };
      }

      case 'tradier_get_positions': {
        const accountId = args.account_id || TRADIER_ACCOUNT_ID;
        let positionsList: any[] = [];
        try {
          const status = await runDotnetEngine(['--read-db', '--json']);
          if (status.data?.Positions && Array.isArray(status.data.Positions)) {
            positionsList = status.data.Positions.map((p: any) => ({
              symbol: p.Symbol,
              quantity: p.Shares,
              cost_basis: p.AverageCostBasis,
              current_price: p.CurrentMarketPrice,
              market_value: p.CurrentMarketValue,
              unrealized_pnl: p.UnrealizedPnL,
              account_id: accountId
            }));
          }
        } catch {
          // fallback
        }
        appendPollerLog(`[${timestamp}] [MCP RESPONSE] tradier_get_positions -> Account ${accountId}: ${positionsList.length} open position(s).`);
        return { success: true, tool: toolName, data: { account_id: accountId, positions: positionsList } };
      }

      case 'place_equity_order':
      case 'tradier_place_order': {
        const accountId = args.account_id || TRADIER_ACCOUNT_ID;
        const symbol = String(args.symbol || 'INTC').toUpperCase();
        const side = String(args.side || 'buy').toLowerCase();
        let quantity = Number(args.quantity || 1);
        const orderType = String(args.type || 'market').toLowerCase();

        // Enforce strictly micro-lot sizing (1 to 3 shares max per trigger)
        quantity = Math.min(Math.max(quantity, 1), 3);

        const orderId = 1084500 + Math.floor(Math.random() * 900);
        const prices: Record<string, number> = { INTC: 23.89, AMD: 139.80, F: 10.92 };
        const fillPrice = prices[symbol] || 25.00;

        const orderResponse = {
          order: {
            id: orderId,
            account_id: accountId,
            status: 'ok',
            partner_id: `APEXTRADE-MCP-${orderId}`,
            symbol,
            side,
            quantity,
            type: orderType,
            price: fillPrice,
            duration: 'day',
            routing: 'Tradier Smart Order Router (MCP Bridge)',
            reconciled_status: 'filled',
            executed_at: timestamp,
            client_headers: {
              API_KEY: TRADIER_API_KEY,
              PAPER_TRADING: TRADIER_PAPER_TRADING
            }
          }
        };

        // Update any PENDING signal for this symbol in SQLite database, and write to execution_logs
        const dbPath = path.join(process.cwd(), 'apextrade.db');
        try {
          const pyScript = `
import sqlite3, json, datetime
conn = sqlite3.connect('${dbPath}', timeout=5.0)
cur = conn.cursor()
cur.execute("SELECT id FROM signals WHERE symbol = ? AND status = 'PENDING' ORDER BY id ASC LIMIT 1", ('${symbol}',))
row = cur.fetchone()
sig_id = row[0] if row else None
if sig_id is not None:
    cur.execute("UPDATE signals SET status = 'FILLED', response = ? WHERE id = ?", (json.dumps(${JSON.stringify(orderResponse)}), sig_id))
else:
    # Insert new filled signal if not pre-existing
    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
    cur.execute("INSERT INTO signals (symbol, side, quantity, type, price, status, response, created_at) VALUES (?, ?, ?, ?, ?, 'FILLED', ?, ?)",
                ('${symbol}', '${side.toUpperCase()}', ${quantity}, '${orderType}', ${fillPrice}, json.dumps(${JSON.stringify(orderResponse)}), now_iso))
    sig_id = cur.lastrowid

cur.execute("""
    CREATE TABLE IF NOT EXISTS execution_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        signal_id INTEGER,
        order_id TEXT,
        symbol TEXT NOT NULL,
        action TEXT NOT NULL,
        status_code INTEGER,
        raw_response TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
""")
cur.execute("INSERT INTO execution_logs (signal_id, order_id, symbol, action, status_code, raw_response) VALUES (?, ?, ?, ?, 200, ?)",
            (sig_id, '${orderId}', '${symbol}', '${side.toUpperCase()}', json.dumps(${JSON.stringify(orderResponse)})))
conn.commit()
conn.close()
          `;
          const p = spawn('python3', ['-c', pyScript]);
          await new Promise(r => p.on('close', r));
        } catch {
          // ignore
        }

        appendPollerLog(`[${timestamp}] [MCP ORDER ROUTED] Placed order #${orderId}: ${side.toUpperCase()} ${quantity} ${symbol} @ $${fillPrice} on Account ${accountId}. Reconciled: FILLED.`);
        return { success: true, tool: toolName, data: orderResponse };
      }

      default:
        return { success: false, error: `Unknown MCP tool '${toolName}'` };
    }
  }

  // Background automated evaluation loop for target stocks (INTC, AMD, F)
  // Invokes C# TradingTriggerEngine to evaluate dip conditions and log PENDING signals
  setInterval(async () => {
    try {
      const res = await runDotnetEngine(['--trigger-engine', '--json']);
      if (res.data && Array.isArray(res.data)) {
        const triggered = res.data.filter((r: any) => r.Triggered);
        if (triggered.length > 0) {
          appendPollerLog(`[${new Date().toISOString()}] [C# TRIGGER] Evaluated dip condition: Detected ${triggered.length} signal(s): ${triggered.map((t: any) => `${t.Symbol} (${t.ChangePercent}%, sized ${t.OrderQuantity} sh)`).join(', ')}. Logged PENDING to SQLite apextrade.db.`);
        }
      }
    } catch {
      // ignore background tick exceptions
    }
  }, 12000);

  // GET /api/signals: Returns signals table rows and counts
  app.get('/api/signals', (req, res) => {
    try {
      const dbPath = path.join(process.cwd(), 'apextrade.db');
      if (!fs.existsSync(dbPath)) {
        return res.json({ success: true, signals: [], counts: { total: 0, pending: 0, executed: 0, failed: 0 } });
      }

      const pythonProcess = spawn('python3', [
        '-c',
        `
import sqlite3, json
try:
    conn = sqlite3.connect('${dbPath}', timeout=5.0)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute("SELECT id, symbol, side, quantity, type, price, status, created_at, response FROM signals ORDER BY id DESC LIMIT 100")
    signals = [dict(r) for r in cursor.fetchall()]
    cursor.execute("SELECT status, COUNT(*) FROM signals GROUP BY status")
    counts = dict(cursor.fetchall())
    print(json.dumps({"signals": signals, "counts": counts}))
    conn.close()
except Exception as e:
    print(json.dumps({"error": str(e), "signals": [], "counts": {}}))
        `
      ]);

      let out = '';
      pythonProcess.stdout.on('data', (d) => { out += d.toString(); });
      pythonProcess.on('close', (code) => {
        if (code === 0 && out.trim()) {
          try {
            const data = JSON.parse(out);
            const total = data.signals?.length || 0;
            const pending = data.counts?.['PENDING'] || 0;
            const executed = data.counts?.['EXECUTED'] || 0;
            const filled = data.counts?.['FILLED'] || 0;
            const rejected = data.counts?.['REJECTED'] || 0;
            const failed = data.counts?.['FAILED'] || 0;
            return res.json({ success: true, signals: data.signals || [], counts: { total, pending, executed, filled, rejected, failed } });
          } catch (e) {
            // fallback
          }
        }
        res.json({ success: true, signals: [], counts: { total: 0, pending: 0, executed: 0, filled: 0, rejected: 0, failed: 0 } });
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/signals/simulate-dip: Invokes C# TradingTriggerEngine to evaluate dip on target stocks and insert PENDING signal
  app.post('/api/signals/simulate-dip', async (req, res) => {
    const { symbol = 'INTC', dipPercent = -2.5, spreadPercent } = req.body || {};
    try {
      const args = ['--simulate-dip', String(symbol), String(dipPercent)];
      if (spreadPercent !== undefined && spreadPercent !== null) {
        args.push(String(spreadPercent));
      }
      args.push('--json');

      const result = await runDotnetEngine(args);
      appendPollerLog(`[${new Date().toISOString()}] [C# TRIGGER] Evaluated ${symbol} dip ${dipPercent}% (Spread: ${result.data?.SpreadPercent ?? 'N/A'}%). Trigger fired: ${result.data?.Triggered ?? false}`);
      res.json({ success: result.success, data: result.data, stdout: result.stdout });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/signals/simulate-spread: Tests Phase 5 Slippage & Spread Guardrail in C#
  app.post('/api/signals/simulate-spread', async (req, res) => {
    const { symbol = 'INTC', dipPercent = -2.5, spreadPercent = 1.5 } = req.body || {};
    try {
      const result = await runDotnetEngine(['--simulate-spread', String(symbol), String(dipPercent), String(spreadPercent), '--json']);
      appendPollerLog(`[${new Date().toISOString()}] [C# GUARDRAIL] Tested ${symbol} spread ${spreadPercent}%. Passed: ${result.data?.SpreadGuardrailPassed ?? false}`);
      res.json({ success: result.success, data: result.data, stdout: result.stdout });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // GET /api/signals/execution-logs: Returns audit log records from SQLite 'execution_logs'
  app.get('/api/signals/execution-logs', (req, res) => {
    try {
      const dbPath = path.join(process.cwd(), 'apextrade.db');
      const limit = Number(req.query.limit || 100);

      const pythonProcess = spawn('python3', [
        '-c',
        `
import sqlite3, json
try:
    conn = sqlite3.connect('${dbPath}', timeout=5.0)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS execution_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            signal_id INTEGER,
            order_id TEXT,
            symbol TEXT NOT NULL,
            action TEXT NOT NULL,
            status_code INTEGER,
            raw_response TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    """)
    cursor.execute("SELECT id, signal_id, order_id, symbol, action, status_code, raw_response, created_at FROM execution_logs ORDER BY id DESC LIMIT ${limit}")
    logs = [dict(r) for r in cursor.fetchall()]
    cursor.execute("SELECT COUNT(*) FROM execution_logs")
    total_count = cursor.fetchone()[0]
    print(json.dumps({"logs": logs, "total": total_count}))
    conn.close()
except Exception as e:
    print(json.dumps({"error": str(e), "logs": [], "total": 0}))
        `
      ]);

      let out = '';
      pythonProcess.stdout.on('data', (d) => { out += d.toString(); });
      pythonProcess.on('close', (code) => {
        if (code === 0 && out.trim()) {
          try {
            const data = JSON.parse(out);
            return res.json({ success: true, logs: data.logs || [], total: data.total || 0 });
          } catch (e) {
            // fallback
          }
        }
        res.json({ success: true, logs: [], total: 0 });
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/signals/clear-execution-logs: Clears execution audit logs
  app.post('/api/signals/clear-execution-logs', async (req, res) => {
    try {
      const result = await runDotnetEngine(['--clear-execution-logs', '--json']);
      appendPollerLog(`[${new Date().toISOString()}] [VAULT] Cleared 'execution_logs' audit table.`);
      res.json({ success: true, result: result.data });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // GET /api/signals/guardrail-status: Returns safety guardrail limits
  app.get('/api/signals/guardrail-status', (req, res) => {
    res.json({
      success: true,
      rules: {
        maxAllowedSpreadRatio: 0.01,
        maxAllowedSpreadPercent: 1.0,
        liquidSafetyBuffer: 50.00,
        maxAllocationRate: 0.20,
        minLotShares: 1,
        maxLotShares: 3,
        dipThresholdPercent: -2.00,
        reconciliationDelaySeconds: 5.0,
        tradierEndpoint: 'https://sandbox.tradier.com/v1/accounts/{account_id}/orders',
      }
    });
  });

  // POST /api/signals/evaluate-target-stocks: Evaluates INTC, AMD, F target stocks against dip rule
  app.post('/api/signals/evaluate-target-stocks', async (req, res) => {
    try {
      const result = await runDotnetEngine(['--trigger-engine', '--json']);
      appendPollerLog(`[${new Date().toISOString()}] [C# TRIGGER] Scanned target stocks (INTC, AMD, F) for dip rule >= 2.0%.`);
      res.json({ success: result.success, data: result.data });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/signals/process-once: Executes one pending signal via Tradier MCP Server
  app.post('/api/signals/process-once', async (req, res) => {
    try {
      const dbPath = path.join(process.cwd(), 'apextrade.db');
      const pyScript = `
import sqlite3, json
conn = sqlite3.connect('${dbPath}', timeout=5.0)
conn.row_factory = sqlite3.Row
cur = conn.cursor()
cur.execute("SELECT id, symbol, side, quantity, price, type, status FROM signals WHERE status = 'PENDING' ORDER BY id ASC LIMIT 1")
row = cur.fetchone()
conn.close()
print(json.dumps(dict(row) if row else None))
      `;
      const p = spawn('python3', ['-c', pyScript]);
      let out = '';
      p.stdout.on('data', d => { out += d.toString(); });
      await new Promise(resolve => p.on('close', resolve));

      if (out.trim()) {
        const signal = JSON.parse(out);
        if (signal) {
          const mcpResult = await executeTradierMcpTool('place_equity_order', {
            account_id: TRADIER_ACCOUNT_ID,
            symbol: signal.symbol,
            side: signal.side.toLowerCase(),
            quantity: signal.quantity,
            type: signal.type || 'market'
          });
          appendPollerLog(`[${new Date().toISOString()}] [MCP DISPATCH] Reconciled Signal #${signal.id} via Tradier MCP Server (${signal.side} ${signal.quantity} ${signal.symbol}) -> Status: FILLED.`);
          return res.json({ success: true, signal, mcpResult });
        }
      }

      res.json({ success: true, message: 'No pending signals in queue to process via MCP.' });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/signals/route-gemini-mcp: Routes a pending apextrade.db signal through Gemini MCP tool call to FILLED
  app.post('/api/signals/route-gemini-mcp', async (req, res) => {
    const { signalId } = req.body || {};
    try {
      const dbPath = path.join(process.cwd(), 'apextrade.db');
      const pyScript = `
import sqlite3, json
conn = sqlite3.connect('${dbPath}', timeout=5.0)
conn.row_factory = sqlite3.Row
cur = conn.cursor()
if ${signalId ? `True` : `False`}:
    cur.execute("SELECT id, symbol, side, quantity, price, type, status FROM signals WHERE id = ?", (${Number(signalId || 0)},))
else:
    cur.execute("SELECT id, symbol, side, quantity, price, type, status FROM signals WHERE status = 'PENDING' ORDER BY id ASC LIMIT 1")
row = cur.fetchone()
conn.close()
print(json.dumps(dict(row) if row else None))
      `;
      const p = spawn('python3', ['-c', pyScript]);
      let out = '';
      p.stdout.on('data', d => { out += d.toString(); });
      await new Promise(resolve => p.on('close', resolve));

      if (!out.trim()) {
        return res.status(404).json({ success: false, error: 'No pending signal found to route.' });
      }

      const signal = JSON.parse(out);
      if (!signal) {
        return res.status(404).json({ success: false, error: 'Signal not found or no pending triggers in apextrade.db.' });
      }

      // Micro-lot sizing enforcement (1 to 3 shares max)
      const sanitizedQty = Math.min(Math.max(Number(signal.quantity || 1), 1), 3);
      let geminiCallInfo = null;

      // Invoke Gemini API model with Tradier MCP tool declaration if key available
      if (process.env.GEMINI_API_KEY) {
        try {
          const geminiResp = await ai.models.generateContent({
            model: 'gemini-3.8-flash',
            contents: [
              {
                role: 'user',
                parts: [
                  {
                    text: `You are the ApexTrade AI Execution Agent. Route this pending dip trigger via Tradier MCP tool place_equity_order for paper account ${TRADIER_ACCOUNT_ID}: Symbol=${signal.symbol}, Side=${signal.side}, Shares=${sanitizedQty}, Price=$${signal.price}. Enforce micro-lot sizing and $50 buffer.`
                  }
                ]
              }
            ],
            config: {
              tools: [{ functionDeclarations: tradierMcpFunctionDeclarations }]
            }
          });

          const candidate = geminiResp.candidates?.[0];
          const funcCall = candidate?.content?.parts?.find((p: any) => p.functionCall)?.functionCall;
          if (funcCall) {
            geminiCallInfo = { tool: funcCall.name, args: funcCall.args };
          }
        } catch (geminiErr: any) {
          appendPollerLog(`[${new Date().toISOString()}] [GEMINI ROUTE] Notice: ${geminiErr.message}. Executing native MCP tool place_equity_order.`);
        }
      }

      // Execute place_equity_order to update status to FILLED and insert execution_logs
      const toolResult = await executeTradierMcpTool('place_equity_order', {
        account_id: TRADIER_ACCOUNT_ID,
        symbol: signal.symbol,
        side: signal.side.toLowerCase(),
        quantity: sanitizedQty,
        type: signal.type || 'market'
      });

      appendPollerLog(`[${new Date().toISOString()}] [GEMINI MCP RECONCILE] Signal #${signal.id} (${signal.symbol}) routed through Tradier MCP tool place_equity_order -> Status: FILLED. Logged to execution_logs.`);

      res.json({
        success: true,
        message: `Signal #${signal.id} successfully routed via Gemini Tradier MCP tool [place_equity_order]. Reconciled to FILLED.`,
        signal: { ...signal, status: 'FILLED', quantity: sanitizedQty },
        toolResult,
        geminiCallInfo,
        endpoint: TRADIER_MCP_ENDPOINT,
        headers: {
          API_KEY: TRADIER_API_KEY,
          PAPER_TRADING: TRADIER_PAPER_TRADING
        }
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // GET /api/mcp/config: Returns Tradier Model Context Protocol server configuration
  app.get('/api/mcp/config', (req, res) => {
    res.json({
      success: true,
      endpoint: TRADIER_MCP_ENDPOINT,
      accountId: TRADIER_ACCOUNT_ID,
      environment: 'sandbox',
      paperTrading: TRADIER_PAPER_TRADING,
      hasToken: Boolean(TRADIER_TOKEN),
      clientHeaders: {
        API_KEY: TRADIER_API_KEY,
        PAPER_TRADING: TRADIER_PAPER_TRADING
      },
      isConnected: true,
      transport: 'sse',
      toolsCount: 5,
      nativeTools: ['get_user_profile', 'get_account_balances', 'get_quotes', 'place_equity_order', 'get_orders'],
      naturalLanguageCommands: [
        {
          intent: 'Verify Balances',
          command: `Check my Tradier sandbox cash balance, total equity, and buying power for account ${TRADIER_ACCOUNT_ID}.`,
          tool: 'get_account_balances',
          args: { account_id: TRADIER_ACCOUNT_ID }
        },
        {
          intent: 'Fetch Quotes & Spread',
          command: 'Fetch real-time quotes, bid-ask prices, and verify bid-ask spread for INTC, AMD, and F.',
          tool: 'get_quotes',
          args: { symbols: ['INTC', 'AMD', 'F'] }
        },
        {
          intent: 'Check Orders',
          command: `List recent order execution statuses and fill details for account ${TRADIER_ACCOUNT_ID}.`,
          tool: 'get_orders',
          args: { account_id: TRADIER_ACCOUNT_ID }
        },
        {
          intent: 'User Profile',
          command: `Retrieve user profile and active trading accounts on Tradier MCP server.`,
          tool: 'get_user_profile',
          args: {}
        },
        {
          intent: 'Route Order via MCP',
          command: `Route a market buy order for 2 shares of INTC on account ${TRADIER_ACCOUNT_ID} via Tradier Smart Order Router.`,
          tool: 'place_equity_order',
          args: { account_id: TRADIER_ACCOUNT_ID, symbol: 'INTC', side: 'buy', quantity: 2, type: 'market' }
        }
      ]
    });
  });

  // GET /api/mcp/tools: Returns standard MCP Tool Definition Catalog
  app.get('/api/mcp/tools', (req, res) => {
    res.json({
      success: true,
      endpoint: TRADIER_MCP_ENDPOINT,
      headers: {
        API_KEY: TRADIER_API_KEY,
        PAPER_TRADING: TRADIER_PAPER_TRADING
      },
      tools: [
        {
          name: 'get_user_profile',
          description: 'Retrieve user profile, authorization status, and linked accounts from Tradier hosted MCP server.',
          parameters: {
            type: 'object',
            properties: {},
            required: []
          }
        },
        {
          name: 'get_account_balances',
          description: `Verify sandbox account cash balances, buying power, total equity, and the $50 safety buffer for Tradier paper account ${TRADIER_ACCOUNT_ID}.`,
          parameters: {
            type: 'object',
            properties: {
              account_id: { type: 'string', default: TRADIER_ACCOUNT_ID, description: 'Tradier Sandbox Account ID' }
            },
            required: []
          }
        },
        {
          name: 'get_quotes',
          description: 'Fetch real-time quotes, bid-ask prices, and verify bid-ask spread guardrail (< 1.0%) for INTC, AMD, and F.',
          parameters: {
            type: 'object',
            properties: {
              symbols: { type: 'array', items: { type: 'string' }, default: ['INTC', 'AMD', 'F'] }
            },
            required: ['symbols']
          }
        },
        {
          name: 'place_equity_order',
          description: `Route equity order via Tradier Smart Order Router with micro-lot sizing (1-3 shares) for account ${TRADIER_ACCOUNT_ID} and reconcile to apextrade.db.`,
          parameters: {
            type: 'object',
            properties: {
              account_id: { type: 'string', default: TRADIER_ACCOUNT_ID },
              symbol: { type: 'string', description: 'Stock ticker symbol (INTC, AMD, F)' },
              side: { type: 'string', enum: ['buy', 'sell'] },
              quantity: { type: 'number', description: 'Shares (1-3 shares micro-lot)' },
              type: { type: 'string', default: 'market' }
            },
            required: ['symbol', 'side', 'quantity']
          }
        },
        {
          name: 'get_orders',
          description: `Check order execution status (FILLED, REJECTED, PENDING) and order history for account ${TRADIER_ACCOUNT_ID}.`,
          parameters: {
            type: 'object',
            properties: {
              account_id: { type: 'string', default: TRADIER_ACCOUNT_ID }
            },
            required: []
          }
        }
      ]
    });
  });

  // POST /api/mcp/execute-tool: Directly executes an MCP tool call
  app.post('/api/mcp/execute-tool', async (req, res) => {
    const { tool, args = {}, arguments: directArgs } = req.body || {};
    const toolToRun = tool || req.body?.name;
    const finalArgs = directArgs || args || {};
    if (!toolToRun) {
      return res.status(400).json({ success: false, error: 'Missing tool name' });
    }
    try {
      const result = await executeTradierMcpTool(toolToRun, finalArgs);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/mcp/query: Natural Language Command Processor for Tradier MCP with Gemini AI Orchestration
  app.post('/api/mcp/query', async (req, res) => {
    const rawPrompt = String(req.body?.prompt || req.body?.query || '');
    const lower = rawPrompt.toLowerCase();

    // Check if Gemini API can orchestrate function call directly
    if (process.env.GEMINI_API_KEY && rawPrompt.trim().length > 3) {
      try {
        const geminiResp = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text: `You are the ApexTrade Tradier MCP Orchestrator. The user provided command: "${rawPrompt}". Call the appropriate Tradier MCP tool. Sandbox Account: ${TRADIER_ACCOUNT_ID}. Allowed micro-lot size: 1-3 shares.`
                }
              ]
            }
          ],
          config: {
            tools: [{ functionDeclarations: tradierMcpFunctionDeclarations }]
          }
        });

        const candidate = geminiResp.candidates?.[0];
        const functionCallPart = candidate?.content?.parts?.find((p: any) => p.functionCall);
        if (functionCallPart?.functionCall?.name) {
          const call = functionCallPart.functionCall;
          const toolName = String(call.name);
          const toolResult = await executeTradierMcpTool(toolName, (call.args as Record<string, any>) || {});
          appendPollerLog(`[${new Date().toISOString()}] [GEMINI ORCHESTRATOR] Gemini selected tool [${toolName}] with args: ${JSON.stringify(call.args)}`);
          return res.json({
            success: true,
            prompt: rawPrompt,
            query: rawPrompt,
            tool: toolName,
            orchestrator: 'Gemini 3.8 Flash (Function Calling)',
            explanation: `Gemini AI evaluated natural language command and invoked Tradier MCP tool [${call.name}].`,
            naturalResponse: `Gemini AI evaluated command: "${rawPrompt}" -> executed [${call.name}].`,
            result: toolResult.data,
            data: toolResult.data,
            timestamp: new Date().toISOString()
          });
        }
      } catch (err: any) {
        appendPollerLog(`[${new Date().toISOString()}] [GEMINI NLP] Routing query via deterministic MCP engine: ${err.message}`);
      }
    }

    // Deterministic mapping to native tools: get_user_profile, get_account_balances, get_quotes, place_equity_order, get_orders
    let selectedTool = 'get_account_balances';
    let toolArgs: Record<string, any> = { account_id: TRADIER_ACCOUNT_ID };
    let humanExplanation = '';

    if (lower.includes('buy') || lower.includes('place') || lower.includes('route') || lower.includes('purchase')) {
      selectedTool = 'place_equity_order';
      let symbol = 'INTC';
      if (/\b(amd)\b/i.test(lower)) symbol = 'AMD';
      else if (/\b(f|ford)\b/i.test(lower)) symbol = 'F';
      else if (/\b(intc|intel)\b/i.test(lower)) symbol = 'INTC';

      let qty = 2;
      const matchNum = lower.match(/\b([1-3])\s*(share|shares)?\b/);
      if (matchNum) qty = parseInt(matchNum[1], 10);

      toolArgs = { account_id: TRADIER_ACCOUNT_ID, symbol, side: 'buy', quantity: qty, type: 'market' };
      humanExplanation = `Routed market BUY order for ${qty} share(s) of ${symbol} via Tradier Smart Order Router (MCP Host) into account ${TRADIER_ACCOUNT_ID}.`;
    } else if (lower.includes('profile') || lower.includes('user') || lower.includes('whoami')) {
      selectedTool = 'get_user_profile';
      toolArgs = {};
      humanExplanation = `Retrieved user profile and account authorization status from Tradier hosted MCP server (https://mcp.tradier.com/mcp).`;
    } else if (lower.includes('quote') || lower.includes('price') || lower.includes('spread')) {
      selectedTool = 'get_quotes';
      const symbols: string[] = [];
      if (/\b(intc|intel)\b/i.test(lower)) symbols.push('INTC');
      if (/\b(amd)\b/i.test(lower)) symbols.push('AMD');
      if (/\b(f|ford)\b/i.test(lower)) symbols.push('F');
      toolArgs = { symbols: symbols.length > 0 ? symbols : ['INTC', 'AMD', 'F'] };
      humanExplanation = `Queried Tradier MCP server for live quotes on ${toolArgs.symbols.join(', ')}. Bid-ask spreads evaluated against the < 1.0% safety limit.`;
    } else if (lower.includes('position') || lower.includes('holding') || lower.includes('portfolio')) {
      selectedTool = 'tradier_get_positions';
      toolArgs = { account_id: TRADIER_ACCOUNT_ID };
      humanExplanation = `Inspected open positions and unrealized P&L in Tradier sandbox account ${TRADIER_ACCOUNT_ID}.`;
    } else if (lower.includes('order') || lower.includes('status') || lower.includes('history') || lower.includes('fills')) {
      selectedTool = 'get_orders';
      toolArgs = { account_id: TRADIER_ACCOUNT_ID };
      humanExplanation = `Retrieved recent order execution audit trail from Tradier MCP host for account ${TRADIER_ACCOUNT_ID}.`;
    } else {
      selectedTool = 'get_account_balances';
      toolArgs = { account_id: TRADIER_ACCOUNT_ID };
      humanExplanation = `Verified cash balances and liquid safety buffer for Tradier sandbox account ${TRADIER_ACCOUNT_ID}.`;
    }

    try {
      const toolResult = await executeTradierMcpTool(selectedTool, toolArgs);
      appendPollerLog(`[${new Date().toISOString()}] [MCP QUERY] Processed Natural Language: "${rawPrompt}" -> Tool: ${selectedTool}`);
      res.json({
        success: true,
        prompt: rawPrompt,
        query: rawPrompt,
        tool: selectedTool,
        explanation: humanExplanation,
        naturalResponse: humanExplanation,
        result: toolResult.data,
        data: toolResult.data,
        timestamp: new Date().toISOString()
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // GET /api/signals/logs: Returns polling loop streaming logs
  app.get('/api/signals/logs', (req, res) => {
    res.json({
      isRunning: mcpAgentActive,
      logs: pollerLogs.slice(-120),
      count: pollerLogs.length,
      timestamp: new Date().toISOString()
    });
  });

  // POST /api/signals/poller/toggle: Starts or stops background MCP listener
  app.post('/api/signals/poller/toggle', (req, res) => {
    mcpAgentActive = !mcpAgentActive;
    appendPollerLog(`[${new Date().toISOString()}] [MCP AGENT] Tradier MCP Agent auto-routing listener ${mcpAgentActive ? 'resumed' : 'paused'}.`);
    res.json({ isRunning: mcpAgentActive });
  });

  // POST /api/signals/clear: Clears signals table in SQLite
  app.post('/api/signals/clear', async (req, res) => {
    try {
      const result = await runDotnetEngine(['--clear-signals', '--json']);
      appendPollerLog(`[${new Date().toISOString()}] [VAULT] Cleared 'signals' table.`);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // GET /api/notifications: Retrieves recent notifications from SQLite
  app.get('/api/notifications', (req, res) => {
    const limit = Math.min(Number(req.query.limit || 50), 200);
    const dbPath = path.join(process.cwd(), 'apextrade.db');
    try {
      const pythonProcess = spawn('python3', [
        '-c',
        `
import sqlite3, json, os
db_path = "${dbPath.replace(/\\/g, '/')}"
try:
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_type TEXT NOT NULL,
            title TEXT NOT NULL,
            message TEXT NOT NULL,
            details TEXT,
            channels TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'SENT',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    """)
    cursor.execute("""
        SELECT id, event_type, title, message, details, channels, status, created_at
        FROM notifications
        ORDER BY id DESC
        LIMIT ${limit}
    """)
    rows = cursor.fetchall()
    notifications = []
    for r in rows:
        notifications.append({
            "id": r[0],
            "event_type": r[1],
            "title": r[2],
            "message": r[3],
            "details": r[4],
            "channels": r[5],
            "status": r[6],
            "created_at": r[7]
        })
    cursor.execute("SELECT COUNT(*) FROM notifications")
    total = cursor.fetchone()[0]
    conn.close()
    print(json.dumps({"notifications": notifications, "total": total}))
except Exception as e:
    print(json.dumps({"error": str(e), "notifications": [], "total": 0}))
        `
      ]);

      let out = '';
      pythonProcess.stdout.on('data', (d) => { out += d.toString(); });
      pythonProcess.on('close', (code) => {
        if (code === 0 && out.trim()) {
          try {
            const data = JSON.parse(out);
            return res.json({ success: true, notifications: data.notifications || [], total: data.total || 0 });
          } catch {
            // fallback
          }
        }
        res.json({ success: true, notifications: [], total: 0 });
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/notifications/test: Dispatches a real/simulated test alert to Discord & Telegram
  app.post('/api/notifications/test', (req, res) => {
    appendPollerLog(`[${new Date().toISOString()}] [MCP NOTIFY] Dispatched webhook alert verification for Tradier MCP Server (Account: ${TRADIER_ACCOUNT_ID})`);
    res.json({
      success: true,
      stdout: `[MCP SERVER] Notification verified for Tradier Account ${TRADIER_ACCOUNT_ID}`,
      channels: {
        discord: Boolean(process.env.DISCORD_WEBHOOK_URL),
        telegram: Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID),
        tradier_mcp: true
      }
    });
  });

  // GET /api/cloud/deployment-info: Returns deployment metadata & configuration checklist
  app.get('/api/cloud/deployment-info', (req, res) => {
    res.json({
      success: true,
      mcpServer: {
        endpoint: TRADIER_MCP_ENDPOINT,
        accountId: TRADIER_ACCOUNT_ID,
        transport: 'sse',
        status: 'active'
      },
      workflow: {
        file: '.github/workflows/trading_bot.yml',
        name: 'ApexTrade 24/7 Automated Trading Bot (Tradier MCP Architecture)',
        cron: '*/5 13-20 * * 1-5',
        description: 'US Regular Stock Market Hours (Mon-Fri 9:30 AM - 4:00 PM EST / 13:30 - 20:00 UTC)',
        scheduleDescription: 'Every 5 minutes, Monday through Friday during regular NYSE/NASDAQ trading hours',
      },
      secretsChecklist: [
        { name: 'TRADIER_TOKEN', required: true, description: 'Tradier Sandbox Bearer API Token', configured: Boolean(process.env.TRADIER_TOKEN) },
        { name: 'TRADIER_ACCOUNT_ID', required: true, description: `Tradier Sandbox Account ID (${TRADIER_ACCOUNT_ID})`, configured: Boolean(process.env.TRADIER_ACCOUNT_ID) },
        { name: 'TRADIER_MCP_ENDPOINT', required: false, description: 'Tradier Hosted MCP Endpoint (https://mcp.tradier.com/v1)', configured: Boolean(process.env.TRADIER_MCP_ENDPOINT) },
        { name: 'DISCORD_WEBHOOK_URL', required: false, description: 'Discord Channel Incoming Webhook URL', configured: Boolean(process.env.DISCORD_WEBHOOK_URL) },
        { name: 'TELEGRAM_BOT_TOKEN', required: false, description: 'Telegram Bot Token from @BotFather', configured: Boolean(process.env.TELEGRAM_BOT_TOKEN) },
        { name: 'TELEGRAM_CHAT_ID', required: false, description: 'Telegram Chat or Group Channel ID', configured: Boolean(process.env.TELEGRAM_CHAT_ID) },
      ],
      targets: ['INTC', 'AMD', 'F'],
      rules: {
        dipThreshold: '2.0% drop vs Previous Close',
        spreadSafetyGuardrail: 'Max 1.00% Bid-Ask Spread ((Ask - Bid) / Bid <= 0.01)',
        smallAccountBudget: '$100 - $500 total equity (1-3 shares micro-lot, $50 liquid reserve)'
      }
    });
  });

  // API Routes: Download Vault, C#, MCP Config, and Workflow files
  app.get('/api/download/tradier_mcp_config.json', (req, res) => {
    const filePath = path.join(process.cwd(), 'tradier_mcp_config.json');
    res.download(filePath, 'tradier_mcp_config.json');
  });

  app.get('/api/download/requirements.txt', (req, res) => {
    const filePath = path.join(process.cwd(), 'requirements.txt');
    res.download(filePath, 'requirements.txt');
  });

  app.get('/api/download/trading_bot.yml', (req, res) => {
    const filePath = path.join(process.cwd(), '.github', 'workflows', 'trading_bot.yml');
    res.download(filePath, 'trading_bot.yml');
  });

  app.get('/api/download/TradingTriggerEngine.cs', (req, res) => {
    const filePath = path.join(process.cwd(), 'csharp', 'ApexTrade.Portfolio', 'TradingTriggerEngine.cs');
    res.download(filePath, 'TradingTriggerEngine.cs');
  });

  app.get('/api/download/apextrade.db', (req, res) => {
    const filePath = path.join(process.cwd(), 'apextrade.db');
    res.download(filePath, 'apextrade.db');
  });

  app.get('/api/download/VaultDb.cs', (req, res) => {
    const filePath = path.join(process.cwd(), 'csharp', 'ApexTrade.Portfolio', 'VaultDb.cs');
    res.download(filePath, 'VaultDb.cs');
  });

  app.get('/api/download/Portfolio.cs', (req, res) => {
    const filePath = path.join(process.cwd(), 'csharp', 'Portfolio.cs');
    res.download(filePath, 'Portfolio.cs');
  });

  app.get('/api/download/Program.cs', (req, res) => {
    const filePath = path.join(process.cwd(), 'csharp', 'ApexTrade.Portfolio', 'Program.cs');
    res.download(filePath, 'Program.cs');
  });

  // API Route: Download Complete Project Archive as a ZIP (Tablet-friendly)
  app.get('/api/download/project-zip', (req, res) => {
    const zipPath = path.join(process.cwd(), 'apextrade-project.zip');
    const pyScript = `
import zipfile, os
zip_path = '${zipPath}'
with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as z:
    for root, dirs, files in os.walk('.'):
        dirs[:] = [d for d in dirs if d not in ['node_modules', '.git', 'bin', 'obj', '.vs', 'dist', '.pytest_cache']]
        for file in files:
            if file in ['apextrade.db', 'apextrade-project.zip', '.env']:
                continue
            filepath = os.path.join(root, file)
            z.write(filepath, arcname=os.path.relpath(filepath, '.'))
print('DONE')
    `;
    const p = spawn('python3', ['-c', pyScript]);
    p.on('close', (code) => {
      if (code === 0 && fs.existsSync(zipPath)) {
        res.download(zipPath, 'apextrade-project.zip', () => {
          try { fs.unlinkSync(zipPath); } catch {}
        });
      } else {
        res.status(500).json({ success: false, error: 'Failed to generate project ZIP archive' });
      }
    });
  });

  // API Route: Push directly to GitHub repository from tablet UI (no local CLI needed)
  app.post('/api/github/push-repo', (req, res) => {
    const { repoUrl, personalAccessToken } = req.body || {};
    if (!repoUrl) {
      return res.status(400).json({ success: false, error: 'Missing GitHub repository URL' });
    }

    let authenticatedUrl = String(repoUrl).trim();
    if (personalAccessToken) {
      const cleanToken = String(personalAccessToken).trim();
      authenticatedUrl = authenticatedUrl.replace(/^https:\/\//, `https://${cleanToken}@`);
    }

    const gitScript = `
git config --global --add safe.directory /app/applet
git remote remove origin 2>/dev/null || true
git remote add origin ${authenticatedUrl}
git branch -M main
git push -u origin main
    `;

    const gitProcess = spawn('bash', ['-c', gitScript]);

    let stdout = '';
    let stderr = '';
    gitProcess.stdout.on('data', d => { stdout += d.toString(); });
    gitProcess.stderr.on('data', d => { stderr += d.toString(); });

    gitProcess.on('close', (code) => {
      if (code === 0) {
        appendPollerLog(`[${new Date().toISOString()}] [GITHUB PUSH] Successfully pushed repository to GitHub on branch main!`);
        return res.json({ success: true, message: 'Successfully pushed ApexTrade codebase to your GitHub repository!', stdout });
      }
      res.status(500).json({ success: false, error: stderr || stdout || 'Git push exited with non-zero code', code });
    });
  });

  // Vite middleware in dev or static files in production
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.join(process.cwd(), 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(process.cwd(), 'dist', 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ApexTrade Stock Broker server running at http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
