import sqlite3
import os

db_path = "expenses.db"

if os.path.exists(db_path):
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    columns_to_add = [
        ("transaction_type", "TEXT DEFAULT 'Outflow'"),
        ("payment_method", "TEXT"),
        ("destination_institution", "TEXT"),
        ("transaction_id", "TEXT"),
        ("masked_cpf", "TEXT"),
        ("note", "TEXT"),
        ("deleted_at", "DATETIME")
    ]

    for col_name, col_type in columns_to_add:
        try:
            cursor.execute(f"ALTER TABLE expenses ADD COLUMN {col_name} {col_type}")
            print(f"Coluna {col_name} adicionada com sucesso.")
        except sqlite3.OperationalError:
            print(f"Coluna {col_name} já existe ou erro ao adicionar.")

    conn.commit()
    conn.close()
    print("Migração concluída!")
else:
    print("Arquivo expenses.db não encontrado. O SQLAlchemy o criará automaticamente no próximo reinício.")
