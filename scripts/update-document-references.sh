#!/bin/bash

# Update Document References Script
# This script updates all document references in the task files to use proper GitHub URLs

set -e

# Configuration
BASE_URL="https://github.com/tim-gameplan/Roo-Code/blob/main"
DOCS_DIR="docs"
TASKS_DIR="docs/tasks"

echo "🔗 Updating document references with GitHub URLs..."

# Function to update references in a file
update_file_references() {
    local file="$1"
    echo "  📝 Updating: $file"
    
    # Create backup
    cp "$file" "$file.backup"
    
    # Update architecture document references
    sed -i.tmp "s|docs/cloud-architecture\.md|${BASE_URL}/docs/architecture/cloud-architecture.md|g" "$file"
    sed -i.tmp "s|docs/system-architecture\.md|${BASE_URL}/docs/architecture/system-architecture.md|g" "$file"
    sed -i.tmp "s|docs/CONVERSATION_HISTORY_COMPARISON\.md|${BASE_URL}/docs/architecture/conversation-history-comparison.md|g" "$file"
    
    # Update task document references
    sed -i.tmp "s|docs/tasks/TASK_005_MOBILE_FIRST_EXTENSION_COMMUNICATION\.md|${BASE_URL}/docs/tasks/TASK_005_MOBILE_FIRST_EXTENSION_COMMUNICATION.md|g" "$file"
    sed -i.tmp "s|docs/tasks/TASK_006_CROSS_DEVICE_AUTHENTICATION\.md|${BASE_URL}/docs/tasks/TASK_006_CROSS_DEVICE_AUTHENTICATION.md|g" "$file"
    sed -i.tmp "s|docs/tasks/TASK_007_DATABASE_INTEGRATION_SYNC\.md|${BASE_URL}/docs/tasks/TASK_007_DATABASE_INTEGRATION_SYNC.md|g" "$file"
    sed -i.tmp "s|docs/tasks/TASK_008_MOBILE_APPLICATION_DEVELOPMENT\.md|${BASE_URL}/docs/tasks/TASK_008_MOBILE_APPLICATION_DEVELOPMENT.md|g" "$file"
    
    # Update relative references to absolute GitHub URLs
    sed -i.tmp "s|\.\./cloud-architecture\.md|${BASE_URL}/docs/architecture/cloud-architecture.md|g" "$file"
    sed -i.tmp "s|\.\./system-architecture\.md|${BASE_URL}/docs/architecture/system-architecture.md|g" "$file"
    
    # Update GitHub issue references (simplified approach)
    sed -i.tmp 's|GitHub Issue: TBD|GitHub Issue: [Create Issue](https://github.com/tim-gameplan/Roo-Code/issues/new)|g' "$file"
    
    # Clean up temporary files
    rm -f "$file.tmp"
}

# Update all task files
if [ -d "$TASKS_DIR" ]; then
    echo "📋 Updating task documents..."
    for task_file in "$TASKS_DIR"/TASK_*.md; do
        if [ -f "$task_file" ]; then
            update_file_references "$task_file"
        fi
    done
fi

# Update architecture documents
echo "🏗️ Updating architecture documents..."
for arch_file in "$DOCS_DIR"/*.md; do
    if [ -f "$arch_file" ] && [[ "$arch_file" != *"/README.md" ]]; then
        update_file_references "$arch_file"
    fi
done

# Update summary documents
echo "📊 Updating summary documents..."
for summary_file in "$DOCS_DIR"/*SUMMARY*.md "$DOCS_DIR"/*INDEX*.md; do
    if [ -f "$summary_file" ]; then
        update_file_references "$summary_file"
    fi
done

echo "✅ Document references updated successfully!"
echo ""
echo "📋 Summary of changes:"
echo "  - Architecture documents now reference: ${BASE_URL}/docs/architecture/"
echo "  - Task documents now reference: ${BASE_URL}/docs/tasks/"
echo "  - GitHub issues linked for each task"
echo ""
echo "🔄 Next steps:"
echo "  1. Review the updated files"
echo "  2. Organize documents in the existing repository structure"
echo "  3. Create GitHub issues for TASK-005 through TASK-008"
echo "  4. Set up GitHub Projects board for task tracking"
echo ""
echo "💾 Backup files created with .backup extension"
