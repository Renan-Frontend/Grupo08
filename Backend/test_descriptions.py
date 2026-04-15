#!/usr/bin/env python3
"""Test script to validate contextual entity descriptions."""

import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from main import _default_entity_description

def test_contextual_descriptions():
    """Test that entity descriptions include process context."""

    # Test with process name
    desc_with_process = _default_entity_description("Cliente", "principal", "Aprovacao de Credito")
    print(f"Cliente com processo: {desc_with_process}")

    # Test without process name
    desc_without_process = _default_entity_description("Cliente", "principal", "")
    print(f"Cliente sem processo: {desc_without_process}")

    # Test other entities
    desc_fornecedor = _default_entity_description("Fornecedor", "", "Compra de Materiais")
    print(f"Fornecedor: {desc_fornecedor}")

    desc_funcionario = _default_entity_description("Funcionario", "", "Processo de RH")
    print(f"Funcionario: {desc_funcionario}")

    # Verify process context is included
    assert "Aprovacao de Credito" in desc_with_process, "Process name should be included in description"
    assert "Compra de Materiais" in desc_fornecedor, "Process name should be included for fornecedor"
    assert "Processo de RH" in desc_funcionario, "Process name should be included for funcionario"

    print("✅ All contextual description tests passed!")

if __name__ == "__main__":
    test_contextual_descriptions()