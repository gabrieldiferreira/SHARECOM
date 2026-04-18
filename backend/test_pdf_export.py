"""Tests for the Receita Federal PDF export and helper functions."""
import re
import pytest
from datetime import datetime
from fastapi.testclient import TestClient

from export_routes import fmt_real, fmt_cpf_cnpj, _generate_hash, _parse_tx_date


# ---------------------------------------------------------------------------
# fmt_real
# ---------------------------------------------------------------------------
class TestFmtReal:
    def test_positive_integer(self):
        assert fmt_real(100.0) == "R$ 100,00"

    def test_positive_with_cents(self):
        assert fmt_real(1234.56) == "R$ 1.234,56"

    def test_large_value(self):
        assert fmt_real(10500.00) == "R$ 10.500,00"

    def test_zero(self):
        assert fmt_real(0.0) == "R$ 0,00"

    def test_small_value(self):
        assert fmt_real(0.50) == "R$ 0,50"

    def test_negative_value_parentheses(self):
        assert fmt_real(-2345.67) == "(R$ 2.345,67)"

    def test_negative_small(self):
        assert fmt_real(-100.0) == "(R$ 100,00)"

    def test_always_two_decimals(self):
        result = fmt_real(5.0)
        assert result.endswith(",00")

    def test_millions(self):
        assert fmt_real(1234567.89) == "R$ 1.234.567,89"

    def test_has_space_after_symbol(self):
        result = fmt_real(100.0)
        assert result.startswith("R$ ")

    def test_no_dot_separator_for_decimals(self):
        result = fmt_real(1234.56)
        # Should NOT contain ".56" (American style)
        assert ".56" not in result
        # Should contain ",56" (Brazilian style)
        assert ",56" in result


# ---------------------------------------------------------------------------
# fmt_cpf_cnpj
# ---------------------------------------------------------------------------
class TestFmtCpfCnpj:
    def test_cpf_digits_only(self):
        assert fmt_cpf_cnpj("12345678901") == "123.456.789-01"

    def test_cnpj_digits_only(self):
        assert fmt_cpf_cnpj("12345678000190") == "12.345.678/0001-90"

    def test_already_formatted_cpf(self):
        # If already formatted (non-standard length after digit extraction),
        # return as-is
        result = fmt_cpf_cnpj("123.456.789-01")
        assert result == "123.456.789-01"

    def test_empty_string(self):
        assert fmt_cpf_cnpj("") == ""

    def test_none(self):
        assert fmt_cpf_cnpj(None) == ""

    def test_cnpj_with_existing_formatting(self):
        result = fmt_cpf_cnpj("12.345.678/0001-90")
        assert result == "12.345.678/0001-90"


# ---------------------------------------------------------------------------
# _generate_hash
# ---------------------------------------------------------------------------
class TestGenerateHash:
    def test_returns_16_chars(self):
        h = _generate_hash("Test", "18/04/2026 14:30", 5)
        assert len(h) == 16

    def test_uppercase(self):
        h = _generate_hash("Test", "18/04/2026 14:30", 5)
        assert h == h.upper()

    def test_deterministic(self):
        h1 = _generate_hash("A", "B", 1)
        h2 = _generate_hash("A", "B", 1)
        assert h1 == h2

    def test_different_input_different_hash(self):
        h1 = _generate_hash("A", "B", 1)
        h2 = _generate_hash("C", "D", 2)
        assert h1 != h2


# ---------------------------------------------------------------------------
# _parse_tx_date
# ---------------------------------------------------------------------------
class TestParseTxDate:
    def test_iso_format(self):
        dt = _parse_tx_date("2026-04-18T14:30:00")
        assert dt.year == 2026
        assert dt.month == 4
        assert dt.day == 18

    def test_iso_with_z(self):
        dt = _parse_tx_date("2026-04-18T14:30:00Z")
        assert dt.year == 2026

    def test_invalid_returns_now(self):
        dt = _parse_tx_date("not-a-date")
        assert isinstance(dt, datetime)


# ---------------------------------------------------------------------------
# PDF endpoint integration test
# ---------------------------------------------------------------------------
@pytest.fixture
def client():
    from main import app
    return TestClient(app, raise_server_exceptions=True)


SAMPLE_PAYLOAD = {
    "transactions": [
        {
            "merchant_name": "Supermercado Extra",
            "total_amount": 187.50,
            "category": "Alimentação",
            "transaction_type": "Outflow",
            "payment_method": "Cartão",
            "transaction_date": "2026-04-15T10:00:00",
        },
        {
            "merchant_name": "Uber",
            "total_amount": 24.80,
            "category": "Transporte",
            "transaction_type": "Outflow",
            "payment_method": "Cartão",
            "transaction_date": "2026-04-17T08:30:00",
        },
        {
            "merchant_name": "Salário Empresa XYZ",
            "total_amount": 4500.00,
            "category": "Receita",
            "transaction_type": "Inflow",
            "payment_method": "Transferência",
            "transaction_date": "2026-04-18T12:00:00",
        },
    ],
    "report_title": "RELATÓRIO FINANCEIRO",
    "customer_name": "Gabriel Ferreira dos Santos Silva",
    "customer_cpf_cnpj": "12345678901",
}


class TestPdfEndpoint:
    def test_returns_pdf(self, client):
        resp = client.post("/export/pdf", json=SAMPLE_PAYLOAD)
        assert resp.status_code == 200
        assert resp.headers["content-type"] == "application/pdf"

    def test_pdf_has_content(self, client):
        resp = client.post("/export/pdf", json=SAMPLE_PAYLOAD)
        assert len(resp.content) > 500  # a real PDF is non-trivial

    def test_pdf_starts_with_magic_bytes(self, client):
        resp = client.post("/export/pdf", json=SAMPLE_PAYLOAD)
        assert resp.content[:5] == b"%PDF-"

    def test_content_disposition_filename(self, client):
        resp = client.post("/export/pdf", json=SAMPLE_PAYLOAD)
        cd = resp.headers.get("content-disposition", "")
        assert "relatorio_" in cd
        assert cd.endswith('.pdf"')

    def test_empty_transactions(self, client):
        payload = {
            "transactions": [],
            "customer_name": "Teste",
        }
        resp = client.post("/export/pdf", json=payload)
        assert resp.status_code == 200

    def test_negative_saldo(self, client):
        payload = {
            "transactions": [
                {
                    "merchant_name": "Loja",
                    "total_amount": 500.0,
                    "category": "Compras",
                    "transaction_type": "Outflow",
                    "payment_method": "Dinheiro",
                    "transaction_date": "2026-04-10T09:00:00",
                },
            ],
        }
        resp = client.post("/export/pdf", json=payload)
        assert resp.status_code == 200

    def test_with_cnpj(self, client):
        payload = {
            **SAMPLE_PAYLOAD,
            "customer_cpf_cnpj": "12345678000190",
        }
        resp = client.post("/export/pdf", json=payload)
        assert resp.status_code == 200
