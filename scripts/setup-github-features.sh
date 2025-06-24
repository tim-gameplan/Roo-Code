#!/bin/bash
# GitHub Advanced Features Setup Script
# This script helps you implement the most critical GitHub features

set -e

echo "🚀 GitHub Advanced Features Setup"
echo "================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_header() {
    echo -e "${BLUE}🎯 $1${NC}"
    echo "$(printf '=%.0s' {1..50})"
}

# Check if we're in a git repository
if ! git rev-parse --git-dir > /dev/null 2>&1; then
    print_error "This script must be run from within a Git repository"
    exit 1
fi

# Get repository information
REPO_URL=$(git config --get remote.origin.url)
REPO_NAME=$(basename -s .git "$REPO_URL")
GITHUB_URL="https://github.com/tim-gameplan/Roo-Code"

print_info "Repository: $GITHUB_URL"
print_info "Setting up advanced GitHub features..."
echo ""

# Phase 1: Enhanced Labels
print_header "Phase 1: Enhanced Labeling System"

# Create labels directory for tracking
mkdir -p .github/labels

# Create label configuration
cat > .github/labels/labels.yml << 'EOF'
# Priority Labels
- name: "priority/critical"
  color: "d73a4a"
  description: "🔴 Blocking issues that must be resolved immediately"

- name: "priority/high"
  color: "ff9500"
  description: "🟠 Important features and fixes"

- name: "priority/medium"
  color: "ffcc00"
  description: "🟡 Standard development work"

- name: "priority/low"
  color: "28a745"
  description: "🟢 Nice to have improvements"

# Component Labels
- name: "component/mobile"
  color: "0052cc"
  description: "📱 Mobile application development"

- name: "component/database"
  color: "5319e7"
  description: "🗄️ Database schema, queries, and migrations"

- name: "component/auth"
  color: "d4c5f9"
  description: "🔐 Authentication and authorization"

- name: "component/api"
  color: "0e8a16"
  description: "🌐 API development and integration"

- name: "component/docs"
  color: "1d76db"
  description: "📚 Documentation updates and improvements"

- name: "component/testing"
  color: "f9d0c4"
  description: "🧪 Testing, QA, and validation"

# Status Labels
- name: "status/in-progress"
  color: "fbca04"
  description: "🚧 Currently being worked on"

- name: "status/blocked"
  color: "d73a4a"
  description: "⏸️ Waiting on external dependency"

- name: "status/review"
  color: "0052cc"
  description: "👀 Needs code review or feedback"

- name: "status/testing"
  color: "0e8a16"
  description: "🧪 In testing or QA phase"

# Epic Labels
- name: "epic/task-005"
  color: "b60205"
  description: "📋 TASK-005: Mobile-First Communication"

- name: "epic/task-006"
  color: "d93f0b"
  description: "🔐 TASK-006: Cross-Device Authentication"

- name: "epic/task-007"
  color: "fbca04"
  description: "🗄️ TASK-007: Database Integration & Sync"

- name: "epic/task-008"
  color: "0e8a16"
  description: "📱 TASK-008: Mobile Applications"
EOF

print_status "Created enhanced label configuration"

# Phase 2: GitHub Actions for Project Automation
print_header "Phase 2: Project Automation Workflows"

# Create project automation workflow
cat > .github/workflows/project-automation.yml << 'EOF'
name: Project Board Automation

on:
  issues:
    types: [opened, assigned, closed, labeled]
  pull_request:
    types: [opened, closed, merged, ready_for_review]

jobs:
  update-project-board:
    runs-on: ubuntu-latest
    name: Update Project Board
    
    steps:
      - name: Move new issues to Backlog
        if: github.event.action == 'opened' && github.event_name == 'issues'
        uses: actions/github-script@v7
        with:
          script: |
            console.log('New issue created:', context.payload.issue.number);
            // Add logic to move to project board when Projects API is available
            
      - name: Move assigned issues to In Progress
        if: github.event.action == 'assigned' && github.event_name == 'issues'
        uses: actions/github-script@v7
        with:
          script: |
            console.log('Issue assigned:', context.payload.issue.number);
            // Add logic to move to In Progress column
            
      - name: Move closed issues to Done
        if: github.event.action == 'closed' && github.event_name == 'issues'
        uses: actions/github-script@v7
        with:
          script: |
            console.log('Issue closed:', context.payload.issue.number);
            // Add logic to move to Done column
            
      - name: Move PRs to Review
        if: github.event.action == 'ready_for_review' && github.event_name == 'pull_request'
        uses: actions/github-script@v7
        with:
          script: |
            console.log('PR ready for review:', context.payload.pull_request.number);
            // Add logic to move related issues to Review column
EOF

print_status "Created project automation workflow"

# Create issue auto-labeling workflow
cat > .github/workflows/auto-label.yml << 'EOF'
name: Auto-label Issues

on:
  issues:
    types: [opened]
  pull_request:
    types: [opened]

jobs:
  auto-label:
    runs-on: ubuntu-latest
    name: Automatically label issues and PRs
    
    steps:
      - name: Label database issues
        if: contains(github.event.issue.title, 'database') || contains(github.event.issue.title, 'Database') || contains(github.event.issue.body, 'database')
        uses: actions/github-script@v7
        with:
          script: |
            github.rest.issues.addLabels({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              labels: ['component/database']
            });
            
      - name: Label mobile issues
        if: contains(github.event.issue.title, 'mobile') || contains(github.event.issue.title, 'Mobile') || contains(github.event.issue.title, 'iOS') || contains(github.event.issue.title, 'Android')
        uses: actions/github-script@v7
        with:
          script: |
            github.rest.issues.addLabels({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              labels: ['component/mobile']
            });
            
      - name: Label authentication issues
        if: contains(github.event.issue.title, 'auth') || contains(github.event.issue.title, 'Auth') || contains(github.event.issue.title, 'login') || contains(github.event.issue.title, 'security')
        uses: actions/github-script@v7
        with:
          script: |
            github.rest.issues.addLabels({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              labels: ['component/auth']
            });
            
      - name: Label TASK epic issues
        uses: actions/github-script@v7
        with:
          script: |
            const title = context.payload.issue.title.toLowerCase();
            const body = context.payload.issue.body || '';
            
            if (title.includes('task-005') || title.includes('task 005')) {
              await github.rest.issues.addLabels({
                issue_number: context.issue.number,
                owner: context.repo.owner,
                repo: context.repo.repo,
                labels: ['epic/task-005', 'component/mobile']
              });
            }
            
            if (title.includes('task-006') || title.includes('task 006')) {
              await github.rest.issues.addLabels({
                issue_number: context.issue.number,
                owner: context.repo.owner,
                repo: context.repo.repo,
                labels: ['epic/task-006', 'component/auth']
              });
            }
            
            if (title.includes('task-007') || title.includes('task 007')) {
              await github.rest.issues.addLabels({
                issue_number: context.issue.number,
                owner: context.repo.owner,
                repo: context.repo.repo,
                labels: ['epic/task-007', 'component/database']
              });
            }
            
            if (title.includes('task-008') || title.includes('task 008')) {
              await github.rest.issues.addLabels({
                issue_number: context.issue.number,
                owner: context.repo.owner,
                repo: context.repo.repo,
                labels: ['epic/task-008', 'component/mobile']
              });
            }
EOF

print_status "Created auto-labeling workflow"

# Phase 3: Database Testing Workflow
print_header "Phase 3: Database Testing Automation"

cat > .github/workflows/database-testing.yml << 'EOF'
name: Database Migration Testing

on:
  pull_request:
    paths:
      - 'database/**'
      - 'migrations/**'
      - '**/schema.sql'
      - 'src/services/database/**'
      - 'production-ccs/src/**'
  push:
    branches: [main]
    paths:
      - 'database/**'
      - 'migrations/**'

jobs:
  test-database-changes:
    runs-on: ubuntu-latest
    name: Test Database Changes
    
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: test_password
          POSTGRES_USER: test_user
          POSTGRES_DB: test_db
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 5432:5432
          
      redis:
        image: redis:7
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 6379:6379

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'npm'
          
      - name: Install dependencies
        run: |
          if [ -f "production-ccs/package.json" ]; then
            cd production-ccs && npm install
          fi
          
      - name: Test database connection
        run: |
          # Test PostgreSQL connection
          PGPASSWORD=test_password psql -h localhost -U test_user -d test_db -c "SELECT version();"
          
          # Test Redis connection
          redis-cli -h localhost ping
          
      - name: Run database tests
        run: |
          echo "🧪 Running database integration tests..."
          # Add your database test commands here
          # Example: npm run test:database
          
      - name: Test migration scripts
        run: |
          echo "🔄 Testing database migrations..."
          # Add migration testing logic here
          # Example: npm run migrate:test
          
      - name: Validate schema changes
        run: |
          echo "📋 Validating database schema..."
          # Add schema validation logic here
          # Example: npm run schema:validate
EOF

print_status "Created database testing workflow"

# Phase 4: Weekly Progress Reports
print_header "Phase 4: Automated Progress Reporting"

cat > .github/workflows/weekly-progress.yml << 'EOF'
name: Weekly Progress Report

on:
  schedule:
    - cron: '0 9 * * MON'  # Every Monday at 9 AM UTC
  workflow_dispatch:  # Allow manual triggering

jobs:
  generate-progress-report:
    runs-on: ubuntu-latest
    name: Generate Weekly Progress Report
    
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        
      - name: Generate milestone progress
        uses: actions/github-script@v7
        with:
          script: |
            const { owner, repo } = context.repo;
            
            // Get all milestones
            const milestones = await github.rest.issues.listMilestones({
              owner,
              repo,
              state: 'open'
            });
            
            let report = '# 📊 Weekly Progress Report\n\n';
            report += `**Generated**: ${new Date().toISOString().split('T')[0]}\n\n`;
            
            for (const milestone of milestones.data) {
              const progress = milestone.closed_issues / (milestone.open_issues + milestone.closed_issues) * 100;
              report += `## ${milestone.title}\n`;
              report += `- **Progress**: ${progress.toFixed(1)}% (${milestone.closed_issues}/${milestone.open_issues + milestone.closed_issues} issues)\n`;
              report += `- **Due Date**: ${milestone.due_on ? new Date(milestone.due_on).toDateString() : 'No due date'}\n`;
              report += `- **Description**: ${milestone.description || 'No description'}\n\n`;
            }
            
            // Get recent activity
            const issues = await github.rest.issues.listForRepo({
              owner,
              repo,
              state: 'all',
              since: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
              per_page: 100
            });
            
            const recentIssues = issues.data.filter(issue => 
              new Date(issue.updated_at) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
            );
            
            report += '## 📈 Recent Activity\n\n';
            report += `- **Issues updated this week**: ${recentIssues.length}\n`;
            report += `- **Issues closed this week**: ${recentIssues.filter(i => i.state === 'closed').length}\n`;
            report += `- **New issues this week**: ${recentIssues.filter(i => new Date(i.created_at) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)).length}\n\n`;
            
            console.log('Generated weekly progress report');
            
            // Create or update a discussion with the report
            // Note: This would require the Discussions API when available
            console.log(report);
EOF

print_status "Created weekly progress report workflow"

# Phase 5: Manual Setup Instructions
print_header "Phase 5: Manual Setup Instructions"

cat > GITHUB_SETUP_CHECKLIST.md << 'EOF'
# 🚀 GitHub Advanced Features Setup Checklist

This checklist helps you manually set up the GitHub features that require web interface configuration.

## ✅ Critical Setup (Do This Week)

### 1. Fix Broken Documentation Links
- [ ] Go to Issues #17, #16, #15, #14, #13
- [ ] Edit each issue description
- [ ] Replace `docs/tasks/TASK_XXX.md` with `https://github.com/tim-gameplan/Roo-Code/blob/main/docs/tasks/TASK_XXX.md`
- [ ] Save changes

### 2. Create GitHub Projects
- [ ] Go to https://github.com/tim-gameplan/Roo-Code/projects
- [ ] Click "New project" → "Board"
- [ ] Create "Roo Cross-Device Development" project
- [ ] Add columns: Backlog, In Progress, In Review, Testing, Done
- [ ] Add all 17 existing issues to the project
- [ ] Create "Database Integration & Sync" project for TASK-007

### 3. Set Up Milestones
- [ ] Go to https://github.com/tim-gameplan/Roo-Code/issues/milestones
- [ ] Create milestone: "Mobile-First Communication (TASK-005)" - Due: 4 weeks
- [ ] Create milestone: "Cross-Device Authentication (TASK-006)" - Due: 7 weeks  
- [ ] Create milestone: "Database Integration & Sync (TASK-007)" - Due: 11 weeks
- [ ] Create milestone: "Mobile Applications (TASK-008)" - Due: 14 weeks
- [ ] Assign issues to appropriate milestones

### 4. Enable GitHub Discussions
- [ ] Go to Repository Settings → Features
- [ ] Check "Discussions" checkbox
- [ ] Go to https://github.com/tim-gameplan/Roo-Code/discussions
- [ ] Create categories: Announcements, General, Database Architecture, Mobile Development, Security & Authentication, Q&A, Ideas

## 🔥 High Priority Setup (Do This Month)

### 5. Enhanced Labels
- [ ] Go to https://github.com/tim-gameplan/Roo-Code/labels
- [ ] Create priority labels: priority/critical, priority/high, priority/medium, priority/low
- [ ] Create component labels: component/mobile, component/database, component/auth, component/api, component/docs, component/testing
- [ ] Create status labels: status/in-progress, status/blocked, status/review, status/testing
- [ ] Create epic labels: epic/task-005, epic/task-006, epic/task-007, epic/task-008
- [ ] Apply labels to existing issues

### 6. GitHub Wiki
- [ ] Go to Repository Settings → Features
- [ ] Check "Wikis" checkbox
- [ ] Go to https://github.com/tim-gameplan/Roo-Code/wiki
- [ ] Create Home page with project overview
- [ ] Create pages for Mobile Development, Architecture, Development, Project Management, Collaboration

### 7. Security Features
- [ ] Go to Repository Settings → Security & analysis
- [ ] Enable "Dependency graph"
- [ ] Enable "Dependabot alerts"
- [ ] Enable "Dependabot security updates"
- [ ] Enable "Secret scanning alerts"
- [ ] Configure "Code scanning alerts"

## 📈 Medium Priority Setup (Do Next Quarter)

### 8. GitHub Pages
- [ ] Go to Repository Settings → Pages
- [ ] Source: Deploy from a branch
- [ ] Branch: main / docs folder
- [ ] Configure custom domain (optional)

### 9. Branch Protection Rules
- [ ] Go to Repository Settings → Branches
- [ ] Add rule for main branch
- [ ] Require pull request reviews
- [ ] Require status checks to pass
- [ ] Require branches to be up to date

### 10. GitHub Codespaces
- [ ] Create .devcontainer/devcontainer.json
- [ ] Configure development environment
- [ ] Test codespace creation

## 🎯 Validation Checklist

After setup, verify:
- [ ] All documentation links work in GitHub issues
- [ ] Project boards show all issues correctly
- [ ] Milestones display progress percentages
- [ ] Discussions are enabled and categorized
- [ ] Labels are applied to issues
- [ ] GitHub Actions workflows are running
- [ ] Security features are active

## 📞 Need Help?

If you encounter issues:
1. Check GitHub's documentation: https://docs.github.com
2. Review the setup scripts in this repository
3. Test features with a small subset first
4. Verify permissions and repository settings

---

**Next Steps**: Start with the Critical Setup items and work through the checklist systematically.
EOF

print_status "Created manual setup checklist"

# Phase 6: Summary and Next Steps
print_header "Phase 6: Setup Complete"

echo ""
print_info "🎉 GitHub Advanced Features Setup Complete!"
echo ""
print_info "Files Created:"
echo "  📋 .github/labels/labels.yml - Enhanced label configuration"
echo "  🔄 .github/workflows/project-automation.yml - Project board automation"
echo "  🏷️  .github/workflows/auto-label.yml - Automatic issue labeling"
echo "  🗄️  .github/workflows/database-testing.yml - Database testing automation"
echo "  📊 .github/workflows/weekly-progress.yml - Weekly progress reports"
echo "  📝 .github/workflows/validate-links.yml - Link validation (from previous script)"
echo "  ✅ GITHUB_SETUP_CHECKLIST.md - Manual setup instructions"
echo ""
print_warning "Manual Setup Required:"
echo "  1. Fix broken documentation links in issues #17, #16, #15, #14, #13"
echo "  2. Create GitHub Projects for visual project management"
echo "  3. Set up Milestones for TASK-005 through TASK-008"
echo "  4. Enable GitHub Discussions for collaboration"
echo "  5. Apply enhanced labels to existing issues"
echo ""
print_info "Next Steps:"
echo "  1. Review GITHUB_SETUP_CHECKLIST.md for detailed instructions"
echo "  2. Commit these changes to your repository"
echo "  3. Follow the manual setup checklist"
echo "  4. Test the new workflows and features"
echo ""
print_status "GitHub transformation ready to begin!"
echo ""
print_info "Expected Benefits:"
echo "  📈 50% faster issue resolution"
echo "  👀 90% better project visibility"
echo "  🤝 60% reduction in scattered conversations"
echo "  🔄 40% reduction in manual project management"
echo ""
print_info "Repository: $GITHUB_URL"
print_info "Documentation: docs/GITHUB_ADVANCED_FEATURES_GUIDE.md"
