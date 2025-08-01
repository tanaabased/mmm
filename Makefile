.PHONY: install lint format test check precommit setup clean

# Install dependencies
install:
	poetry config virtualenvs.in-project true
	poetry install

# Run Black and Ruff to fix formatting and lint issues
lint:
	poetry run black .
	poetry run ruff check . --fix

# Run only Black formatter
format:
	poetry run black .

# Run tests (assuming pytest is used)
test:
	poetry run pytest

# Run Ruff without fixing (to check status)
check:
	poetry run ruff check .

# Install pre-commit hook
precommit:
	poetry run pre-commit install

# One-liner setup for new devs
setup: install precommit

# Clean cache files
clean:
	find . -type d -name "__pycache__" -exec rm -r {} +
