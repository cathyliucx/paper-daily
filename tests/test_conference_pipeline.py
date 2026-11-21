import datetime as dt
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from scripts.collect_papers import collect, parse_topics


class ConferencePipelineTests(unittest.TestCase):
    def test_required_concepts_can_reach_ai_without_exact_long_keyword(self):
        from scripts.collect_papers import score_paper, is_relevant_enough
        topic=parse_topics({'topics':[{'name':'AI Scientist','keywords':['autonomous scientific discovery'],'required_keyword_groups':[['scientific discovery'],['hypothesis','experiment']]}]})[0]
        p={'source_type':'conference','title':'AutoDiscovery','summary':'We evaluate a scientific discovery system that proposes hypotheses and runs an experiment with independent validation.'}
        self.assertTrue(is_relevant_enough(p,score_paper(topic,p)))

    def test_abstract_is_retrieved_before_full_topic_and_domain_filter(self):
        cfg={'sources':[{'type':'arxiv'}], 'application_domains':[{'id':'finance','name':'金融','keywords':['financial']}], 'topics':[{'id':'causal','name':'因果强化学习','keywords':['causal reinforcement learning'], 'required_keyword_groups':[['causal'],['reinforcement learning']]}], 'conference_sources':{'enabled':True,'current_year':2026,'lookback_years':1,'venues':[{'id':'iclr','name':'ICLR','dblp_toc_patterns':['db/conf/iclr/iclr{year}.bht']}]}}
        # The title alone lacks both RL and application-domain evidence.
        p={'id':'accepted','title':'Causal Models for Sequential Decisions','summary':'DBLP 题录：ICLR 2026','source_type':'conference','conference':{'id':'iclr','year':2026},'published':'2026-01-01T00:00:00Z'}
        abstract='We study causal reinforcement learning for financial trading and evaluate interventions on financial markets. '*2
        candidate={'title':p['title'],'summary':abstract,'abstract_source':'arxiv'}
        def review(topic,paper,base):
            self.assertIn('financial',paper['summary'])
            return {},{**base,'level':'high','score':0.85,'application_domain':'finance','domain_evidence':'financial trading'}
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp); (root/'config.json').write_text(json.dumps(cfg))
            with patch('scripts.collect_papers.fetch_source_topic',return_value=[]), patch('scripts.collect_papers.fetch_conference_catalog',return_value=([p],{'raw_paper_count':1})), patch('scripts.collect_papers.find_conference_abstract_by_title',return_value=candidate), patch('scripts.collect_papers.summarize_with_llm',side_effect=review), patch('scripts.collect_papers.llm_enabled',return_value=False), patch('scripts.collect_papers.time.sleep'):
                collect(root/'config.json', root/'daily.json',root/'conf.json',1,10,20,50,50,50,300,0,False,45,False)
            result=json.loads((root/'conf.json').read_text())
        self.assertEqual([p['id'] for p in result['papers']],['accepted'])
        self.assertEqual(result['stats']['conference_abstract_enrichment_succeeded'],1)
        self.assertEqual(result['papers'][0]['best_match']['application_domain'],'finance')
