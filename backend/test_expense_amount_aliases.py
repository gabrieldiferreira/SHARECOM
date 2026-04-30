import unittest

import schemas


class ExpenseAmountAliasesTest(unittest.TestCase):
    def test_maps_total_amount_to_amount(self):
        expense = schemas.ExpenseCreate(
            total_amount=150.0,
            category="Outros",
            merchant="Teste",
        )

        self.assertEqual(expense.amount, 150.0)

    def test_maps_value_to_amount(self):
        expense = schemas.ExpenseCreate(
            value=904.88,
            category="Outros",
            merchant="Teste",
        )

        self.assertEqual(expense.amount, 904.88)

    def test_amount_takes_precedence_over_aliases(self):
        expense = schemas.ExpenseCreate(
            amount=205.0,
            total_amount=150.0,
            value=904.88,
            category="Outros",
            merchant="Teste",
        )

        self.assertEqual(expense.amount, 205.0)


if __name__ == "__main__":
    unittest.main()
