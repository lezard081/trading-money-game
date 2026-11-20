#!/usr/bin/env python3
"""
Stock Broker Application - Phase 1: Live Market Data Fetcher
A production-grade Python script to fetch real-time and historical stock prices
from free financial APIs with zero mandatory external dependencies (pure Python 3).

Supported Features:
- Real-time stock quotes (Price, Change, High, Low, Volume, 52-week High/Low, Prev Close)
- Multiple ticker queries in batch (e.g. AAPL MSFT NVDA TSLA)
- Historical OHLCV candle charts (intraday 1m/5m/15m/1h or daily/weekly/monthly)
- Rich CLI output with colored ANSI formatting, table view, or clean JSON / CSV
- Live continuous ticker watch mode (--watch)
- Reusable as a Python library: import fetch_stocks
"""

import sys
import os
import json
import time
import argparse
from datetime import datetime
from typing import List, Dict, Any, Optional
import urllib.request
import urllib.parse
import urllib.error

# Color codes for terminal formatting
class Colors:
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    CYAN = '\033[96m'
    BLUE = '\033[94m'
    BOLD = '\033[1m'
    DIM = '\033[2m'
    RESET = '\033[0m'
    BG_DARK = '\033[100m'

# Disable colors if output is piped or on Windows without ANSI
if not sys.stdout.isatty():
    for attr in dir(Colors):
        if not attr.startswith('__'):
            setattr(Colors, attr, '')

USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
]

class StockDataFetcher:
    """
    Fetches stock data using public financial market APIs (Yahoo Finance Chart v8).
    Requires no API keys or third-party packages.
    """

    def __init__(self, timeout: int = 10):
        self.timeout = timeout
        self.headers = {
            'User-Agent': USER_AGENTS[0],
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'en-US,en;q=0.9',
        }

    def _make_request(self, url: str) -> Dict[str, Any]:
        """Performs HTTP GET request with proper error handling and exponential retry."""
        retries = 2
        for attempt in range(retries + 1):
            try:
                req = urllib.request.Request(url, headers=self.headers)
                with urllib.request.urlopen(req, timeout=self.timeout) as response:
                    if response.status == 200:
                        raw_data = response.read().decode('utf-8')
                        return json.loads(raw_data)
                    else:
                        raise ValueError(f"HTTP Error {response.status}: {response.reason}")
            except urllib.error.HTTPError as e:
                if attempt == retries:
                    raise RuntimeError(f"HTTP {e.code} Error fetching data from {url}: {e.reason}")
                time.sleep(0.5 * (attempt + 1))
            except urllib.error.URLError as e:
                if attempt == retries:
                    raise RuntimeError(f"Network connection failed: {e.reason}")
                time.sleep(0.5 * (attempt + 1))
            except Exception as e:
                if attempt == retries:
                    raise RuntimeError(f"Unexpected error: {str(e)}")
                time.sleep(0.5 * (attempt + 1))
        raise RuntimeError("Failed to fetch data after retries")

    def get_quote(self, symbol: str) -> Dict[str, Any]:
        """
        Fetch real-time quote for a single stock ticker symbol.
        Returns a dictionary with comprehensive market metrics.
        """
        sym = symbol.strip().upper()
        # Query 1d range with 1m interval for latest live market price & session stats
        url = f"https://query1.finance.yahoo.com/v8/finance/chart/{urllib.parse.quote(sym)}?interval=1m&range=1d"
        
        try:
            data = self._make_request(url)
            chart = data.get('chart', {})
            error = chart.get('error')
            if error:
                return {
                    'symbol': sym,
                    'error': error.get('description', 'Unknown API error'),
                    'success': False
                }

            result_list = chart.get('result')
            if not result_list or len(result_list) == 0:
                return {
                    'symbol': sym,
                    'error': 'No market data returned for symbol',
                    'success': False
                }

            result = result_list[0]
            meta = result.get('meta', {})
            indicators = result.get('indicators', {})
            quote_data = indicators.get('quote', [{}])[0]
            
            # Extract prices
            current_price = meta.get('regularMarketPrice')
            prev_close = meta.get('chartPreviousClose') or meta.get('previousClose')
            
            # Fallback if regularMarketPrice is missing or None
            if current_price is None:
                closes = quote_data.get('close', [])
                valid_closes = [c for c in closes if c is not None]
                if valid_closes:
                    current_price = valid_closes[-1]

            if prev_close is None:
                prev_close = current_price

            change = 0.0
            change_percent = 0.0
            if current_price is not None and prev_close is not None and prev_close > 0:
                change = current_price - prev_close
                change_percent = (change / prev_close) * 100.0

            # High / Low / Volume from meta or quote points
            day_high = meta.get('regularMarketDayHigh')
            day_low = meta.get('regularMarketDayLow')
            volume = meta.get('regularMarketVolume')

            if day_high is None:
                highs = [h for h in quote_data.get('high', []) if h is not None]
                day_high = max(highs) if highs else current_price
            if day_low is None:
                lows = [l for l in quote_data.get('low', []) if l is not None]
                day_low = min(lows) if lows else current_price
            if volume is None:
                vols = [v for v in quote_data.get('volume', []) if v is not None]
                volume = sum(vols) if vols else 0

            # Timestamps
            market_time = meta.get('regularMarketTime')
            timestamp_str = datetime.fromtimestamp(market_time).strftime('%Y-%m-%d %H:%M:%S') if market_time else datetime.now().strftime('%Y-%m-%d %H:%M:%S')

            return {
                'success': True,
                'symbol': sym,
                'price': round(current_price, 2) if current_price else 0.0,
                'previous_close': round(prev_close, 2) if prev_close else 0.0,
                'change': round(change, 2),
                'change_percent': round(change_percent, 2),
                'day_high': round(day_high, 2) if day_high else None,
                'day_low': round(day_low, 2) if day_low else None,
                'fifty_two_week_high': meta.get('fiftyTwoWeekHigh'),
                'fifty_two_week_low': meta.get('fiftyTwoWeekLow'),
                'volume': volume,
                'currency': meta.get('currency', 'USD'),
                'exchange': meta.get('exchangeName', 'Unknown'),
                'instrument_type': meta.get('instrumentType', 'EQUITY'),
                'timestamp': timestamp_str,
                'market_state': meta.get('regularMarketTime') and 'CLOSED' if (time.time() - (meta.get('regularMarketTime') or 0)) > 86400 else 'ACTIVE',
                'data_source': 'Yahoo Finance (Real-Time / 15m Delayed)',
            }
        except Exception as e:
            return {
                'symbol': sym,
                'error': str(e),
                'success': False
            }

    def get_quotes(self, symbols: List[str]) -> List[Dict[str, Any]]:
        """Fetch quotes for multiple symbols."""
        results = []
        for symbol in symbols:
            results.append(self.get_quote(symbol))
        return results

    def get_history(self, symbol: str, interval: str = '1d', range_str: str = '1mo') -> Dict[str, Any]:
        """
        Fetch historical candle bars (OHLCV).
        Supported intervals: 1m, 2m, 5m, 15m, 30m, 60m, 90m, 1h, 1d, 5d, 1wk, 1mo
        Supported ranges: 1d, 5d, 1mo, 3mo, 6mo, 1y, 2y, 5y, max
        """
        sym = symbol.strip().upper()
        url = f"https://query1.finance.yahoo.com/v8/finance/chart/{urllib.parse.quote(sym)}?interval={interval}&range={range_str}"
        
        try:
            data = self._make_request(url)
            chart = data.get('chart', {})
            result_list = chart.get('result', [])
            if not result_list:
                return {'symbol': sym, 'success': False, 'error': 'No data found'}

            result = result_list[0]
            meta = result.get('meta', {})
            timestamps = result.get('timestamp', [])
            quote_bars = result.get('indicators', {}).get('quote', [{}])[0]

            opens = quote_bars.get('open', [])
            highs = quote_bars.get('high', [])
            lows = quote_bars.get('low', [])
            closes = quote_bars.get('close', [])
            volumes = quote_bars.get('volume', [])

            candles = []
            for i, ts in enumerate(timestamps):
                c = closes[i] if i < len(closes) else None
                if c is None:
                    continue
                o = opens[i] if i < len(opens) and opens[i] is not None else c
                h = highs[i] if i < len(highs) and highs[i] is not None else c
                l = lows[i] if i < len(lows) and lows[i] is not None else c
                v = volumes[i] if i < len(volumes) and volumes[i] is not None else 0

                dt = datetime.fromtimestamp(ts).strftime('%Y-%m-%d %H:%M') if 'm' in interval or 'h' in interval else datetime.fromtimestamp(ts).strftime('%Y-%m-%d')
                candles.append({
                    'timestamp': ts,
                    'datetime': dt,
                    'open': round(o, 2),
                    'high': round(h, 2),
                    'low': round(l, 2),
                    'close': round(c, 2),
                    'volume': int(v),
                })

            return {
                'success': True,
                'symbol': sym,
                'currency': meta.get('currency', 'USD'),
                'exchange': meta.get('exchangeName'),
                'interval': interval,
                'range': range_str,
                'candle_count': len(candles),
                'candles': candles,
            }
        except Exception as e:
            return {'symbol': sym, 'success': False, 'error': str(e)}


def format_number(num: Optional[float], prefix: str = "", suffix: str = "") -> str:
    """Format large numbers like volume or market cap."""
    if num is None:
        return "N/A"
    if abs(num) >= 1_000_000_000:
        return f"{prefix}{num / 1_000_000_000:.2f}B{suffix}"
    if abs(num) >= 1_000_000:
        return f"{prefix}{num / 1_000_000:.2f}M{suffix}"
    if abs(num) >= 1_000:
        return f"{prefix}{num / 1_000:.2f}K{suffix}"
    return f"{prefix}{num:,.2f}{suffix}"


def print_quote_table(quotes: List[Dict[str, Any]]) -> None:
    """Print an attractive, terminal-styled table for quotes."""
    print()
    print(f"{Colors.BOLD}{Colors.CYAN}{'='*85}{Colors.RESET}")
    print(f"{Colors.BOLD}{Colors.CYAN} STOCK BROKER APP - PHASE 1: LIVE FINANCIAL MARKET DATA ENGINE {Colors.RESET}")
    print(f"{Colors.BOLD}{Colors.CYAN}{'='*85}{Colors.RESET}")
    
    header = f"{'SYMBOL':<8} {'PRICE':<12} {'CHANGE':<12} {'% CHG':<10} {'DAY RANGE':<20} {'VOLUME':<12} {'TIME'}"
    print(f"{Colors.BOLD}{Colors.DIM}{header}{Colors.RESET}")
    print(f"{Colors.DIM}{'-'*85}{Colors.RESET}")

    for q in quotes:
        if not q.get('success'):
            print(f"{Colors.RED}{q.get('symbol', 'UNKNOWN'):<8} ERROR: {q.get('error', 'Failed to fetch')}{Colors.RESET}")
            continue

        sym = q['symbol']
        price = f"${q['price']:.2f}"
        change = q['change']
        chg_pct = q['change_percent']

        if change >= 0:
            color = Colors.GREEN
            chg_str = f"+${change:.2f}"
            pct_str = f"+{chg_pct:.2f}%"
        else:
            color = Colors.RED
            chg_str = f"-${abs(change):.2f}"
            pct_str = f"{chg_pct:.2f}%"

        day_range = f"${q.get('day_low') or 0:.2f} - ${q.get('day_high') or 0:.2f}"
        vol_str = format_number(q.get('volume'))
        t_str = q.get('timestamp', '').split(' ')[-1] if ' ' in q.get('timestamp', '') else q.get('timestamp', '')

        row = f"{Colors.BOLD}{sym:<8}{Colors.RESET} {price:<12} {color}{chg_str:<12}{Colors.RESET} {color}{pct_str:<10}{Colors.RESET} {day_range:<20} {vol_str:<12} {Colors.DIM}{t_str}{Colors.RESET}"
        print(row)

    print(f"{Colors.DIM}{'-'*85}{Colors.RESET}")
    print(f"{Colors.DIM}Data provided via Free Financial API endpoints • Real-Time / 15-min Delay{Colors.RESET}")
    print()


def export_to_csv(quotes: List[Dict[str, Any]], filepath: str) -> None:
    """Export quotes to a CSV file."""
    import csv
    with open(filepath, mode='w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(['Symbol', 'Price', 'Change', 'ChangePercent', 'DayLow', 'DayHigh', '52WkLow', '52WkHigh', 'Volume', 'Currency', 'Exchange', 'Timestamp'])
        for q in quotes:
            if q.get('success'):
                writer.writerow([
                    q['symbol'], q['price'], q['change'], q['change_percent'],
                    q.get('day_low'), q.get('day_high'),
                    q.get('fifty_two_week_low'), q.get('fifty_two_week_high'),
                    q.get('volume'), q.get('currency'), q.get('exchange'), q.get('timestamp')
                ])
    print(f"{Colors.GREEN}Successfully exported {len(quotes)} quote(s) to '{filepath}'{Colors.RESET}")


def main():
    parser = argparse.ArgumentParser(
        description="Phase 1: Fetch live stock quotes and historical prices from a free financial API."
    )
    parser.add_argument(
        'symbols',
        nargs='*',
        default=['AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMZN', 'TSLA'],
        help="One or more stock ticker symbols (default: AAPL MSFT NVDA GOOGL AMZN TSLA)"
    )
    parser.add_argument(
        '--format',
        choices=['table', 'json', 'csv'],
        default='table',
        help="Output format: table (default), json, or csv"
    )
    parser.add_argument(
        '--history',
        action='store_true',
        help="Fetch historical candle data for the first symbol"
    )
    parser.add_argument(
        '--interval',
        default='1d',
        help="Candle interval for history: 1m, 5m, 15m, 1h, 1d (default: 1d)"
    )
    parser.add_argument(
        '--range',
        default='1mo',
        dest='range_str',
        help="Historical range: 1d, 5d, 1mo, 3mo, 6mo, 1y (default: 1mo)"
    )
    parser.add_argument(
        '--watch',
        action='store_true',
        help="Continuously poll and display live price updates"
    )
    parser.add_argument(
        '--poll-interval',
        type=int,
        default=5,
        help="Seconds between updates in watch mode (default: 5)"
    )
    parser.add_argument(
        '--export',
        type=str,
        default=None,
        help="Export output to a file path (e.g. quotes.json or quotes.csv)"
    )

    args = parser.parse_args()

    fetcher = StockDataFetcher()

    # Handle Historical Data Request
    if args.history:
        target_sym = args.symbols[0]
        data = fetcher.get_history(target_sym, interval=args.interval, range_str=args.range_str)
        if args.format == 'json':
            print(json.dumps(data, indent=2))
        else:
            if not data.get('success'):
                print(f"{Colors.RED}Error fetching history: {data.get('error')}{Colors.RESET}")
                sys.exit(1)
            print()
            print(f"{Colors.BOLD}{Colors.CYAN}Historical OHLCV for {target_sym} (Interval: {args.interval}, Range: {args.range_str}){Colors.RESET}")
            print(f"{'Date/Time':<18} {'Open':<10} {'High':<10} {'Low':<10} {'Close':<10} {'Volume'}")
            print("-" * 70)
            # Show last 20 candles
            for c in data['candles'][-20:]:
                print(f"{c['datetime']:<18} ${c['open']:<9.2f} ${c['high']:<9.2f} ${c['low']:<9.2f} ${c['close']:<9.2f} {c['volume']:,}")
            print(f"\nTotal bars returned: {data['candle_count']}")
        return

    # Handle Live Watch Mode
    if args.watch:
        try:
            print(f"{Colors.YELLOW}Starting Live Market Watch Mode. Press Ctrl+C to stop...{Colors.RESET}")
            while True:
                # Clear terminal screen
                os.system('cls' if os.name == 'nt' else 'clear')
                quotes = fetcher.get_quotes(args.symbols)
                print_quote_table(quotes)
                print(f"{Colors.CYAN}Auto-refreshing every {args.poll_interval}s. Last refreshed: {datetime.now().strftime('%H:%M:%S')}{Colors.RESET}")
                time.sleep(args.poll_interval)
        except KeyboardInterrupt:
            print(f"\n{Colors.YELLOW}Live watch stopped by user.{Colors.RESET}")
            return

    # Standard Fetch Mode
    quotes = fetcher.get_quotes(args.symbols)

    if args.format == 'json':
        output = json.dumps(quotes, indent=2)
        print(output)
        if args.export:
            with open(args.export, 'w', encoding='utf-8') as f:
                f.write(output)
            print(f"\n{Colors.GREEN}Saved JSON to {args.export}{Colors.RESET}", file=sys.stderr)
    elif args.format == 'csv':
        if args.export:
            export_to_csv(quotes, args.export)
        else:
            export_to_csv(quotes, 'quotes.csv')
    else:
        print_quote_table(quotes)
        if args.export:
            if args.export.endswith('.json'):
                with open(args.export, 'w', encoding='utf-8') as f:
                    json.dump(quotes, f, indent=2)
            else:
                export_to_csv(quotes, args.export)


# Allow library usage:
# from scripts.fetch_stocks import StockDataFetcher
if __name__ == '__main__':
    main()
