import logging

from sqlmodel import Session

from app.core.db import engine, init_db
from app.seed_core import seed_core_data

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def init() -> None:
    with Session(engine) as session:
        seed_core_data(session)
        init_db(session)


def main() -> None:
    logger.info("Creating initial data")
    init()
    logger.info("Initial data created")


if __name__ == "__main__":
    main()
