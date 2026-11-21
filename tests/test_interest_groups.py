import unittest
from scripts.collect_papers import parse_topics, score_paper, is_relevant_enough, arxiv_query_for_topic
class InterestGroupTests(unittest.TestCase):
    def topic(self):
        return parse_topics({'topics':[{'id':'causal_rl','name':'因果强化学习','keywords':['causal reinforcement learning'], 'arxiv_categories':['cs.LG'], 'required_keyword_groups':[['causal','counterfactual'],['reinforcement learning','policy learning','RL']]}]})[0]
    def test_causal_discovery_alone_and_generic_rl_do_not_match(self):
        for text in ['Causal discovery of time series structure using parent sets.', 'Recursive self-improvement for decision agents and world models.', 'Reinforcement learning with environmental feedback.']:
            paper={'title':text,'summary':text*5,'categories':['cs.LG']}
            match=score_paper(self.topic(),paper)
            self.assertFalse(is_relevant_enough(paper,match))
    def test_both_concepts_are_required_in_query_and_matching(self):
        paper={'title':'Causal reinforcement learning with interventions','summary':'A causal reinforcement learning algorithm.', 'categories':['cs.LG']}
        self.assertTrue(is_relevant_enough(paper,score_paper(self.topic(),paper)))
        query=arxiv_query_for_topic(self.topic())
        self.assertIn(' AND ',query)
        self.assertIn('all:"reinforcement learning"',query)
    def test_real_config_has_seven_english_keyword_topics_and_rejects_known_mismatches(self):
        import json
        from pathlib import Path
        topics=parse_topics(json.loads(Path('config/interests.json').read_text()))
        self.assertEqual(len(topics),7)
        self.assertTrue(all(k.isascii() for t in topics for k in t.keywords))
        cases=[('causal_reinforcement_learning','Time series causal parent discovery','A causal discovery method for multivariate time series without policy learning.'),('financial_explainable_ai','Agent-native trading','An autonomous financial trading agent with tools and memory.'),('efficient_multimodal_ot_moe','Think Once Act Fast','Recursive decision harness with low latency execution.')]
        for topic_id,title,summary in cases:
            topic=next(t for t in topics if t.id==topic_id)
            paper={'title':title,'summary':summary,'categories':['cs.LG','cs.AI']}
            # The causal example must not smuggle the excluded policy term into the test itself.
            if topic_id=='causal_reinforcement_learning':paper['summary']='A causal discovery method for multivariate time series and nonstationarity.'
            self.assertFalse(is_relevant_enough(paper,score_paper(topic,paper)),topic_id)

    def test_application_domain_is_required_even_for_method_match(self):
        from scripts.collect_papers import build_llm_prompt
        config={'application_domains':[{'id':'finance','name':'金融','keywords':['financial','trading']}, {'id':'emotion','name':'情绪','keywords':['emotion','sentiment']}, {'id':'scientific_discovery','name':'科学发现','keywords':['scientific discovery']}], 'topics':[{'id':'causal_rl','name':'因果强化学习','keywords':['causal reinforcement learning'],'required_keyword_groups':[['causal'],['reinforcement learning']]}]}
        topic=parse_topics(config)[0]
        for domain in ['financial trading', 'emotion recognition', 'scientific discovery']:
            p={'title':'Causal reinforcement learning for '+domain,'summary':'We evaluate a causal reinforcement learning method for '+domain+'.'}
            self.assertTrue(is_relevant_enough(p,score_paper(topic,p)),domain)
        p={'title':'Causal reinforcement learning for robot locomotion','summary':'Experiments evaluate policies on robot control benchmarks.'}
        self.assertFalse(is_relevant_enough(p,score_paper(topic,p)))
        self.assertIn('application_domain',build_llm_prompt(topic,p,score_paper(topic,p)))
        self.assertIn('不能',build_llm_prompt(topic,p,score_paper(topic,p)))

    def test_model_cannot_pass_an_unverified_application_domain(self):
        from unittest.mock import patch
        from scripts.collect_papers import summarize_with_llm
        topic=parse_topics({'application_domains':[{'id':'finance','name':'金融','keywords':['financial']}], 'topics':[{'id':'t','name':'方法','keywords':['causal']} ]})[0]
        p={'title':'Financial causal inference','summary':'A financial causal method evaluated on real markets.'}
        base=score_paper(topic,p)
        for answer in [{'match_level':'high','application_domain':'other','domain_evidence':'Financial'}, {'match_level':'high','application_domain':'finance','domain_evidence':'invented financial evidence'}, {'match_level':'high'}]:
            with patch('scripts.collect_papers.llm_enabled',return_value=True), patch('scripts.collect_papers.call_openai_compatible',return_value=answer):
                _,match=summarize_with_llm(topic,p,base)
            self.assertEqual(match['level'],'low')
