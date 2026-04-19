from sqlalchemy import Column, Integer, String, Float, DateTime
from database import Base
import datetime

class Expense(Base):
    __tablename__ = "expenses"

    id = Column(Integer, primary_key=True, index=True)
    date = Column(DateTime, default=datetime.datetime.utcnow) # Represents temporal timestamp
    amount = Column(Float, nullable=False)
    category = Column(String, index=True)
    merchant = Column(String, index=True) # Also acts as recipient_name
    description = Column(String)
    receipt = Column(String, nullable=True) # The hash
    
    # New fields for intelligence
    transaction_type = Column(String, default="Outflow")
    payment_method = Column(String)
    destination_institution = Column(String)
    transaction_id = Column(String, unique=True, index=True)
    masked_cpf = Column(String)
    note = Column(String, nullable=True) # User provided notes
    is_deductible = Column(Integer, default=0) # 0 for False, 1 for True (SQLite/Postgres friendly)
    reimbursement_status = Column(String, default="None") # "None", "Pending", "Paid", "Overdue"

class PatternLog(Base):
    __tablename__ = "pattern_logs"
    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)
    filename = Column(String)
    raw_text = Column(String)
    structural_map = Column(String)
    extracted_json = Column(String)
    hash = Column(String, unique=True)
