"""
Zakat Calculator - Backend Server
Flask server that serves the web UI and proxies real-time price APIs.
Uses direct Yahoo Finance API calls to avoid SSL/curl_cffi issues.
"""

import datetime
import json
import traceback
import warnings
import urllib3
import webbrowser
import threading
import os

from flask import Flask, jsonify, request, send_from_directory

# Suppress SSL warnings (corporate proxy / self-signed certs)
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
warnings.filterwarnings('ignore')

import requests as http_requests

app = Flask(__name__, static_folder='public', static_url_path='')

# ─── Yahoo Finance direct API helpers ───────────────────────────
YAHOO_CHART_URL = 'https://query1.finance.yahoo.com/v8/finance/chart/{symbol}'
YAHOO_QUOTE_V7 = 'https://query1.finance.yahoo.com/v7/finance/quote'

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
}


def yahoo_chart(symbol, period='1d', interval='1d'):
    """Fetch price data using Yahoo Finance chart API."""
    url = YAHOO_CHART_URL.format(symbol=symbol)
    params = {'range': period, 'interval': interval}
    r = http_requests.get(url, params=params, headers=HEADERS, verify=False, timeout=15)
    r.raise_for_status()
    data = r.json()
    result = data.get('chart', {}).get('result')
    if not result:
        return None
    return result[0]


def yahoo_quote_batch(symbols):
    """Fetch quotes for multiple symbols using v7 quote API."""
    params = {'symbols': ','.join(symbols)}
    r = http_requests.get(YAHOO_QUOTE_V7, params=params, headers=HEADERS, verify=False, timeout=15)
    r.raise_for_status()
    data = r.json()
    results = data.get('quoteResponse', {}).get('result', [])
    return {q['symbol']: q for q in results}


def extract_price(chart_data):
    """Extract the latest price from chart API response."""
    meta = chart_data.get('meta', {})
    price = meta.get('regularMarketPrice')
    prev_close = meta.get('chartPreviousClose') or meta.get('previousClose')
    name = meta.get('shortName') or meta.get('longName') or meta.get('symbol', '')
    currency = meta.get('currency', 'USD')

    # Fallback to last close in indicators
    if price is None:
        closes = chart_data.get('indicators', {}).get('quote', [{}])[0].get('close', [])
        closes = [c for c in closes if c is not None]
        if closes:
            price = closes[-1]

    return {
        'price': price,
        'previousClose': prev_close,
        'name': name,
        'currency': currency
    }


# ─── Serve Frontend ─────────────────────────────────────────────
@app.route('/')
def index():
    return send_from_directory('public', 'index.html')


@app.route('/<path:path>')
def static_files(path):
    return send_from_directory('public', path)


def get_fx_rate(from_cur, to_cur):
    """Return exchange rate from_cur -> to_cur, or 1.0 on failure."""
    if not from_cur or not to_cur or from_cur == to_cur:
        return 1.0
    try:
        fx_data = yahoo_chart(f'{from_cur}{to_cur}=X')
        if fx_data:
            fx_info = extract_price(fx_data)
            if fx_info['price']:
                return fx_info['price']
    except Exception as e:
        print(f'FX rate error {from_cur}->{to_cur}: {e}')
    return 1.0


# ─── API: Single Price ──────────────────────────────────────────
@app.route('/api/price/<symbol>')
def get_price(symbol):
    try:
        symbol = symbol.upper()
        target_currency = request.args.get('currency', '').upper()

        chart_data = yahoo_chart(symbol)
        if not chart_data:
            return jsonify({'error': f'No data for {symbol}'}), 404

        info = extract_price(chart_data)
        price = info['price']
        prev_close = info['previousClose']
        src_currency = info.get('currency', 'USD')

        if price is None:
            return jsonify({'error': f'Could not fetch price for {symbol}'}), 500

        # Convert to target currency if different
        converted_currency = src_currency
        if target_currency and target_currency != src_currency:
            rate = get_fx_rate(src_currency, target_currency)
            price = price * rate
            if prev_close:
                prev_close = prev_close * rate
            converted_currency = target_currency

        change = (price - prev_close) if prev_close else 0
        change_pct = (change / prev_close * 100) if prev_close else 0

        return jsonify({
            'symbol': symbol,
            'name': info['name'],
            'price': round(price, 4),
            'currency': converted_currency,
            'previousClose': round(prev_close, 4) if prev_close else None,
            'change': round(change, 4),
            'changePercent': round(change_pct, 2),
            'timestamp': datetime.datetime.now().isoformat()
        })
    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


# ─── API: Multiple Prices ───────────────────────────────────────
@app.route('/api/prices', methods=['POST'])
def get_prices():
    try:
        data = request.get_json()
        symbols = data.get('symbols', [])
        target_currency = data.get('currency', '').upper()
        if not symbols:
            return jsonify({'error': 'No symbols provided'}), 400

        symbols = [s.upper() for s in symbols]
        results = {}

        # Try batch quote first
        try:
            batch = yahoo_quote_batch(symbols)
            for sym in symbols:
                q = batch.get(sym)
                if q and q.get('regularMarketPrice') is not None:
                    price = q['regularMarketPrice']
                    prev = q.get('regularMarketPreviousClose')
                    src_cur = q.get('currency', 'USD')
                    results[sym] = {
                        'symbol': sym,
                        'name': q.get('shortName') or q.get('longName') or sym,
                        'price': round(price, 4),
                        'currency': src_cur,
                        'previousClose': round(prev, 4) if prev else None,
                        'change': 0,
                        'changePercent': 0
                    }
                else:
                    results[sym] = {'error': f'No data for {sym}'}
        except Exception:
            # Fallback: fetch individually via chart API
            for sym in symbols:
                try:
                    chart_data = yahoo_chart(sym)
                    if chart_data:
                        info = extract_price(chart_data)
                        if info['price'] is not None:
                            results[sym] = {
                                'symbol': sym,
                                'name': info['name'],
                                'price': round(info['price'], 4),
                                'currency': info.get('currency', 'USD'),
                                'previousClose': round(info['previousClose'], 4) if info['previousClose'] else None,
                                'change': 0,
                                'changePercent': 0
                            }
                        else:
                            results[sym] = {'error': f'No price for {sym}'}
                    else:
                        results[sym] = {'error': f'No data for {sym}'}
                except Exception as e:
                    results[sym] = {'error': str(e)}

        # Currency conversion: collect unique source currencies and bulk-convert
        if target_currency:
            src_currencies = set(
                r['currency'] for r in results.values()
                if 'currency' in r and r['currency'] != target_currency
            )
            fx_rates = {cur: get_fx_rate(cur, target_currency) for cur in src_currencies}
            for sym, r in results.items():
                if 'error' in r:
                    continue
                src_cur = r.get('currency', 'USD')
                if src_cur != target_currency:
                    rate = fx_rates.get(src_cur, 1.0)
                    r['price'] = round(r['price'] * rate, 4)
                    if r['previousClose']:
                        r['previousClose'] = round(r['previousClose'] * rate, 4)
                    r['currency'] = target_currency
                # Recalculate change/changePercent after conversion
                prev = r.get('previousClose')
                if prev:
                    r['change'] = round(r['price'] - prev, 4)
                    r['changePercent'] = round((r['change'] / prev) * 100, 2)

        return jsonify({
            'prices': results,
            'timestamp': datetime.datetime.now().isoformat()
        })
    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


# ─── API: Metal Spot Prices ─────────────────────────────────────
@app.route('/api/metal-prices')
def get_metal_prices():
    """Fetch gold (GC=F) and silver (SI=F) futures prices, with optional currency conversion."""
    TROY_OZ_TO_GRAMS = 31.1035
    target_currency = request.args.get('currency', 'USD').upper()

    result = {
        'gold': {'pricePerOunce': 0, 'pricePerGram': 0, 'currency': target_currency},
        'silver': {'pricePerOunce': 0, 'pricePerGram': 0, 'currency': target_currency},
        'exchangeRate': 1.0,
        'baseCurrency': 'USD',
        'targetCurrency': target_currency,
        'timestamp': datetime.datetime.now().isoformat()
    }

    # Get exchange rate if not USD
    fx_rate = 1.0
    if target_currency != 'USD':
        try:
            fx_symbol = f'USD{target_currency}=X'
            fx_data = yahoo_chart(fx_symbol)
            if fx_data:
                fx_info = extract_price(fx_data)
                if fx_info['price']:
                    fx_rate = fx_info['price']
        except Exception as e:
            print(f"FX rate fetch error for {target_currency}: {e}")
    result['exchangeRate'] = round(fx_rate, 6)

    try:
        # Try fetching gold
        try:
            gdata = yahoo_chart('GC=F')
            if gdata:
                ginfo = extract_price(gdata)
                if ginfo['price']:
                    usd_oz = ginfo['price']
                    result['gold']['pricePerOunce'] = round(usd_oz * fx_rate, 2)
                    result['gold']['pricePerGram'] = round(usd_oz / TROY_OZ_TO_GRAMS * fx_rate, 2)
        except Exception as e:
            print(f"Gold price fetch error: {e}")

        # Try fetching silver
        try:
            sdata = yahoo_chart('SI=F')
            if sdata:
                sinfo = extract_price(sdata)
                if sinfo['price']:
                    usd_oz = sinfo['price']
                    result['silver']['pricePerOunce'] = round(usd_oz * fx_rate, 2)
                    result['silver']['pricePerGram'] = round(usd_oz / TROY_OZ_TO_GRAMS * fx_rate, 2)
        except Exception as e:
            print(f"Silver price fetch error: {e}")

        return jsonify(result)
    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


# ─── API: Exchange Rate ──────────────────────────────────────────
@app.route('/api/exchange-rate/<from_currency>/<to_currency>')
def get_exchange_rate(from_currency, to_currency):
    """Get exchange rate between two currencies."""
    try:
        from_currency = from_currency.upper()
        to_currency = to_currency.upper()

        if from_currency == to_currency:
            return jsonify({'rate': 1.0, 'from': from_currency, 'to': to_currency})

        fx_symbol = f'{from_currency}{to_currency}=X'
        fx_data = yahoo_chart(fx_symbol)
        if fx_data:
            fx_info = extract_price(fx_data)
            if fx_info['price']:
                return jsonify({
                    'rate': round(fx_info['price'], 6),
                    'from': from_currency,
                    'to': to_currency,
                    'timestamp': datetime.datetime.now().isoformat()
                })

        return jsonify({'error': f'Could not fetch rate for {fx_symbol}'}), 404
    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


# ─── API: Search Symbols ────────────────────────────────────────
@app.route('/api/search/<query>')
def search_symbols(query):
    try:
        url = 'https://query2.finance.yahoo.com/v1/finance/search'
        params = {'q': query, 'quotesCount': 10, 'newsCount': 0}
        r = http_requests.get(url, params=params, headers=HEADERS, verify=False, timeout=10)
        r.raise_for_status()
        data = r.json()
        quotes = data.get('quotes', [])
        results = [{
            'symbol': q.get('symbol', ''),
            'name': q.get('shortname') or q.get('longname') or q.get('symbol', ''),
            'type': q.get('quoteType', ''),
            'exchange': q.get('exchange', '')
        } for q in quotes]
        return jsonify({'results': results})
    except Exception as e:
        return jsonify({'error': str(e), 'results': []}), 500


if __name__ == '__main__':
    port = 3000
    url = f'http://localhost:{port}'
    
    print("\n  ╔══════════════════════════════════════════╗")
    print("  ║   Zakat Calculator                       ║")
    print(f"  ║   {url}                   ║")
    print("  ╚══════════════════════════════════════════╝\n")
    
    # Open browser only once (not on reloader restart)
    if os.environ.get('WERKZEUG_RUN_MAIN') != 'true':
        def open_browser():
            import time
            time.sleep(1.5)
            webbrowser.open(url)
        
        threading.Thread(target=open_browser, daemon=True).start()
    
    app.run(host='0.0.0.0', port=port, debug=True)
