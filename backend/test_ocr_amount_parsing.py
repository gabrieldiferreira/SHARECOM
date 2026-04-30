import unittest

from ocr_processor import (
    AMOUNT_CANDIDATE_PATTERN,
    _clean_amount_value,
    _extract_destination_institution,
    _extract_merchant_name,
    _extract_transaction_id,
)


class OcrAmountParsingTest(unittest.TestCase):
    def test_normalizes_space_as_decimal_separator(self):
        self.assertEqual(_clean_amount_value("904 88"), 904.88)

    def test_keeps_existing_brazilian_and_us_formats(self):
        self.assertEqual(_clean_amount_value("1.234,56"), 1234.56)
        self.assertEqual(_clean_amount_value("1,234.56"), 1234.56)
        self.assertEqual(_clean_amount_value("205,00"), 205.0)

    def test_finds_space_decimal_candidate(self):
        text = "TOTAL\nR$ 904 88\nObrigado"

        candidates = AMOUNT_CANDIDATE_PATTERN.findall(text)

        self.assertIn("904 88", candidates)
        self.assertEqual(_clean_amount_value(candidates[0]), 904.88)

    def test_prefers_plain_pix_id_over_document_number(self):
        text = (
            "Informações adicionais ID: E0000000020250903231124661314547 "
            "Documento: 000000000090303 Autenticação SISBB: E.A7A.10D.21F.16A.338"
        )

        self.assertEqual(
            _extract_transaction_id(text),
            "E0000000020250903231124661314547",
        )

    def test_uses_document_number_as_last_fallback(self):
        text = "Comprovante Pix Documento: 000000000090303"

        self.assertEqual(_extract_transaction_id(text), "000000000090303")

    def test_extracts_single_line_bb_pix_receiver(self):
        text = (
            "Comprovante BB Pix Enviado R$ 150,00 03/09/2025 às 20:11:40 "
            "Recebedor Federacao Bahiana de Xadrez CNPJ 32.698.193/0001-92 "
            "Agência 3292 Conta 68985"
        )

        self.assertEqual(_extract_merchant_name(text), "Federacao Bahiana de Xadrez")

    def test_extracts_single_line_bb_pix_destination_institution(self):
        text = (
            "Agência 3292 Conta 68985 Instituição 04321309 CC SICOOB INOVA "
            "Tipo de conta Conta Corrente Chave Pix fbxxadrez@gmail.com"
        )

        self.assertEqual(_extract_destination_institution(text), "04321309 CC SICOOB INOVA")


if __name__ == "__main__":
    unittest.main()
