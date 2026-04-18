import sys
import os
import unittest
from unittest.mock import patch, MagicMock

# Add backend to path
sys.path.append(os.path.join(os.getcwd(), 'backend'))

import ai_agent

class TestAIBalancer(unittest.TestCase):
    
    @patch('ai_agent._call_gemini')
    @patch('ai_agent._call_openrouter')
    def test_failover_mechanism(self, mock_openrouter, mock_gemini):
        # Setup: Gemini fails with quota error, then first OpenRouter model fails with garbage JSON, 
        # then second OpenRouter model succeeds.
        
        mock_gemini.side_effect = Exception("quota exceeded")
        
        # OpenRouter will be called twice. 
        # First call returns garbage.
        # Second call returns valid JSON.
        mock_openrouter.side_effect = [
            "This is not JSON at all!",
            '{"total_amount": 10.5, "currency": "BRL", "merchant_name": "Success Store"}'
        ]
        
        # Configure env-like variables in ai_agent
        with patch('ai_agent.GEMINI_KEY', 'fake_key'), \
             patch('ai_agent.OPENROUTER_API_KEY', 'fake_key'), \
             patch('ai_agent.OPENROUTER_MODEL_PRIMARY', 'model1'), \
             patch('ai_agent.OPENROUTER_FALLBACK_MODELS', ['model2']):
            
            # Reset cooldowns
            ai_agent.GEMINI_QUOTA_RETRY_AT = 0
            ai_agent.OPENROUTER_QUOTA_RETRY_AT = 0
            
            result = ai_agent.extract_transaction_data(b"dummy_content", ".jpg")
            
            self.assertEqual(result['total_amount'], 10.5)
            self.assertEqual(result['merchant_name'], "Success Store")
            # Verify calls
            self.assertEqual(mock_gemini.call_count, 1)
            self.assertEqual(mock_openrouter.call_count, 2)

    @patch('ai_agent._call_gemini')
    @patch('ai_agent._call_openrouter')
    def test_best_effort_fallback(self, mock_openrouter, mock_gemini):
        # Setup: All fail or return garbage. Final one returns something that can be partially parsed.
        mock_gemini.side_effect = Exception("General Error")
        mock_openrouter.return_value = "Total amount is 50.0 and merchant is Partial Store"
        
        with patch('ai_agent.GEMINI_KEY', 'fake_key'), \
             patch('ai_agent.OPENROUTER_API_KEY', 'fake_key'), \
             patch('ai_agent.OPENROUTER_MODEL_PRIMARY', 'model1'), \
             patch('ai_agent.OPENROUTER_FALLBACK_MODELS', []):
            
            ai_agent.GEMINI_QUOTA_RETRY_AT = 0
            ai_agent.OPENROUTER_QUOTA_RETRY_AT = 0
            
            result = ai_agent.extract_transaction_data(b"dummy_content", ".jpg")
            
            # Should use best effort
            self.assertEqual(result['total_amount'], 50.0)
            self.assertEqual(result['merchant_name'], "Partial Store")

if __name__ == '__main__':
    unittest.main()
