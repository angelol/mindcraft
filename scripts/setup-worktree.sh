#!/usr/bin/env bash
set -euo pipefail

NODE_VERSION="22.22.2"
CONFIG_FILES=("keys.json" "settings.js" "andy.json")

log() {
    printf '%s\n' "$*"
}

repo_root() {
    git rev-parse --show-toplevel
}

git_common_dir() {
    git rev-parse --path-format=absolute --git-common-dir
}

main_workspace() {
    local common_dir
    common_dir="$(git_common_dir)"

    if [[ "$(basename "$common_dir")" != ".git" ]]; then
        log "Unable to infer main workspace from git common dir: $common_dir" >&2
        return 1
    fi

    dirname "$common_dir"
}

copy_config_file() {
    local source_dir="$1"
    local target_dir="$2"
    local name="$3"
    local source="$source_dir/$name"
    local target="$target_dir/$name"

    if [[ ! -f "$source" ]]; then
        log "skip $name: missing in main workspace"
        return
    fi

    if [[ "$source" == "$target" ]]; then
        log "ok $name: already in main workspace"
        return
    fi

    if [[ -f "$target" ]]; then
        if cmp -s "$source" "$target"; then
            log "ok $name: already up to date"
            return
        fi

        if [[ "${FORCE:-0}" != "1" ]]; then
            log "skip $name: exists and differs; rerun with FORCE=1 to overwrite"
            return
        fi
    fi

    cp "$source" "$target"
    log "copied $name"
}

setup_node() {
    local root="$1"
    printf '%s\n' "$NODE_VERSION" > "$root/.nvmrc"

    if [[ -s "$HOME/.nvm/nvm.sh" ]]; then
        # shellcheck disable=SC1091
        source "$HOME/.nvm/nvm.sh"
        nvm install "$NODE_VERSION" >/dev/null
        nvm use "$NODE_VERSION" >/dev/null
        log "using node $(node -v)"
        return
    fi

    log "warning: nvm not found; expected Node $NODE_VERSION"
}

install_dependencies() {
    if [[ "${SETUP_SKIP_INSTALL:-0}" == "1" ]]; then
        log "skip npm install: SETUP_SKIP_INSTALL=1"
        return
    fi

    npm install
    npx patch-package --error-on-fail --error-on-warn
}

main() {
    local root source
    root="$(repo_root)"
    source="$(main_workspace)"

    log "Workspace: $root"
    log "Main workspace: $source"

    setup_node "$root"

    for name in "${CONFIG_FILES[@]}"; do
        copy_config_file "$source" "$root" "$name"
    done

    install_dependencies
    log "setup complete"
}

main "$@"
