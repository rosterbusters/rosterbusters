import logging
from sqlmodel import Session

from app.core.db import engine
from app.seed_data import seed_admin_user, seed_roles

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def main() -> None:
    logger.info("Seeding admin user only")
    with Session(engine) as session:
        roles = seed_roles(session)
        seed_admin_user(session, roles)
    logger.info("Admin user seeding completed")


if __name__ == "__main__":
    main()
