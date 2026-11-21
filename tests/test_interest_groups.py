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
