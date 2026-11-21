from html.parser import HTMLParser
from pathlib import Path
import unittest

ROOT = Path(__file__).parents[1]

class Page(HTMLParser):
    def __init__(self, path):
        super().__init__()
        self.elements=[]
        self.feed(path.read_text())
    def handle_starttag(self, tag, attrs):
        self.elements.append((tag,dict(attrs)))

class StaticManagementTests(unittest.TestCase):
    def test_native_management_destinations_are_owner_repository_pages(self):
        page=Page(ROOT/'web/index.html')
        links={attrs.get('id'):attrs for tag,attrs in page.elements if tag=='a'}
        expected={
            'manageInterests':'https://github.com/cathyliucx/paper-daily/edit/main/config/interests.json',
            'manageModel':'https://github.com/cathyliucx/paper-daily/settings/secrets/actions',
            'manageCollection':'https://github.com/cathyliucx/paper-daily/actions/workflows/paper-daily.yml',
        }
        for name,url in expected.items():
            self.assertEqual(links[name]['href'],url)
            self.assertIn('noopener',links[name]['rel'])

    def test_public_pages_do_not_request_credentials_or_load_token_clients(self):
        for file in ['index.html','manage.html']:
            page=Page(ROOT/'web'/file)
            for tag,attrs in page.elements:
                self.assertNotEqual(attrs.get('type'),'password', file)
                self.assertNotIn(attrs.get('id'),['repositoryToken','modelApiKey'],file)
                if tag=='script':
                    self.assertNotIn('settings.mjs',attrs.get('src',''))
        for path in (ROOT/'web').rglob('*'):
            if path.suffix not in ['.js','.mjs']:
                continue
            self.assertNotIn('api.github.com',path.read_text(),str(path))
            self.assertNotIn('Bearer ',path.read_text(),str(path))
        for name in ['repository.mjs','settings.mjs','model-config.mjs','authorization-store.mjs']:
            self.assertFalse((ROOT/'web'/name).exists(),name)

    def test_guide_explains_one_time_model_keys_and_explicit_cache_rebuild(self):
        guide=(ROOT/'web/manage.html').read_text()
        for text in ['LLM_API_KEY','LLM_BASE_URL','LLM_MODEL','clear_cache','true','配置一次','无需']:
            self.assertIn(text,guide)
        self.assertIn('https://github.com/cathyliucx/paper-daily/settings/variables/actions',guide)

if __name__=='__main__':
    unittest.main()
