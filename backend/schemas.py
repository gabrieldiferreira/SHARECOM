from pydantic import BaseModel, model_validator
from datetime import datetime

class ExpenseBase(BaseModel):
    user_id: str | None = None

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
    scanned_at: datetime | None = None
    deleted_at: datetime | None = None

    @model_validator(mode="before")
    @classmethod
    def map_amount_aliases(cls, data):
        if isinstance(data, dict) and data.get("amount") in (None, ""):
            for alias in ("total_amount", "value"):
                alias_value = data.get(alias)
                if alias_value not in (None, ""):
                    data = {**data, "amount": alias_value}
                    break
        return data

class ExpenseCreate(ExpenseBase):
    date: datetime | None = None # Allow passing extracted timestamp

class Expense(ExpenseBase):
    id: int
    date: datetime

    class Config:
        from_attributes = True

class GoalBase(BaseModel):
    name: str
    target_amount: float
    current_amount: float = 0.0
    deadline: datetime | None = None
    category: str = "Outros"
    status: str = "active"
    auto_round_up: int = 0
    auto_transfer_amount: float = 0.0
    auto_transfer_day: int | None = None

class GoalCreate(GoalBase):
    pass

class GoalUpdate(BaseModel):
    name: str | None = None
    target_amount: float | None = None
    current_amount: float | None = None
    deadline: datetime | None = None
    category: str | None = None
    status: str | None = None
    auto_round_up: int | None = None
    auto_transfer_amount: float | None = None
    auto_transfer_day: int | None = None

class Goal(GoalBase):
    id: int
    user_id: str
    created_at: datetime

    class Config:
        from_attributes = True
