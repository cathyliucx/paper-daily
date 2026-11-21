import importlib.util
import json
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('model_profile_collector', Path(__file__).parents[1] / 'scripts/collect_papers.py')
collector = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = collector
spec.loader.exec_module(collector)

class ModelProfileTests(unittest.TestCase):
    def test_bundle_keeps_endpoint_model_and_key_together(self):
        profile = {'format':'paper-daily-model-v1','base_url':'https://api.deepseek.com/v1','model':'deepseek-chat','api_key':'fixture-new-key'}
        with patch.dict('os.environ', {'LLM_API_KEY': json.dumps(profile), 'LLM_BASE_URL':'https://legacy.example/v1','LLM_MODEL':'legacy-model'}, clear=True):
            resolved = collector.resolve_model_config()
            self.assertEqual(resolved, ('fixture-new-key','https://api.deepseek.com/v1','deepseek-chat'))
            self.assertTrue(collector.llm_enabled())

    def test_plain_legacy_keys_are_still_supported(self):
        with patch.dict('os.environ', {'DEEPSEEK_API_KEY':'fixture-old-key'}, clear=True):
            self.assertEqual(collector.resolve_model_config(), ('fixture-old-key','https://api.deepseek.com/v1','deepseek-chat'))
        with patch.dict('os.environ', {'LLM_API_KEY':'fixture-key','LLM_BASE_URL':'https://provider.example/v1','LLM_MODEL':'model-x'}, clear=True):
            self.assertEqual(collector.resolve_model_config(), ('fixture-key','https://provider.example/v1','model-x'))

    def test_invalid_bundle_does_not_fall_back_or_expose_its_key(self):
        for profile in [{'format':'wrong','api_key':'fixture-secret'}, {'format':'paper-daily-model-v1','api_key':'fixture-secret','base_url':'http://unsafe.example','model':'x'}]:
            with patch.dict('os.environ', {'LLM_API_KEY':json.dumps(profile)}, clear=True):
                with self.assertRaises(ValueError) as error:
                    collector.resolve_model_config()
                self.assertNotIn('fixture-secret', str(error.exception))

    def test_no_key_disables_the_model(self):
        with patch.dict('os.environ', {}, clear=True):
            self.assertEqual(collector.resolve_model_config()[0], '')
            self.assertFalse(collector.llm_enabled())

if __name__ == '__main__':
    unittest.main()
