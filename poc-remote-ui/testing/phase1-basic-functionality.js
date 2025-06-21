#!/usr/bin/env node

/**
 * TASK-002: Phase 1 - Basic Functionality Testing
 * 
 * This script tests the core PoC functionality:
 * - Server startup and health checks
 * - Web interface loading
 * - API endpoint functionality
 * - IPC communication setup
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

class Phase1Tester {
    constructor() {
        this.results = {
            timestamp: new Date().toISOString(),
            phase: 'Phase 1 - Basic Functionality Testing',
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
            req.setTimeout(5000, () => {
                req.destroy();
                reject(new Error('Request timeout'));
            });
        });
    }

    async startServer() {
        this.log('Starting CCS server for testing...');
        
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
                console.error('Server error:', data.toString());
            });

            // Wait for server to start
            setTimeout(async () => {
                try {
                    await this.makeRequest('/health');
                    this.log('CCS server started successfully');
                    resolve();
                } catch (error) {
                    reject(new Error(`Server failed to start: ${error.message}`));
                }
            }, 2000);
        });
    }

    async stopServer() {
        if (this.serverProcess) {
            this.log('Stopping CCS server...');
            this.serverProcess.kill();
            this.serverProcess = null;
        }
    }

    async testServerStartup() {
        this.log('Testing server startup...');
        
        try {
            await this.startServer();
            await this.addTestResult(
                'Server Startup',
                true,
                'CCS server started successfully on port 3000',
                { port: 3000, protocol: 'http' }
            );
        } catch (error) {
            await this.addTestResult(
                'Server Startup',
                false,
                `Server failed to start: ${error.message}`,
                { error: error.message }
            );
            throw error;
        }
    }

    async testHealthEndpoint() {
        this.log('Testing /health endpoint...');
        
        try {
            const response = await this.makeRequest('/health');
            
            if (response.statusCode === 200) {
                const healthData = JSON.parse(response.data);
                await this.addTestResult(
                    'Health Check Endpoint',
                    true,
                    'Health endpoint responds correctly',
                    {
                        statusCode: response.statusCode,
                        responseTime: response.responseTime,
                        healthData
                    }
                );
                
                if (response.responseTime > 100) {
                    await this.addWarning(
                        'Health Check Performance',
                        `Health endpoint response time is ${response.responseTime}ms (>100ms)`,
                        { responseTime: response.responseTime }
                    );
                }
            } else {
                await this.addTestResult(
                    'Health Check Endpoint',
                    false,
                    `Health endpoint returned status ${response.statusCode}`,
                    { statusCode: response.statusCode, data: response.data }
                );
            }
        } catch (error) {
            await this.addTestResult(
                'Health Check Endpoint',
                false,
                `Health endpoint request failed: ${error.message}`,
                { error: error.message }
            );
        }
    }

    async testStaticAssets() {
        this.log('Testing static asset loading...');
        
        const assets = [
            { path: '/', name: 'Main HTML Page' },
            { path: '/style.css', name: 'CSS Stylesheet' }
        ];

        for (const asset of assets) {
            try {
                const response = await this.makeRequest(asset.path);
                
                if (response.statusCode === 200) {
                    await this.addTestResult(
                        `Static Asset: ${asset.name}`,
                        true,
                        `${asset.name} loads successfully`,
                        {
                            path: asset.path,
                            statusCode: response.statusCode,
                            responseTime: response.responseTime,
                            contentLength: response.data.length
                        }
                    );
                } else {
                    await this.addTestResult(
                        `Static Asset: ${asset.name}`,
                        false,
                        `${asset.name} returned status ${response.statusCode}`,
                        { path: asset.path, statusCode: response.statusCode }
                    );
                }
            } catch (error) {
                await this.addTestResult(
                    `Static Asset: ${asset.name}`,
                    false,
                    `${asset.name} failed to load: ${error.message}`,
                    { path: asset.path, error: error.message }
                );
            }
        }
    }

    async testSendMessageEndpoint() {
        this.log('Testing /send-message endpoint...');
        
        const testMessage = 'Test message for Phase 1 validation';
        
        try {
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
                await this.addTestResult(
                    'Send Message Endpoint',
                    true,
                    'Send message endpoint accepts and processes requests',
                    {
                        statusCode: response.statusCode,
                        responseTime: response.responseTime,
                        testMessage,
                        responseData
                    }
                );
            } else {
                await this.addTestResult(
                    'Send Message Endpoint',
                    false,
                    `Send message endpoint returned status ${response.statusCode}`,
                    { statusCode: response.statusCode, data: response.data }
                );
            }
        } catch (error) {
            await this.addTestResult(
                'Send Message Endpoint',
                false,
                `Send message endpoint request failed: ${error.message}`,
                { error: error.message, testMessage }
            );
        }
    }

    async testErrorHandling() {
        this.log('Testing error handling...');
        
        const errorTests = [
            {
                name: 'Invalid JSON',
                path: '/send-message',
                method: 'POST',
                data: 'invalid json',
                expectedStatus: 400
            },
            {
                name: 'Missing Message Field',
                path: '/send-message',
                method: 'POST',
                data: JSON.stringify({ notMessage: 'test' }),
                expectedStatus: 400
            },
            {
                name: 'Non-existent Endpoint',
                path: '/nonexistent',
                method: 'GET',
                data: null,
                expectedStatus: 404
            }
        ];

        for (const test of errorTests) {
            try {
                const response = await new Promise((resolve, reject) => {
                    const options = {
                        hostname: 'localhost',
                        port: 3000,
                        path: test.path,
                        method: test.method
                    };

                    if (test.data) {
                        options.headers = {
                            'Content-Type': 'application/json',
                            'Content-Length': Buffer.byteLength(test.data)
                        };
                    }

                    const req = http.request(options, (res) => {
                        let data = '';
                        res.on('data', chunk => data += chunk);
                        res.on('end', () => {
                            resolve({
                                statusCode: res.statusCode,
                                data
                            });
                        });
                    });

                    req.on('error', reject);
                    req.setTimeout(5000, () => {
                        req.destroy();
                        reject(new Error('Request timeout'));
                    });

                    if (test.data) {
                        req.write(test.data);
                    }
                    req.end();
                });

                const passed = response.statusCode === test.expectedStatus;
                await this.addTestResult(
                    `Error Handling: ${test.name}`,
                    passed,
                    passed 
                        ? `Correctly returned status ${response.statusCode} for ${test.name}`
                        : `Expected status ${test.expectedStatus}, got ${response.statusCode}`,
                    {
                        testName: test.name,
                        expectedStatus: test.expectedStatus,
                        actualStatus: response.statusCode,
                        testData: test.data
                    }
                );
            } catch (error) {
                await this.addTestResult(
                    `Error Handling: ${test.name}`,
                    false,
                    `Error handling test failed: ${error.message}`,
                    { testName: test.name, error: error.message }
                );
            }
        }
    }

    async testIPCCommunication() {
        this.log('Testing IPC communication setup...');
        
        // Note: This is a basic test since we don't have the Roo extension running
        // We'll test that the IPC client can be created and attempts connection
        
        try {
            // Check if the server has IPC client setup
            const response = await this.makeRequest('/health');
            const healthData = JSON.parse(response.data);
            
            if (healthData.ipc) {
                await this.addTestResult(
                    'IPC Communication Setup',
                    true,
                    'IPC client is configured and attempting connection',
                    {
                        ipcStatus: healthData.ipc,
                        socketPath: healthData.socketPath || 'default'
                    }
                );
            } else {
                await this.addTestResult(
                    'IPC Communication Setup',
                    false,
                    'IPC client is not properly configured',
                    { healthData }
                );
            }
        } catch (error) {
            await this.addTestResult(
                'IPC Communication Setup',
                false,
                `IPC communication test failed: ${error.message}`,
                { error: error.message }
            );
        }
    }

    async saveResults() {
        const resultsDir = path.join(__dirname, '../results/test-reports');
        const filename = `phase1-basic-functionality-${Date.now()}.json`;
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
        this.log('PHASE 1 - BASIC FUNCTIONALITY TESTING SUMMARY');
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
        this.log('Starting Phase 1 - Basic Functionality Testing...');
        
        try {
            // Test 1: Server Startup
            await this.testServerStartup();
            
            // Test 2: Health Endpoint
            await this.testHealthEndpoint();
            
            // Test 3: Static Assets
            await this.testStaticAssets();
            
            // Test 4: Send Message Endpoint
            await this.testSendMessageEndpoint();
            
            // Test 5: Error Handling
            await this.testErrorHandling();
            
            // Test 6: IPC Communication
            await this.testIPCCommunication();
            
            // Generate summary and save results
            await this.generateSummaryReport();
            const resultsFile = await this.saveResults();
            
            // Determine overall success
            const overallSuccess = this.results.summary.failed === 0;
            
            this.log(`\nPhase 1 Testing ${overallSuccess ? 'COMPLETED SUCCESSFULLY' : 'COMPLETED WITH FAILURES'}`, 
                     overallSuccess ? 'success' : 'error');
            
            return {
                success: overallSuccess,
                results: this.results,
                resultsFile
            };
            
        } catch (error) {
            this.log(`Phase 1 testing failed with error: ${error.message}`, 'error');
            throw error;
        } finally {
            await this.stopServer();
        }
    }
}

// Main execution
async function main() {
    const tester = new Phase1Tester();
    
    try {
        const result = await tester.runAllTests();
        
        if (result.success) {
            console.log('\n🎉 Phase 1 testing completed successfully!');
            console.log('✅ All core functionality tests passed');
            console.log('📋 Ready to proceed to Phase 2: Roo Extension Integration');
            process.exit(0);
        } else {
            console.log('\n⚠️ Phase 1 testing completed with issues');
            console.log('❌ Some tests failed - review results before proceeding');
            console.log(`📄 Detailed results: ${result.resultsFile}`);
            process.exit(1);
        }
    } catch (error) {
        console.error('\n💥 Phase 1 testing failed:', error.message);
        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    main();
}

module.exports = Phase1Tester;
