from sqlalchemy import Column, Integer, String, Float, DateTime, UniqueConstraint, LargeBinary, Text
from database import Base
import datetime

class Expense(Base):
    __tablename__ = "expenses"
    __table_args__ = (
        UniqueConstraint('user_id', 'transaction_id', name='uq_user_transaction_id'),
    )
    user_id = Column(String, index=True)


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
    transaction_id = Column(String, index=True)
    masked_cpf = Column(String)
    note = Column(String, nullable=True) # User provided notes
    deleted_at = Column(DateTime, nullable=True) # For soft-delete synchronization

class PatternLog(Base):
    __tablename__ = "pattern_logs"
    user_id = Column(String, index=True)

    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)
    filename = Column(String)
    raw_text = Column(String)
    structural_map = Column(String)
    extracted_json = Column(String)
    hash = Column(String, unique=True)

class ReceiptArchive(Base):
    __tablename__ = "receipt_archives"
    __table_args__ = (
        UniqueConstraint('user_id', 'receipt_hash', name='uq_user_receipt_hash'),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String, index=True)
    receipt_hash = Column(String, index=True, nullable=False)
    filename = Column(String)
    extension = Column(String)
    content = Column(LargeBinary, nullable=False)
    raw_text = Column(Text, nullable=True)
    status = Column(String, default="received") # received, processed, pending_review, duplicate, error
    error = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

class Goal(Base):
    __tablename__ = "goals"
    user_id = Column(String, index=True)
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    target_amount = Column(Float, nullable=False)
    current_amount = Column(Float, default=0.0)
    deadline = Column(DateTime, nullable=True)
    category = Column(String, default="Outros")
    status = Column(String, default="active") # active, completed, archived
    
    # Automation flags
    auto_round_up = Column(Integer, default=0) # 0 for off, or the rounding value (e.g. 10)
    auto_transfer_amount = Column(Float, default=0.0)
    auto_transfer_day = Column(Integer, nullable=True) # Day of month
    
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
