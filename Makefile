SETUP_SCRIPT ?= scripts/setup-worktree.sh

.PHONY: setup
setup:
	@$(SETUP_SCRIPT)
