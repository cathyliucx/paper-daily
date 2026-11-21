import unittest
from unittest.mock import patch

from scripts.conference_catalogs import parse_catalog, validate_html, parse_openreview_notes


class ConferenceCatalogTests(unittest.TestCase):
    def test_challenge_page_is_failure_not_empty_success(self):
        with self.assertRaisesRegex(ValueError, '验证|challenge'):
            validate_html('<html><title>Making sure you&#39;re not a bot!</title></html>')

    def test_neurips_catalog_excludes_workshops_and_creative_tracks(self):
        text = '''<a href="/paper_files/paper/2025/hash/abc-Abstract-Conference.html">Causal <b>Financial</b> Learning</a>
        <a href="/paper_files/paper/2025/hash/def-Abstract-Creative_AI_Track.html">Art</a>'''
        result = parse_catalog('neurips', text, 'https://proceedings.neurips.cc/')
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]['title'], 'Causal Financial Learning')

    def test_icml_catalog_preserves_title_and_official_article(self):
        text = '''<div class="paper"><p class="title">Financial <i>Data</i> Synthesis</p><p class="links">[<a href="https://proceedings.mlr.press/v267/example25a.html">abs</a>]</p></div>'''
        self.assertEqual(parse_catalog('icml', text, 'https://proceedings.mlr.press/v267/')[0]['title'], 'Financial Data Synthesis')

    def test_only_exact_accepted_openreview_venue_is_used(self):
        accepted = {'id':'a','content':{'title':{'value':'Scientific Discovery'},'abstract':{'value':'Actual abstract'},'venueid':{'value':'ICLR.cc/2025/Conference'}}}
        rejected = {'id':'b','content':{'title':{'value':'Rejected'},'venueid':{'value':'ICLR.cc/2025/Conference/Submission'}}}
        self.assertEqual([p['id'] for p in parse_openreview_notes([accepted,rejected], 'ICLR.cc/2025/Conference')], ['openreview:a'])
