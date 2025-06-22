#!/bin/bash
# Fix GitHub Documentation Links Script
# This script fixes broken relative links in GitHub issues and documentation

set -e

# Repository base URL
REPO_URL="https://github.com/tim-gameplan/Roo-Code/blob/main"

echo "🔧 Fixing GitHub Documentation Links..."
echo "Repository: $REPO_URL"
echo ""

# Function to fix links in a file
fix_links() {
    local file="$1"
    echo "📝 Processing: $file"
    
    # Create backup
    cp "$file" "$file.backup"
    
    # Replace relative documentation links with full GitHub URLs
    # Pattern: [text](docs/path/file.md) -> [text](https://github.com/repo/blob/main/docs/path/file.md)
    sed -i.tmp -E "s|\[([^\]]+)\]\(docs/([^)]+)\)|\[\1\]($REPO_URL/docs/\2)|g" "$file"
    
    # Pattern: [text](./docs/path/file.md) -> [text](https://github.com/repo/blob/main/docs/path/file.md)
    sed -i.tmp -E "s|\[([^\]]+)\]\(\./docs/([^)]+)\)|\[\1\]($REPO_URL/docs/\2)|g" "$file"
    
    # Remove temporary file
    rm "$file.tmp" 2>/dev/null || true
    
    echo "   ✅ Fixed links in $file"
}

# Function to validate if file has changes
validate_changes() {
    local file="$1"
    if ! diff -q "$file" "$file.backup" > /dev/null 2>&1; then
        echo "   📊 Changes detected in $file"
        return 0
    else
        echo "   ℹ️  No changes needed in $file"
        rm "$file.backup" 2>/dev/null || true
        return 1
    fi
}

# Counter for files processed
files_changed=0
files_processed=0

echo "🎯 Phase 1: Fixing Issue Templates"
echo "=================================="

# Fix links in issue templates
if [ -d ".github/ISSUE_TEMPLATE" ]; then
    for template in .github/ISSUE_TEMPLATE/*.md; do
        if [ -f "$template" ]; then
            fix_links "$template"
            if validate_changes "$template"; then
                ((files_changed++))
            fi
            ((files_processed++))
        fi
    done
else
    echo "   ⚠️  No issue templates found"
fi

echo ""
echo "🎯 Phase 2: Fixing Documentation Files"
echo "======================================"

# Fix links in documentation files
if [ -d "docs" ]; then
    find docs -name "*.md" -type f | while read -r doc; do
        fix_links "$doc"
        if validate_changes "$doc"; then
            ((files_changed++))
        fi
        ((files_processed++))
    done
else
    echo "   ⚠️  No docs directory found"
fi

echo ""
echo "🎯 Phase 3: Fixing README Files"
echo "==============================="

# Fix main README
if [ -f "README.md" ]; then
    fix_links "README.md"
    if validate_changes "README.md"; then
        ((files_changed++))
    fi
    ((files_processed++))
fi

# Fix other README files
find . -name "README.md" -not -path "./README.md" -type f | while read -r readme; do
    fix_links "$readme"
    if validate_changes "$readme"; then
        ((files_changed++))
    fi
    ((files_processed++))
done

echo ""
echo "🎯 Phase 4: Creating Link Validation"
echo "===================================="

# Create link validation GitHub Action
mkdir -p .github/workflows

cat > .github/workflows/validate-links.yml << 'EOF'
name: Validate Documentation Links

on:
  pull_request:
    paths:
      - 'docs/**'
      - '.github/ISSUE_TEMPLATE/**'
      - 'README.md'
      - '**/README.md'
  push:
    branches: [ main ]
    paths:
      - 'docs/**'
      - '.github/ISSUE_TEMPLATE/**'

jobs:
  validate-links:
    runs-on: ubuntu-latest
    name: Check documentation links
    
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        
      - name: Validate Markdown links
        uses: gaurav-nelson/github-action-markdown-link-check@v1
        with:
          use-quiet-mode: 'yes'
          use-verbose-mode: 'yes'
          config-file: '.github/workflows/link-check-config.json'
          
      - name: Check for broken GitHub links
        run: |
          echo "🔍 Checking for relative documentation links..."
          
          # Check for potentially broken relative links
          broken_links=$(grep -r "\](docs/" docs/ .github/ README.md 2>/dev/null || true)
          
          if [ -n "$broken_links" ]; then
            echo "❌ Found potentially broken relative links:"
            echo "$broken_links"
            echo ""
            echo "💡 Use full GitHub URLs instead:"
            echo "   ❌ [text](docs/file.md)"
            echo "   ✅ [text](https://github.com/tim-gameplan/Roo-Code/blob/main/docs/file.md)"
            exit 1
          else
            echo "✅ No broken relative links found"
          fi
EOF

# Create link check configuration
cat > .github/workflows/link-check-config.json << 'EOF'
{
  "ignorePatterns": [
    {
      "pattern": "^http://localhost"
    },
    {
      "pattern": "^https://localhost"
    }
  ],
  "replacementPatterns": [
    {
      "pattern": "^/",
      "replacement": "https://github.com/tim-gameplan/Roo-Code/blob/main/"
    }
  ],
  "httpStatusCodes": {
    "400": "warn",
    "401": "warn",
    "403": "warn",
    "404": "error",
    "405": "warn",
    "500": "warn",
    "502": "warn",
    "503": "warn"
  }
}
EOF

echo "   ✅ Created link validation workflow"
echo "   ✅ Created link check configuration"

echo ""
echo "🎉 Link Fix Summary"
echo "=================="
echo "📊 Files processed: $files_processed"
echo "🔧 Files changed: $files_changed"
echo "✅ Link validation workflow created"
echo ""
echo "🚀 Next Steps:"
echo "1. Review the changes in your files"
echo "2. Commit the fixes to your repository"
echo "3. The new workflow will validate links on future PRs"
echo ""
echo "📝 Manual GitHub Issue Updates Required:"
echo "   Issues #17, #16, #15, #14, #13 need manual link updates"
echo "   Use this format:"
echo "   https://github.com/tim-gameplan/Roo-Code/blob/main/docs/tasks/TASK_XXX_NAME.md"
echo ""
echo "🎯 Link fixes complete!"
