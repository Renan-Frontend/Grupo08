#!/usr/bin/env python3
"""Test script to validate process context extraction from goals."""

import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from main import _default_entity_description

def test_process_context_extraction():
    """Test that process context is extracted from goals."""

    # Test with process name
    desc_with_process = _default_entity_description("Cliente", "principal", "compras")
    print(f"Cliente com processo 'compras': {desc_with_process}")

    # Test with inferred process
    desc_inferred = _default_entity_description("Solicitacao", "principal", "")
    print(f"Solicitacao com inferência: {desc_inferred}")

    # Test specific entity patterns
    desc_pagamento = _default_entity_description("Pagamento", "associativa", "")
    print(f"Pagamento: {desc_pagamento}")

    # Verify process context is included
    assert "compras" in desc_with_process, "Process name should be included in description"
    assert "solicitação" in desc_inferred.lower(), "Should recognize solicitation pattern"
    assert "financeiro" in desc_pagamento.lower() or "pagamento" in desc_pagamento.lower(), "Should recognize payment pattern"

    print("✅ All process context tests passed!")

if __name__ == "__main__":
    test_process_context_extraction()