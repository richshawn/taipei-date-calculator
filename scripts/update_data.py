#!/usr/bin/env python3
"""Refresh TWSE closure dates and US/JP/CN macro events for the static GitHub Pages app.

The updater is intentionally fail-safe: a source failure never deletes the last known good data.
"""
from __future__ import annotations
import csv, io, json, re, sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'data'
TZ = ZoneInfo('Asia/Taipei')
UA = {'User-Agent': 'Mozilla/5.0 (compatible; TaipeiDateCalculator/1.0; +GitHub Actions)'}
TWSE_API = 'https://www.twse.com.tw/rwd/zh/holidaySchedule/holidaySchedule'
DGPA_DATASET = 'https://data.gov.tw/dataset/14718'
WSCN_API = 'https://api-one-wscn.awtmt.com/apiv1/finance/macrodatas'

KEYWORDS = re.compile(
    r'Fed|FOMC|聯準會|美聯儲|美联储|聯儲|联储|鮑威爾|鲍威尔|央行|利率|政策|講話|讲话|發言|发言|'
    r'CPI|PPI|PCE|GDP|PMI|ISM|非農|非农|就業|就业|失業|失业|零售|耐久財|耐久财|工業產出|工业产出|'
    r'貿易|贸易|關稅|关税|國債|国债|財政部|财政部|植田|日本銀行|日本央行|日銀|日银|中國人民銀行|中国人民银行|'
    r'人行|LPR|MLF|峰會|峰会|會議|会议', re.I
)
COUNTRIES = {'US':'US', 'JP':'JP', 'CN':'CN', '美国':'US', '美國':'US', '日本':'JP', '中国':'CN', '中國':'CN'}


def load_json(path: Path, default):
    try:
        return json.loads(path.read_text(encoding='utf-8'))
    except Exception:
        return default


def save_json(path: Path, obj):
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def fetch_json(url, params=None, timeout=25):
    r = requests.get(url, params=params, headers=UA, timeout=timeout)
    r.raise_for_status()
    return r.json()


def update_twse(calendar):
    years = sorted(set([datetime.now(TZ).year, datetime.now(TZ).year + 1]))
    days = calendar.setdefault('days', {})
    success_years=[]
    for year in years:
        candidates = [year, year - 1911]
        payload = None
        for qy in candidates:
            try:
                data = fetch_json(TWSE_API, {'response':'json','queryYear':qy})
                rows = data.get('data') or []
                if rows and any(str(row[0]).startswith(str(year)) for row in rows):
                    payload = data
                    break
            except Exception as exc:
                print(f'TWSE {year}/{qy}: {exc}', file=sys.stderr)
        if not payload:
            continue
        # Clear only TWSE fields for this year, preserving government data.
        for date_key, rec in list(days.items()):
            if date_key.startswith(f'{year}-'):
                rec.pop('marketClosed', None); rec.pop('marketName', None)
        for row in payload.get('data', []):
            if len(row) < 2:
                continue
            date, name = row[0], re.sub(r'<[^>]+>','',row[1] or '')
            if not str(date).startswith(str(year)):
                continue
            # TWSE table also contains explicit trading days; exclude those.
            if '交易日' in name and '無交易' not in name:
                continue
            rec = days.setdefault(date, {})
            rec['marketClosed'] = True
            rec['marketName'] = name.strip() or '臺灣證券交易所休市'
            rec['source'] = 'TWSE live update'
        success_years.append(year)
    if success_years:
        calendar['coverage'] = sorted(set(map(int, calendar.get('coverage', []))) | set(success_years))
    return success_years


def _try_csv_resource(href):
    url = requests.compat.urljoin(DGPA_DATASET, href)
    r = requests.get(url, headers=UA, timeout=25, allow_redirects=True)
    r.raise_for_status()
    ctype = r.headers.get('content-type','').lower()
    text = r.content.decode('utf-8-sig', errors='replace')
    if ',' not in text[:500] and 'csv' not in ctype:
        return None
    return text


def update_dgpa(calendar):
    """Best-effort enrichment for government-holiday labels from the official open-data dataset.
    The app's workday safety still relies on TWSE closures if this source changes layout.
    """
    years = [datetime.now(TZ).year, datetime.now(TZ).year + 1]
    days = calendar.setdefault('days', {})
    updated=[]
    try:
        page = requests.get(DGPA_DATASET, headers=UA, timeout=25)
        page.raise_for_status()
        soup = BeautifulSoup(page.text, 'html.parser')
    except Exception as exc:
        print(f'DGPA dataset page: {exc}', file=sys.stderr)
        return updated

    for year in years:
        roc = year - 1911
        links=[]
        for a in soup.find_all('a', href=True):
            text=' '.join(a.parent.stripped_strings) if a.parent else ' '.join(a.stripped_strings)
            if f'{roc}年中華民國政府行政機關辦公日曆表' in text and 'Google' not in text:
                links.append(a['href'])
        for href in links:
            try:
                raw = _try_csv_resource(href)
                if not raw: continue
                reader = csv.DictReader(io.StringIO(raw))
                hit=0
                for row in reader:
                    # Known field names: 西元日期 / 星期 / 是否放假 / 備註
                    date = (row.get('西元日期') or row.get('Date') or row.get('date') or '').strip()
                    flag = (row.get('是否放假') or row.get('isHoliday') or row.get('isholiday') or '').strip()
                    note = (row.get('備註') or row.get('name') or row.get('description') or '').strip()
                    if not date: continue
                    date = date.replace('/','-')
                    if len(date)==8 and date.isdigit(): date=f'{date[:4]}-{date[4:6]}-{date[6:]}'
                    if not date.startswith(str(year)): continue
                    if flag in {'2','true','True','TRUE','1'}:
                        rec=days.setdefault(date,{})
                        rec['governmentHoliday']=True
                        rec['governmentName']=note or '政府放假日'
                        rec['source']='DGPA live update'
                        hit += 1
                if hit:
                    updated.append(year)
                    break
            except Exception as exc:
                print(f'DGPA CSV {year}: {exc}', file=sys.stderr)
    return updated


def update_wscn(existing):
    now = datetime.now(TZ)
    monday = (now - timedelta(days=now.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
    # Keep this week + the following week to make near-term target dates useful.
    end = monday + timedelta(days=14) - timedelta(seconds=1)
    try:
        payload = fetch_json(WSCN_API, {'start': int(monday.timestamp()), 'end': int(end.timestamp())})
        items = payload.get('data', {}).get('items', [])
        if not items:
            raise RuntimeError('empty items')
    except Exception as exc:
        print(f'WSCN: {exc}; preserving last known good events', file=sys.stderr)
        return existing, False

    out=[]
    for item in items:
        cid = item.get('country_id') or item.get('country') or ''
        country = COUNTRIES.get(str(cid), COUNTRIES.get(str(item.get('country',''))))
        if country not in {'US','JP','CN'}:
            continue
        importance = int(item.get('importance') or item.get('stars') or 0)
        title = str(item.get('title') or '').strip()
        if importance < 2 and not KEYWORDS.search(title):
            continue
        ts = item.get('public_date') or item.get('timestamp')
        try:
            dt = datetime.fromtimestamp(float(ts), tz=timezone.utc).astimezone(TZ)
            date = dt.strftime('%Y-%m-%d'); time = dt.strftime('%H:%M')
        except Exception:
            continue
        out.append({
            'id': str(item.get('id') or f'{country}-{date}-{time}-{title}'),
            'date': date, 'time': time, 'country': country,
            'importance': max(importance, 1), 'title': title,
            'category': 'macro',
            'actual': item.get('actual') or '', 'forecast': item.get('forecast') or '',
            'previous': item.get('revised') or item.get('previous') or '', 'unit': item.get('unit') or '',
            'uri': item.get('uri') or 'https://wallstreetcn.com/calendar'
        })
    out.sort(key=lambda x:(x['date'], x['time'], -x['importance'], x['title']))
    result = {
        'updatedAt': datetime.now(timezone.utc).isoformat().replace('+00:00','Z'),
        'timezone':'Asia/Taipei',
        'coverage':{'start':monday.strftime('%Y-%m-%d'),'end':end.strftime('%Y-%m-%d')},
        'source':{'name':'華爾街見聞財經日曆','url':'https://wallstreetcn.com/calendar'},
        'events': out
    }
    return result, True


def main():
    calendar_path = DATA/'taiwan-calendar.json'
    event_path = DATA/'international-events.json'
    calendar = load_json(calendar_path, {'days':{},'coverage':[]})
    events = load_json(event_path, {'events':[]})

    twse_years = update_twse(calendar)
    dgpa_years = update_dgpa(calendar)
    if twse_years or dgpa_years:
        calendar['updatedAt'] = datetime.now(timezone.utc).isoformat().replace('+00:00','Z')
        calendar['timezone'] = 'Asia/Taipei'
        calendar['sources'] = [
            {'name':'行政院人事行政總處（DGPA）','url':'https://www.dgpa.gov.tw/informationlist?uid=30'},
            {'name':'臺灣證券交易所（TWSE）','url':'https://www.twse.com.tw/holidaySchedule/holidaySchedule?response=html'}
        ]
        save_json(calendar_path, calendar)
        print('Taiwan calendar updated:', {'TWSE':twse_years, 'DGPA':dgpa_years})
    else:
        print('Taiwan sources unavailable; seed data preserved')

    new_events, ok = update_wscn(events)
    if ok:
        save_json(event_path, new_events)
        print(f'International events updated: {len(new_events.get("events",[]))} items')

if __name__ == '__main__':
    main()
