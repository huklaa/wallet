#!/bin/bash
set -uo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
CHECKER="${ROOT_DIR}/scripts/check-changelog-placement.sh"
tmp_dir=$(mktemp -d)
trap 'rm -rf "${tmp_dir}"' EXIT

passed=0
failed=0

run_case() {
    local name="$1"
    local expected="$2"
    local changelog="$3"
    local added_lines="$4"
    local latest="${5:-1.16.1}"

    local changelog_file="${tmp_dir}/${name}.md"
    local added_file="${tmp_dir}/${name}.lines"

    printf '%s\n' "${changelog}" >"${changelog_file}"
    printf '%s\n' "${added_lines}" >"${added_file}"

    if bash "${CHECKER}" "${changelog_file}" "${latest}" "${added_file}" >/dev/null 2>&1; then
        actual=pass
    else
        actual=fail
    fi

    if [ "${actual}" = "${expected}" ]; then
        printf 'ok - %s\n' "${name}"
        passed=$((passed + 1))
    else
        printf 'not ok - %s (expected %s, got %s)\n' "${name}" "${expected}" "${actual}" >&2
        failed=$((failed + 1))
    fi
}

run_case open_tbd pass '# Changelog
## 1.16.2 (TBD)
### Fixes
- new fix
## 1.16.1 (2026-09-15)
- old fix' '4'

run_case dated_published fail '# Changelog
## 1.16.2 (TBD)
- pending
## 1.16.1 (2026-09-15)
### Fixes
- retroactive fix' '6'

run_case stale_tbd fail '# Changelog
## 1.16.2 (2026-09-20)
- current
## 1.15.13 (TBD)
### Fixes
- stale edit' '6' '1.16.1'

run_case opens_new_section pass '# Changelog
## 1.16.3 (TBD)
### Fixes
- new section fix
## 1.16.2 (TBD)
- existing pending' '2
3
4'

run_case release_dates_heading pass '# Changelog
## 1.16.2 (2026-09-20)
- pending fix
## 1.16.1 (2026-09-15)
- old fix' '2'

run_case release_dates_heading_and_entry pass '# Changelog
## 1.16.2 (2026-09-20)
### Fixes
- final release fix
## 1.16.1 (2026-09-15)
- old fix' '2
4'

run_case pure_deletion pass '# Changelog
## 1.16.2 (TBD)
- remaining fix
## 1.16.1 (2026-09-15)
- old fix' ''

run_case whitespace_in_published pass '# Changelog
## 1.16.2 (TBD)
- pending
## 1.16.1 (2026-09-15)
   
- old fix' '5'

run_case entry_before_heading fail '# Changelog
- misplaced fix
## 1.16.2 (TBD)
- pending' '2'

run_case preamble_edit pass '# Changelog
Release notes for Miden Wallet.
## 1.16.2 (TBD)
- pending' '2'

# The top-level driver must fail closed if git cannot produce the PR diff.
if (
    cd "${ROOT_DIR}" &&
        BASE_REF=__definitely_missing_changelog_test_ref__             NO_CHANGELOG_LABEL=false             bash scripts/check-changelog.sh CHANGELOG.md >/dev/null 2>&1
); then
    printf 'not ok - git failure must fail closed\n' >&2
    failed=$((failed + 1))
else
    printf 'ok - git failure fails closed\n'
    passed=$((passed + 1))
fi

printf '%d passed, %d failed\n' "${passed}" "${failed}"
[ "${failed}" -eq 0 ]
