"""Official accepted-paper catalogs; titles are discovery evidence, not acceptance criteria."""
from __future__ import annotations

import html
import json
import re
import time
import urllib.parse
import urllib.request
from html.parser import HTMLParser
from typing import Any


def text(value: str) -> str:
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]*>', ' ', value))).strip()


def validate_html(body: str) -> str:
    if re.search(r"making sure you|not a bot|challenge verification|just a moment", body[:12000], re.I):
        raise ValueError('来源返回反爬验证页（challenge），未取得论文目录')
    return body


def read_url(url: str, *, as_json: bool = False) -> Any:
    req = urllib.request.Request(url, headers={'User-Agent': 'PaperDaily/1.0 (public research catalog reader)'})
    with urllib.request.urlopen(req, timeout=60) as response:
        if response.status != 200:
            raise ValueError(f'目录请求 HTTP {response.status}，未完成读取')
        body = response.read(12 * 1024 * 1024 + 1)
    if len(body) > 12 * 1024 * 1024:
        raise ValueError('论文目录超出读取上限，不能标为完整读取')
    decoded = validate_html(body.decode('utf-8', 'replace'))
    return json.loads(decoded) if as_json else decoded


def links(body: str, base: str) -> list[tuple[str, str]]:
    return [(urllib.parse.urljoin(base, html.unescape(url)), text(label))
            for url, label in re.findall(r'<a\b[^>]*href=["\']([^"\']+)["\'][^>]*>(.*?)</a>', body, re.S | re.I)]


def parse_catalog(venue: str, body: str, base: str) -> list[dict[str, Any]]:
    validate_html(body)
    papers = []
    if venue == 'icml':
        for block in re.split(r'<div class="paper">', body)[1:]:
            title = re.search(r'<p class="title">(.*?)</p>', block, re.S)
            url = next((u for u, label in links(block, base) if label == 'abs'), '')
            if title and url:
                papers.append({'title': text(title.group(1)), 'paper_url': url})
    else:
        for url, title in links(body, base):
            if venue == 'neurips' and re.search(r'-Abstract-(Conference|Datasets_and_Benchmarks_Track)\.html$', url):
                papers.append({'title': title, 'paper_url': url})
            elif venue == 'aaai' and re.search(r'/AAAI/article/view/\d+$', url) and title:
                papers.append({'title': title, 'paper_url': url})
    return list({p['paper_url']: p for p in papers}.values())


def parse_openreview_notes(notes: list[dict[str, Any]], venue_id: str) -> list[dict[str, Any]]:
    papers = []
    for note in notes:
        content = note.get('content', {})
        def value(key: str, default: Any = '') -> Any:
            field = content.get(key, default)
            return field.get('value', default) if isinstance(field, dict) else field
        if value('venueid') != venue_id or not value('title'):
            continue  # Submissions, withdrawn and rejected notes are never accepted papers.
        papers.append({'id': f"openreview:{note['id']}", 'title': value('title'),
                       'summary': value('abstract'), 'authors': value('authors', []),
                       'paper_url': f"https://openreview.net/forum?id={note['id']}",
                       'pdf_url': f"https://openreview.net/pdf?id={note['id']}",
                       'abstract_source': 'openreview' if value('abstract') else ''})
    return papers


def official_catalog(venue: str, year: int) -> list[dict[str, Any]]:
    if venue == 'iclr':
        venue_id = f'ICLR.cc/{year}/Conference'
        papers = []
        offset = 0
        while offset < 20000:
            query = urllib.parse.urlencode({'content.venueid': venue_id, 'limit': 1000, 'offset': offset})
            data = read_url(f'https://api2.openreview.net/notes?{query}', as_json=True)
            notes = data.get('notes', [])
            papers.extend(parse_openreview_notes(notes, venue_id))
            offset += len(notes)
            if not notes or offset >= int(data.get('count', offset)):
                return papers
            time.sleep(1)
        raise ValueError('OpenReview 分页超过上限，未完整读取')
    if venue == 'neurips':
        root = f'https://proceedings.neurips.cc/paper_files/paper/{year}'
        body = read_url(root)
        main = next((u for u, label in links(body, root) if f'/paper/{year}/vol' in u and 'main-conference' in u), '')
        if main:
            body = read_url(main)
        return parse_catalog(venue, body, root)
    if venue == 'icml':
        root = 'https://proceedings.mlr.press/'
        index = read_url(root)
        volume = next((block for block in re.findall(r'<li>(.*?)</li>', index, re.S)
                       if re.search(rf'Proceedings of ICML {year}\s*$', text(block))), '')
        volume_url = next((u for u, _ in links(volume, root)), '')
        if not volume_url:
            raise ValueError(f'PMLR 尚未列出 ICML {year} 正会论文集')
        volume_url = volume_url.rstrip('/') + '/'
        return parse_catalog(venue, read_url(volume_url), volume_url)
    if venue == 'aaai':
        root = 'https://ojs.aaai.org/index.php/AAAI/issue/archive'
        issues = []
        # The two active conference years span multiple archive pages/volumes.
        for page in range(1, 5):
            archive_url = root if page == 1 else f'{root}/{page}'
            archive = read_url(archive_url)
            issues.extend(u for u, label in links(archive, archive_url)
                          if re.search(r'/issue/view/\d+$', u)
                          and re.match(rf'AAAI-{str(year)[-2:]} Technical Tracks\b', label))
            years_on_page = [2000 + int(match) for _, label in links(archive, archive_url)
                             for match in re.findall(r"AAAI-(\d{2}) Technical Tracks", label)]
            if (years_on_page and min(years_on_page) < year) or f'/archive/{page + 1}' not in archive:
                break
        else:
            raise ValueError(f'AAAI {year} 目录分页尚未读完，不能标为完整目录')
        if not issues:
            raise ValueError(f'AAAI 官方目录尚未找到 {year} 正会 Technical Tracks')
        papers = []
        for url in dict.fromkeys(issues):
            papers.extend(parse_catalog(venue, read_url(url), url))
            time.sleep(0.2)
        return papers
    raise ValueError(f'尚无 {venue} 官方目录适配器')


class Metadata(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.values: dict[str, list[str]] = {}

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        fields = dict(attrs)
        if tag == 'meta' and fields.get('content'):
            key = (fields.get('name') or '').lower()
            self.values.setdefault(key, []).append(fields['content'])


def official_abstract(paper: dict[str, Any]) -> dict[str, Any] | None:
    url = str(paper.get('official_abstract_url') or '')
    # Never fetch arbitrary links from paper text or model output.
    if urllib.parse.urlparse(url).hostname not in {'proceedings.neurips.cc', 'proceedings.mlr.press', 'ojs.aaai.org'}:
        return None
    body = read_url(url)
    metadata = Metadata()
    metadata.feed(body)
    values = metadata.values
    summary = next(iter(values.get('dc.description', []) or values.get('citation_abstract', [])), '')
    if not summary:
        pattern = (r'<div[^>]*id="abstract"[^>]*>(.*?)</div>' if 'mlr.press' in url
                   else r'<h[23][^>]*>\s*Abstract\s*</h[23]>\s*<p[^>]*>(.*?)</p>')
        found = re.search(pattern, body, re.S | re.I)
        summary = text(found.group(1)) if found else ''
    if len(summary) < 80:
        return None
    return {'title': next(iter(values.get('citation_title', [])), paper['title']),
            'summary': text(summary), 'authors': values.get('citation_author', []),
            'pdf_url': next(iter(values.get('citation_pdf_url', [])), ''),
            'abstract_source': 'official', 'abstract_source_url': url, 'paper_url': url, 'source': 'official'}
