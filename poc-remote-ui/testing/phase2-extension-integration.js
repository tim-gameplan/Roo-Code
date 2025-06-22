#!/usr/bin/env node

/**
 * TASK-002: Phase 2 - Roo Extension Integration Testing
 * 
 * This script tests the integration between the PoC and the Roo extension:
 * - IPC handler implementation in extension
 * - End-to-end message flow testing
 * - Webview integration validation
 * - Extension error handling
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

class Phase2Tester {
    constructor() {
        this.results = {
            timestamp: new Date().toISOString(),
            phase: 'Phase 2 - Roo Extension Integration Testing',
            tests: [],
            summary: {
                total: 0,
                passed: 0,
                failed: 0,
                warnings: 0
            }
        };
        this.serverProcess = null;
        this.baseUrl = 'http://localhost:3000';
        this.extensionReady = false;
    }

    log(message, type = 'info') {
        const timestamp = new Date().toISOString();
        const prefix = type === 'error' ? '❌' : type === 'warning' ? '⚠️' : type === 'success' ? '✅' : 'ℹ️';
        console.log(`${prefix} [${timestamp}] ${message}`);
    }

    async addTestResult(testName, passed, message, details = {}) {
        const result = {
            testName,
            passed,
            message,
            details,
            timestamp: new Date().toISOString()
        };
        
        this.results.tests.push(result);
        this.results.summary.total++;
        
        if (passed) {
            this.results.summary.passed++;
            this.log(`${testName}: ${message}`, 'success');
        } else {
            this.results.summary.failed++;
            this.log(`${testName}: ${message}`, 'error');
        }
    }

    async addWarning(testName, message, details = {}) {
        const result = {
            testName,
            passed: true,
            message,
            details,
            warning: true,
            timestamp: new Date().toISOString()
        };
        
        this.results.tests.push(result);
        this.results.summary.warnings++;
        this.log(`${testName}: ${message}`, 'warning');
    }

    async sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async makeRequest(path, options = {}) {
        return new Promise((resolve, reject) => {
            const url = `${this.baseUrl}${path}`;
            const startTime = Date.now();
            
            const req = http.get(url, options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    const responseTime = Date.now() - startTime;
                    resolve({
                        statusCode: res.statusCode,
                        headers: res.headers,
                        data,
                        responseTime
                    });
                });
            });
            
            req.on('error', reject);
            req.setTimeout(10000, () => {
                req.destroy();
                reject(new Error('Request timeout'));
            });
        });
    }

    async startServer() {
        this.log('Starting CCS server for Phase 2 testing...');
        
        return new Promise((resolve, reject) => {
            const serverPath = path.join(__dirname, '../ccs/server.js');
            this.serverProcess = spawn('node', [serverPath], {
                cwd: path.join(__dirname, '../ccs'),
                stdio: ['pipe', 'pipe', 'pipe']
            });

            let serverOutput = '';
            this.serverProcess.stdout.on('data', (data) => {
                serverOutput += data.toString();
            });

            this.serverProcess.stderr.on('data', (data) => {
                const errorOutput = data.toString();
                // Don't log expected IPC connection errors during startup
                if (!errorOutput.includes('connect ENOENT /tmp/app.roo-extension')) {
                    console.error('Server error:', errorOutput);
                }
            });

            // Wait for server to start
            setTimeout(async () => {
                try {
                    await this.makeRequest('/health');
                    this.log('CCS server started successfully for Phase 2');
                    resolve();
                } catch (error) {
                    reject(new Error(`Server failed to start: ${error.message}`));
                }
            }, 3000);
        });
    }

    async stopServer() {
        if (this.serverProcess) {
            this.log('Stopping CCS server...');
            this.serverProcess.kill();
            this.serverProcess = null;
        }
    }

    async testExtensionDetection() {
        this.log('Testing Roo extension detection...');
        
        try {
            // Check if VS Code is running with Roo extension
            const vsCodeProcesses = await this.checkVSCodeProcesses();
            
            if (vsCodeProcesses.length === 0) {
                await this.addWarning(
                    'Extension Detection',
                    'VS Code not detected running - manual verification required',
                    { 
                        recommendation: 'Start VS Code with Roo extension for full integration testing',
                        processes: vsCodeProcesses
                    }
                );
                return false;
            }

            await this.addTestResult(
                'Extension Detection',
                true,
                `VS Code detected running (${vsCodeProcesses.length} processes)`,
                { processes: vsCodeProcesses }
            );
            
            return true;
        } catch (error) {
            await this.addTestResult(
                'Extension Detection',
                false,
                `Extension detection failed: ${error.message}`,
                { error: error.message }
            );
            return false;
        }
    }

    async checkVSCodeProcesses() {
        return new Promise((resolve, reject) => {
            const { exec } = require('child_process');
            exec('ps aux | grep -i "visual studio code\\|code\\|vscode" | grep -v grep', (error, stdout, stderr) => {
                if (error) {
                    // No processes found is not an error for our purposes
                    resolve([]);
                    return;
                }
                
                const processes = stdout.trim().split('\n').filter(line => line.length > 0);
                resolve(processes);
            });
        });
    }

    async testIPCConnectionAttempt() {
        this.log('Testing IPC connection attempt...');
        
        try {
            const response = await this.makeRequest('/health');
            const healthData = JSON.parse(response.data);
            
            if (healthData.ipc) {
                const ipcConnected = healthData.ipc.connected;
                const queuedMessages = healthData.ipc.queuedMessages;
                
                if (ipcConnected) {
                    await this.addTestResult(
                        'IPC Connection',
                        true,
                        'IPC connection established successfully',
                        {
                            connected: ipcConnected,
                            queuedMessages,
                            socketPath: healthData.ipc.socketPath
                        }
                    );
                    this.extensionReady = true;
                } else {
                    await this.addWarning(
                        'IPC Connection',
                        'IPC not connected - extension may not be running with IPC handler',
                        {
                            connected: ipcConnected,
                            queuedMessages,
                            socketPath: healthData.ipc.socketPath,
                            recommendation: 'Ensure Roo extension has setupRemoteUIListener() implemented'
                        }
                    );
                }
            } else {
                await this.addTestResult(
                    'IPC Connection',
                    false,
                    'IPC status not available in health endpoint',
                    { healthData }
                );
            }
        } catch (error) {
            await this.addTestResult(
                'IPC Connection',
                false,
                `IPC connection test failed: ${error.message}`,
                { error: error.message }
            );
        }
    }

    async testMessageQueueing() {
        this.log('Testing message queuing when extension not connected...');
        
        try {
            const testMessage = 'Phase 2 test message for queuing validation';
            const postData = JSON.stringify({ message: testMessage });
            
            const response = await new Promise((resolve, reject) => {
                const options = {
                    hostname: 'localhost',
                    port: 3000,
                    path: '/send-message',
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Content-Length': Buffer.byteLength(postData)
                    }
                };

                const startTime = Date.now();
                const req = http.request(options, (res) => {
                    let data = '';
                    res.on('data', chunk => data += chunk);
                    res.on('end', () => {
                        const responseTime = Date.now() - startTime;
                        resolve({
                            statusCode: res.statusCode,
                            headers: res.headers,
                            data,
                            responseTime
                        });
                    });
                });

                req.on('error', reject);
                req.setTimeout(5000, () => {
                    req.destroy();
                    reject(new Error('Request timeout'));
                });

                req.write(postData);
                req.end();
            });

            if (response.statusCode === 200) {
                const responseData = JSON.parse(response.data);
                
                if (responseData.queued) {
                    await this.addTestResult(
                        'Message Queuing',
                        true,
                        'Messages are properly queued when extension not connected',
                        {
                            statusCode: response.statusCode,
                            responseTime: response.responseTime,
                            testMessage,
                            responseData
                        }
                    );
                } else if (responseData.success) {
                    await this.addTestResult(
                        'Message Queuing',
                        true,
                        'Message sent successfully - extension is connected',
                        {
                            statusCode: response.statusCode,
                            responseTime: response.responseTime,
                            testMessage,
                            responseData
                        }
                    );
                    this.extensionReady = true;
                } else {
                    await this.addTestResult(
                        'Message Queuing',
                        false,
                        'Unexpected response from send-message endpoint',
                        { responseData }
                    );
                }
            } else {
                await this.addTestResult(
                    'Message Queuing',
                    false,
                    `Send message endpoint returned status ${response.statusCode}`,
                    { statusCode: response.statusCode, data: response.data }
                );
            }
        } catch (error) {
            await this.addTestResult(
                'Message Queuing',
                false,
                `Message queuing test failed: ${error.message}`,
                { error: error.message }
            );
        }
    }

    async testExtensionIntegrationReadiness() {
        this.log('Testing extension integration readiness...');
        
        try {
            // Check if the extension source files exist and can be modified
            const extensionPaths = [
                'src/core/cline/ClineProvider.ts',
                'src/extension.ts',
                'src/core/cline/',
                'src/'
            ];
            
            let foundPaths = [];
            let missingPaths = [];
            
            for (const relativePath of extensionPaths) {
                const fullPath = path.join(process.cwd(), relativePath);
                try {
                    const stats = await fs.promises.stat(fullPath);
                    foundPaths.push({
                        path: relativePath,
                        exists: true,
                        isDirectory: stats.isDirectory(),
                        size: stats.isDirectory() ? null : stats.size
                    });
                } catch (error) {
                    missingPaths.push({
                        path: relativePath,
                        exists: false,
                        error: error.code
                    });
                }
            }
            
            if (foundPaths.length > 0) {
                await this.addTestResult(
                    'Extension Integration Readiness',
                    true,
                    `Extension source files accessible (${foundPaths.length}/${extensionPaths.length} paths found)`,
                    {
                        foundPaths,
                        missingPaths,
                        recommendation: foundPaths.length < extensionPaths.length 
                            ? 'Some extension files not found - verify working directory'
                            : 'Ready for extension integration'
                    }
                );
            } else {
                await this.addWarning(
                    'Extension Integration Readiness',
                    'Extension source files not found in current directory',
                    {
                        foundPaths,
                        missingPaths,
                        currentDirectory: process.cwd(),
                        recommendation: 'Navigate to Roo extension root directory for integration testing'
                    }
                );
            }
        } catch (error) {
            await this.addTestResult(
                'Extension Integration Readiness',
                false,
                `Extension readiness check failed: ${error.message}`,
                { error: error.message }
            );
        }
    }

    async testEndToEndFlow() {
        this.log('Testing end-to-end message flow...');
        
        if (!this.extensionReady) {
            await this.addWarning(
                'End-to-End Flow',
                'Extension not connected - cannot test full end-to-end flow',
                {
                    recommendation: 'Start VS Code with Roo extension and implement setupRemoteUIListener()',
                    nextSteps: [
                        '1. Add IPC handler to ClineProvider.ts',
                        '2. Restart VS Code with extension',
                        '3. Re-run Phase 2 testing'
                    ]
                }
            );
            return;
        }
        
        try {
            // Test full message flow: Browser → CCS → IPC → Extension
            const testMessage = 'End-to-end test: Hello from mobile browser!';
            const postData = JSON.stringify({ message: testMessage });
            
            const response = await new Promise((resolve, reject) => {
                const options = {
                    hostname: 'localhost',
                    port: 3000,
                    path: '/send-message',
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Content-Length': Buffer.byteLength(postData)
                    }
                };

                const startTime = Date.now();
                const req = http.request(options, (res) => {
                    let data = '';
                    res.on('data', chunk => data += chunk);
                    res.on('end', () => {
                        const responseTime = Date.now() - startTime;
                        resolve({
                            statusCode: res.statusCode,
                            headers: res.headers,
                            data,
                            responseTime
                        });
                    });
                });

                req.on('error', reject);
                req.setTimeout(10000, () => {
                    req.destroy();
                    reject(new Error('Request timeout'));
                });

                req.write(postData);
                req.end();
            });

            if (response.statusCode === 200) {
                const responseData = JSON.parse(response.data);
                
                if (responseData.success) {
                    await this.addTestResult(
                        'End-to-End Flow',
                        true,
                        'Full end-to-end message flow successful',
                        {
                            statusCode: response.statusCode,
                            responseTime: response.responseTime,
                            testMessage,
                            responseData
                        }
                    );
                } else {
                    await this.addTestResult(
                        'End-to-End Flow',
                        false,
                        'Message sent but not processed successfully by extension',
                        { responseData }
                    );
                }
            } else {
                await this.addTestResult(
                    'End-to-End Flow',
                    false,
                    `End-to-end test returned status ${response.statusCode}`,
                    { statusCode: response.statusCode, data: response.data }
                );
            }
        } catch (error) {
            await this.addTestResult(
                'End-to-End Flow',
                false,
                `End-to-end flow test failed: ${error.message}`,
                { error: error.message }
            );
        }
    }

    async saveResults() {
        const resultsDir = path.join(__dirname, '../results/test-reports');
        const filename = `phase2-extension-integration-${Date.now()}.json`;
        const filepath = path.join(resultsDir, filename);
        
        // Calculate success rate
        this.results.summary.successRate = this.results.summary.total > 0 
            ? (this.results.summary.passed / this.results.summary.total * 100).toFixed(2)
            : 0;
        
        this.results.summary.completedAt = new Date().toISOString();
        
        try {
            await fs.promises.writeFile(filepath, JSON.stringify(this.results, null, 2));
            this.log(`Test results saved to: ${filepath}`, 'success');
            return filepath;
        } catch (error) {
            this.log(`Failed to save test results: ${error.message}`, 'error');
            throw error;
        }
    }

    async generateSummaryReport() {
        this.log('\n' + '='.repeat(60));
        this.log('PHASE 2 - ROO EXTENSION INTEGRATION TESTING SUMMARY');
        this.log('='.repeat(60));
        this.log(`Total Tests: ${this.results.summary.total}`);
        this.log(`Passed: ${this.results.summary.passed}`);
        this.log(`Failed: ${this.results.summary.failed}`);
        this.log(`Warnings: ${this.results.summary.warnings}`);
        this.log(`Success Rate: ${this.results.summary.successRate}%`);
        this.log('='.repeat(60));
        
        if (this.results.summary.failed > 0) {
            this.log('\nFAILED TESTS:');
            this.results.tests
                .filter(test => !test.passed)
                .forEach(test => {
                    this.log(`  - ${test.testName}: ${test.message}`, 'error');
                });
        }
        
        if (this.results.summary.warnings > 0) {
            this.log('\nWARNINGS:');
            this.results.tests
                .filter(test => test.warning)
                .forEach(test => {
                    this.log(`  - ${test.testName}: ${test.message}`, 'warning');
                });
        }
        
        this.log('\n');
    }

    async runAllTests() {
        this.log('Starting Phase 2 - Roo Extension Integration Testing...');
        
        try {
            // Test 1: Server Startup
            await this.startServer();
            
            // Test 2: Extension Detection
            await this.testExtensionDetection();
            
            // Test 3: IPC Connection Attempt
            await this.testIPCConnectionAttempt();
            
            // Test 4: Message Queuing
            await this.testMessageQueueing();
            
            // Test 5: Extension Integration Readiness
            await this.testExtensionIntegrationReadiness();
            
            // Test 6: End-to-End Flow (if extension is ready)
            await this.testEndToEndFlow();
            
            // Generate summary and save results
            await this.generateSummaryReport();
            const resultsFile = await this.saveResults();
            
            // Determine overall success
            const overallSuccess = this.results.summary.failed === 0;
            
            this.log(`\nPhase 2 Testing ${overallSuccess ? 'COMPLETED SUCCESSFULLY' : 'COMPLETED WITH ISSUES'}`, 
                     overallSuccess ? 'success' : 'warning');
            
            return {
                success: overallSuccess,
                results: this.results,
                resultsFile,
                extensionReady: this.extensionReady
            };
            
        } catch (error) {
            this.log(`Phase 2 testing failed with error: ${error.message}`, 'error');
            throw error;
        } finally {
            await this.stopServer();
        }
    }
}

// Main execution
async function main() {
    const tester = new Phase2Tester();
    
    try {
        const result = await tester.runAllTests();
        
        if (result.success) {
            if (result.extensionReady) {
                console.log('\n🎉 Phase 2 testing completed successfully!');
                console.log('✅ Extension integration working correctly');
                console.log('📋 Ready to proceed to Phase 3: Performance Testing');
            } else {
                console.log('\n⚠️ Phase 2 testing completed with warnings');
                console.log('🔧 Extension not connected - manual integration required');
                console.log('📋 See test results for integration instructions');
            }
            process.exit(0);
        } else {
            console.log('\n⚠️ Phase 2 testing completed with issues');
            console.log('❌ Some tests failed - review results before proceeding');
            console.log(`📄 Detailed results: ${result.resultsFile}`);
            process.exit(1);
        }
    } catch (error) {
        console.error('\n💥 Phase 2 testing failed:', error.message);
        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    main();
}

module.exports = Phase2Tester;
