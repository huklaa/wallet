#!/bin/bash
set -uo pipefail

CHANGELOG_FILE="${1:?changelog path required}"
LATEST_RELEASE_VERSION="${2:?latest release version required}"
ADDED_LINES_FILE="${3:?added-lines file required}"

awk -v latest="${LATEST_RELEASE_VERSION}" '
function parse_version(version, out,    n, parts) {
    gsub(/^v/, "", version)
    sub(/[^0-9.].*$/, "", version)
    n = split(version, parts, ".")
    if (n < 2 || parts[1] !~ /^[0-9]+$/ || parts[2] !~ /^[0-9]+$/) {
        return 0
    }
    out[1] = parts[1] + 0
    out[2] = parts[2] + 0
    out[3] = (n >= 3 && parts[3] ~ /^[0-9]+$/) ? parts[3] + 0 : 0
    return 1
}

function version_gt(a, b,    av, bv, i) {
    delete av
    delete bv
    if (!parse_version(a, av) || !parse_version(b, bv)) {
        return -1
    }
    for (i = 1; i <= 3; i++) {
        if (av[i] > bv[i]) return 1
        if (av[i] < bv[i]) return 0
    }
    return 0
}

BEGIN {
    while ((getline line_no < ARGV[2]) > 0) {
        added[line_no + 0] = 1
    }
    close(ARGV[2])
    ARGV[2] = ""

    if (!parse_version(latest, latest_parts)) {
        print "Invalid latest release version: " latest > "/dev/stderr"
        exit 2
    }
}

/^## / {
    section_heading = $0
    section_version = $2
}

{
    if (!added[FNR]) {
        next
    }

    # Section headings are management operations, not changelog entries.
    if ($0 ~ /^## /) {
        next
    }

    # Whitespace-only additions never constitute an entry.
    if ($0 ~ /^[[:space:]]*$/) {
        next
    }

    # Before the first version heading, ordinary preamble edits are allowed,
    # but adding a list entry there is not.
    if (section_heading == "") {
        if ($0 ~ /^[[:space:]]*[-*][[:space:]]+/) {
            printf "Added changelog entry on line %d is not under a version heading: %s\n", FNR, $0 > "/dev/stderr"
            failed = 1
        }
        next
    }

    newer = version_gt(section_version, latest)
    if (newer == -1) {
        printf "Could not parse changelog version from heading governing line %d: %s\n", FNR, section_heading > "/dev/stderr"
        failed = 1
        next
    }

    if (!newer) {
        printf "Added changelog content on line %d is under published section %s (latest release v%s): %s\n", FNR, section_heading, latest, $0 > "/dev/stderr"
        failed = 1
    }
}

END {
    if (failed) exit 1
}
' "${CHANGELOG_FILE}" "${ADDED_LINES_FILE}"
