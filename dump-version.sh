#!/bin/bash
#
# dump-version.sh - Prepare a new release version for gopher-mcp-js
#
# Usage:
#   ./dump-version.sh [VERSION]
#
# Arguments:
#   VERSION - Optional. Format: X.Y.Z or X.Y.Z.E
#             If not provided, uses latest gopher-orch release version (X.Y.Z)
#             If provided as X.Y.Z.E, X.Y.Z must match gopher-orch version
#
# This script will:
#   1. Fetch latest version from gopher-orch releases
#   2. Validate and determine the target version
#   3. Update package.json and native gopher-orch package pins
#   4. Auto-populate CHANGELOG.md [Unreleased] with concise release highlights
#      (manual entries already in [Unreleased] are preserved and shown first)
#   5. Promote [Unreleased] -> [X.Y.Z] - date
#   6. Commit the changes
#
# After running this script:
#   1. Review the changes: git diff HEAD~1
#   2. Push to release: git push origin br_release
#

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Files
PACKAGE_JSON="package.json"
CHANGELOG_FILE="CHANGELOG.md"
PACKAGES_DIR="packages"

echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}  gopher-mcp-js Release Version Dump${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""

# -----------------------------------------------------------------------------
# Step 1: Fetch latest gopher-orch version from GitHub releases
# -----------------------------------------------------------------------------
echo -e "${YELLOW}Step 1: Fetching latest gopher-orch version...${NC}"

# Check if gh CLI is available
if ! command -v gh &> /dev/null; then
    echo -e "${RED}Error: GitHub CLI (gh) is not installed${NC}"
    echo "Install it with: brew install gh"
    echo "Then authenticate: gh auth login"
    exit 1
fi

# Fetch latest release from gopher-orch using gh CLI (handles private repo auth)
GOPHER_ORCH_TAG=$(gh release view --repo GopherSecurity/gopher-orch --json tagName -q '.tagName' 2>/dev/null)

if [ -z "$GOPHER_ORCH_TAG" ]; then
    echo -e "${RED}Error: Could not fetch latest gopher-orch release${NC}"
    echo "Make sure you have access to GopherSecurity/gopher-orch repository."
    echo "Run 'gh auth login' to authenticate if needed."
    exit 1
fi

# Remove 'v' prefix if present (e.g., v0.1.1 -> 0.1.1)
GOPHER_ORCH_VERSION="${GOPHER_ORCH_TAG#v}"

if [ -z "$GOPHER_ORCH_VERSION" ]; then
    echo -e "${RED}Error: Could not parse gopher-orch version from release${NC}"
    exit 1
fi

echo -e "  Latest gopher-orch version: ${GREEN}$GOPHER_ORCH_VERSION${NC}"

# Validate gopher-orch version format (X.Y.Z)
if ! echo "$GOPHER_ORCH_VERSION" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+$'; then
    echo -e "${RED}Error: gopher-orch version '$GOPHER_ORCH_VERSION' is not in X.Y.Z format${NC}"
    exit 1
fi

# -----------------------------------------------------------------------------
# Step 2: Determine target version
# -----------------------------------------------------------------------------
echo ""
echo -e "${YELLOW}Step 2: Determining target version...${NC}"

INPUT_VERSION="$1"

if [ -z "$INPUT_VERSION" ]; then
    # No argument provided, use gopher-orch version directly
    TARGET_VERSION="$GOPHER_ORCH_VERSION"
    echo -e "  No version argument provided"
    echo -e "  Using gopher-orch version: ${GREEN}$TARGET_VERSION${NC}"
else
    # Version argument provided, validate it
    # Format should be X.Y.Z or X.Y.Z.E
    if echo "$INPUT_VERSION" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+$'; then
        # X.Y.Z format - must match gopher-orch exactly
        if [ "$INPUT_VERSION" != "$GOPHER_ORCH_VERSION" ]; then
            echo -e "${RED}Error: Version $INPUT_VERSION does not match gopher-orch version $GOPHER_ORCH_VERSION${NC}"
            exit 1
        fi
        TARGET_VERSION="$INPUT_VERSION"
    elif echo "$INPUT_VERSION" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$'; then
        # X.Y.Z.E format - first 3 parts must match gopher-orch
        INPUT_BASE=$(echo "$INPUT_VERSION" | sed -E 's/^([0-9]+\.[0-9]+\.[0-9]+)\.[0-9]+$/\1/')
        if [ "$INPUT_BASE" != "$GOPHER_ORCH_VERSION" ]; then
            echo -e "${RED}Error: Version base $INPUT_BASE does not match gopher-orch version $GOPHER_ORCH_VERSION${NC}"
            echo "Extended version X.Y.Z.E must have X.Y.Z matching gopher-orch."
            exit 1
        fi
        TARGET_VERSION="$INPUT_VERSION"
    else
        echo -e "${RED}Error: Invalid version format '$INPUT_VERSION'${NC}"
        echo "Expected format: X.Y.Z or X.Y.Z.E"
        exit 1
    fi
    echo -e "  Using provided version: ${GREEN}$TARGET_VERSION${NC}"
fi

# -----------------------------------------------------------------------------
# Step 3: Read current version from package.json
# -----------------------------------------------------------------------------
echo ""
echo -e "${YELLOW}Step 3: Reading current version...${NC}"

if [ ! -f "$PACKAGE_JSON" ]; then
    echo -e "${RED}Error: $PACKAGE_JSON not found${NC}"
    exit 1
fi

CURRENT_VERSION=$(node -p "require('./package.json').version")
echo -e "  Current version: ${CYAN}$CURRENT_VERSION${NC}"
echo -e "  Target version:  ${GREEN}$TARGET_VERSION${NC}"

if [ "$CURRENT_VERSION" = "$TARGET_VERSION" ]; then
    echo -e "${YELLOW}Warning: Version is already $TARGET_VERSION${NC}"
    echo "If you want to re-release, please update the version manually first."
    exit 0
fi

# -----------------------------------------------------------------------------
# Step 4: Build concise release notes
# -----------------------------------------------------------------------------
echo ""
echo -e "${YELLOW}Step 4: Building release notes...${NC}"

if [ ! -f "$CHANGELOG_FILE" ]; then
    echo -e "${RED}Error: $CHANGELOG_FILE not found${NC}"
    exit 1
fi

# Fetch tags so PREV_TAG resolution is accurate even on shallow clones
git fetch --tags --quiet 2>/dev/null || true

# Previous JS tag (anything matching v*, sorted by semver)
PREV_TAG=$(git tag -l 'v*' --sort=-v:refname | head -1)
if [ -n "$PREV_TAG" ]; then
    echo -e "  Previous JS tag:        ${CYAN}$PREV_TAG${NC}"
    JS_RANGE="$PREV_TAG..HEAD"
else
    echo -e "  Previous JS tag:        ${YELLOW}none (first release)${NC}"
    JS_RANGE="HEAD"
fi

# Previous gopher-orch version recorded in the previous release commit
PREV_GOPHER_ORCH_VERSION=""
if [ -n "$PREV_TAG" ]; then
    PREV_GOPHER_ORCH_VERSION=$(git log -1 --format=%B "$PREV_TAG" 2>/dev/null | \
        grep -oE 'gopher-orch version: [0-9]+\.[0-9]+\.[0-9]+' | \
        awk '{print $NF}' | head -1)
fi
if [ -n "$PREV_GOPHER_ORCH_VERSION" ]; then
    echo -e "  Previous gopher-orch:   ${CYAN}v$PREV_GOPHER_ORCH_VERSION${NC}"
else
    echo -e "  Previous gopher-orch:   ${YELLOW}unknown${NC}"
fi
echo -e "  New gopher-orch:        ${GREEN}v$GOPHER_ORCH_VERSION${NC}"

# Preserve any manually-authored entries already under [Unreleased]
MANUAL_CONTENT=$(awk '
    /^## \[Unreleased\]/ { capture = 1; next }
    /^## \[/ && capture { capture = 0 }
    capture { print }
' "$CHANGELOG_FILE" | sed -e '/^[[:space:]]*$/d')

# Collect JS commits since previous tag (skip merges + prior release commits)
JS_COMMITS=$(git log --no-merges --pretty=format:'- %s' \
    --invert-grep --grep='^Release version' --grep='^\[release\]' \
    $JS_RANGE 2>/dev/null || true)

JS_COMMIT_COUNT=0
if [ -n "$JS_COMMITS" ]; then
    JS_COMMIT_COUNT=$(printf '%s\n' "$JS_COMMITS" | wc -l | tr -d ' ')
fi
echo -e "  JS commits in range:    ${GREEN}$JS_COMMIT_COUNT${NC}"

# Keep generated SDK highlights readable by dropping release plumbing, docs-only
# commits, broad test maintenance, and submodule tracking noise.
JS_HIGHLIGHTS=""
if [ -n "$JS_COMMITS" ]; then
    JS_HIGHLIGHTS=$(printf '%s\n' "$JS_COMMITS" | \
        grep -Ev '^- (Track |Update gopher-orch|Verify examples|Rename |Document |Run .*CI|Add .*test|Add .*tests|Stabilize .*test|Stabilize .*tests|Fix .*lint|Update live example verification prompt)' | \
        head -8 || true)
fi

JS_HIGHLIGHT_COUNT=0
if [ -n "$JS_HIGHLIGHTS" ]; then
    JS_HIGHLIGHT_COUNT=$(printf '%s\n' "$JS_HIGHLIGHTS" | wc -l | tr -d ' ')
fi
JS_ADDED=""
JS_CHANGED=""
JS_FIXED=""
if [ -n "$JS_HIGHLIGHTS" ]; then
    JS_ADDED=$(printf '%s\n' "$JS_HIGHLIGHTS" | grep -E '^- (Add|Support|Enable|Implement|Define) ' || true)
    JS_FIXED=$(printf '%s\n' "$JS_HIGHLIGHTS" | grep -E '^- Fix ' || true)
    JS_CHANGED=$(printf '%s\n' "$JS_HIGHLIGHTS" | grep -Ev '^- (Add|Support|Enable|Implement|Define|Fix) ' || true)
fi
echo -e "  SDK highlights kept:    ${GREEN}$JS_HIGHLIGHT_COUNT${NC}"
echo -e "  gopher-orch notes:      ${CYAN}linked, not embedded${NC}"

# Build the new [Unreleased] body
RELEASE_NOTES_FILE=$(mktemp)
{
    if [ -n "$MANUAL_CONTENT" ]; then
        printf '%s\n\n' "$MANUAL_CONTENT"
    fi

    echo "### Changed"
    echo ""
    if [ "$TARGET_VERSION" != "$GOPHER_ORCH_VERSION" ]; then
        echo "- Release SDK patch v$TARGET_VERSION using \`gopher-orch\` native library [v$GOPHER_ORCH_VERSION](https://github.com/GopherSecurity/gopher-orch/releases/tag/v$GOPHER_ORCH_VERSION)."
    fi
    if [ -n "$PREV_GOPHER_ORCH_VERSION" ] && \
       [ "$PREV_GOPHER_ORCH_VERSION" != "$GOPHER_ORCH_VERSION" ]; then
        echo "- Bump \`gopher-orch\` native library from v$PREV_GOPHER_ORCH_VERSION to [v$GOPHER_ORCH_VERSION](https://github.com/GopherSecurity/gopher-orch/releases/tag/v$GOPHER_ORCH_VERSION)."
    elif [ "$TARGET_VERSION" = "$GOPHER_ORCH_VERSION" ]; then
        echo "- Pin \`gopher-orch\` native library to [v$GOPHER_ORCH_VERSION](https://github.com/GopherSecurity/gopher-orch/releases/tag/v$GOPHER_ORCH_VERSION)."
    fi
    echo "- See [gopher-orch v$GOPHER_ORCH_VERSION](https://github.com/GopherSecurity/gopher-orch/releases/tag/v$GOPHER_ORCH_VERSION) for native runtime changes."
    if [ -n "$JS_CHANGED" ]; then
        printf '%s\n' "$JS_CHANGED"
    fi
    echo ""

    if [ -n "$JS_ADDED" ]; then
        echo "### Added"
        echo ""
        printf '%s\n' "$JS_ADDED"
        echo ""
    fi

    if [ -n "$JS_FIXED" ]; then
        echo "### Fixed"
        echo ""
        printf '%s\n' "$JS_FIXED"
    fi
} > "$RELEASE_NOTES_FILE"

# Splice the generated body in: replace everything between
# "## [Unreleased]" and the next "## [" with the new content.
CHANGELOG_TMP="${CHANGELOG_FILE}.gen"
awk -v notes_file="$RELEASE_NOTES_FILE" '
    BEGIN {
        while ((getline line < notes_file) > 0) {
            notes = notes (notes ? "\n" : "") line
        }
        close(notes_file)
    }
    /^## \[Unreleased\]/ {
        print
        print ""
        print notes
        print ""
        skipping = 1
        next
    }
    /^## \[/ && skipping { skipping = 0 }
    skipping { next }
    { print }
' "$CHANGELOG_FILE" > "$CHANGELOG_TMP"
mv "$CHANGELOG_TMP" "$CHANGELOG_FILE"
rm -f "$RELEASE_NOTES_FILE"

# Recompute UNRELEASED_CONTENT for the eventual commit message
UNRELEASED_CONTENT=$(awk '
    /^## \[Unreleased\]/ { capture = 1; next }
    /^## \[/ && capture { capture = 0 }
    capture { print }
' "$CHANGELOG_FILE" | sed -e '/^[[:space:]]*$/d')

echo -e "  ${GREEN}[Unreleased] section populated${NC}"
echo "  Preview:"
printf '%s\n' "$UNRELEASED_CONTENT" | head -12 | sed 's/^/    /'

# -----------------------------------------------------------------------------
# Step 5: Update package.json files
# -----------------------------------------------------------------------------
echo ""
echo -e "${YELLOW}Step 5: Updating package.json files...${NC}"

# Update the SDK package to the requested release version while keeping native
# gopher-orch packages pinned to the X.Y.Z gopher-orch release.
node scripts/update-version.js "$TARGET_VERSION" "$GOPHER_ORCH_VERSION"

# Regenerate package-lock.json to sync with package.json
echo -e "  Regenerating package-lock.json..."
npm install --package-lock-only --ignore-optional > /dev/null 2>&1
echo -e "  ${GREEN}package-lock.json updated${NC}"

# -----------------------------------------------------------------------------
# Step 6: Update CHANGELOG.md
# -----------------------------------------------------------------------------
echo ""
echo -e "${YELLOW}Step 6: Updating CHANGELOG.md...${NC}"

TODAY=$(date +%Y-%m-%d)

# Create backup
cp "$CHANGELOG_FILE" "${CHANGELOG_FILE}.bak"

# Update CHANGELOG.md:
# 1. Replace [Unreleased] with [X.Y.Z] - YYYY-MM-DD
# 2. Add new [Unreleased] section after the header

# Create the new content
{
    # Header (first 7 lines typically)
    head -7 "$CHANGELOG_FILE"
    echo ""
    echo "## [Unreleased]"
    echo ""
    # Content from old [Unreleased] but with version header replaced
    tail -n +8 "$CHANGELOG_FILE" | sed "s/^## \[Unreleased\]/## [$TARGET_VERSION] - $TODAY/"
} > "${CHANGELOG_FILE}.new"

# Update the links section at the bottom
# Update [Unreleased] link to point to new version
sed -i.tmp "s|\[Unreleased\]: \(.*\)/compare/v[^.]*\.\.\.\(.*\)|[Unreleased]: \1/compare/v$TARGET_VERSION...\2|" "${CHANGELOG_FILE}.new"

# Check if version link exists, if not add it after [Unreleased] link
if ! grep -q "^\[$TARGET_VERSION\]:" "${CHANGELOG_FILE}.new"; then
    # Find the previous version from the old [Unreleased] link
    PREV_VERSION=$(grep "^\[Unreleased\]:" "$CHANGELOG_FILE" | sed -E 's/.*compare\/v([^.]+\.[^.]+\.[^.]+[^.]*)\.\.\.HEAD/\1/' | head -1)
    if [ -n "$PREV_VERSION" ]; then
        # Add version link after [Unreleased] link
        sed -i.tmp "/^\[Unreleased\]:/a\\
[$TARGET_VERSION]: https://github.com/GopherSecurity/gopher-mcp-js/compare/v${PREV_VERSION}...v$TARGET_VERSION" "${CHANGELOG_FILE}.new"
    fi
fi

mv "${CHANGELOG_FILE}.new" "$CHANGELOG_FILE"
rm -f "${CHANGELOG_FILE}.new.tmp" "${CHANGELOG_FILE}.bak"

echo -e "  ${GREEN}CHANGELOG.md updated${NC}"

# -----------------------------------------------------------------------------
# Step 7: Show changes and commit
# -----------------------------------------------------------------------------
echo ""
echo -e "${YELLOW}Step 7: Committing changes...${NC}"

# Show what changed
echo ""
echo -e "${CYAN}Changes to be committed:${NC}"
git diff --stat

echo ""
echo -e "${CYAN}Committing...${NC}"

git add "$PACKAGE_JSON" "package-lock.json" "$CHANGELOG_FILE" "$PACKAGES_DIR"
git commit -m "Release version $TARGET_VERSION

Prepare release v$TARGET_VERSION:
- Update package.json to version $TARGET_VERSION
- Update gopher-orch native package pins to version $GOPHER_ORCH_VERSION
- Update platform packages to version $GOPHER_ORCH_VERSION
- Update CHANGELOG.md: [Unreleased] -> [$TARGET_VERSION] - $TODAY

gopher-orch version: $GOPHER_ORCH_VERSION

Changes in this release:
$(echo "$UNRELEASED_CONTENT" | head -10)
"

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Release preparation complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "Version:           ${CYAN}$TARGET_VERSION${NC}"
echo -e "Tag:               ${CYAN}v$TARGET_VERSION${NC}"
echo -e "gopher-orch:       ${CYAN}$GOPHER_ORCH_VERSION${NC}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "  1. Review the commit: git show HEAD"
echo "  2. Push to release:   git push origin br_release"
echo ""
echo -e "${CYAN}The CI workflow will:${NC}"
echo "  - Download gopher-orch binaries for v$GOPHER_ORCH_VERSION"
echo "  - Build platform packages and publish only missing native versions"
echo "  - Build and publish main package to npm"
echo "  - Create GitHub Release with tag v$TARGET_VERSION"
