from pydantic import BaseModel
from datetime import datetime

class ExpenseBase(BaseModel):
    amount: float
    category: str
    merchant: str
    description: str | None = None
    receipt: str | None = None
    transaction_type: str = "Outflow"
    payment_method: str | None = None
    destination_institution: str | None = None
    transaction_id: str | None = None
    masked_cpf: str | None = None
    note: str | None = None
    deleted_at: datetime | None = None

class ExpenseCreate(ExpenseBase):
    date: datetime | None = None # Allow passing extracted timestamp

class Expense(ExpenseBase):
    id: int
    date: datetime

    class Config:
        from_attributes = True
