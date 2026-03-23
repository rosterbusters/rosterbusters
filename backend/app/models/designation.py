"""
Designation reference data.

Stores the canonical designation codes and their roster rank (A/B/C).
"""
from sqlalchemy import Column, String
from sqlmodel import Field, SQLModel


class Designation(SQLModel, table=True):
    __tablename__ = "designation"

    designation: str = Field(
        sa_column=Column("designation", String(50), primary_key=True)
    )
    rank: str = Field(sa_column=Column("rank", String(1), nullable=False))
